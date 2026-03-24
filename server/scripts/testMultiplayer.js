/**
 * Multiplayer test script — tests WebSocket game + chat
 * Usage: node scripts/testMultiplayer.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { io } = require('socket.io-client');
const mongoose = require('mongoose');
const config = require('../config');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Hero = require('../models/Hero');
const GameSession = require('../models/GameSession');

const SERVER = 'http://localhost:3000';

async function test() {
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB\n');

  // Get test users
  const users = await User.find({ email: { $in: ['test@taloria.ru', 'player2@taloria.ru', 'player3@taloria.ru', 'player4@taloria.ru'] } }).lean();
  if (users.length < 4) { console.error('Need 4 test users!'); process.exit(1); }

  const tokens = users.map(u => jwt.sign(
    { userId: u._id, email: u.email, displayName: u.displayName },
    config.jwtSecret,
    { expiresIn: '1h' }
  ));

  const heroes = [];
  for (const u of users) {
    const h = await Hero.findOne({ userId: u._id }).lean();
    heroes.push(h);
  }

  // Find playing session
  let session = await GameSession.findOne({ status: 'playing', 'players.userId': users[0]._id }).sort({ updatedAt: -1 });
  if (!session) {
    console.log('No playing session found, creating new one...');
    const crypto = require('crypto');
    session = await GameSession.create({
      scenarioId: 'forest-road-goblins',
      mapId: 'forest-road',
      hostUserId: users[0]._id,
      inviteCode: crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6),
      maxPlayers: 4,
      status: 'playing',
      players: users.map((u, i) => ({
        userId: u._id,
        heroId: heroes[i]?._id,
        displayName: u.displayName,
        connected: false,
        ready: true,
        role: i === 0 ? 'host' : 'player',
      })),
    });
  }

  console.log(`Session: ${session._id} | Status: ${session.status} | Players: ${session.players.length}`);
  console.log(`Players: ${session.players.map(p => p.displayName).join(', ')}\n`);

  // --- Connect 4 game sockets ---
  console.log('=== Connecting 4 game sockets ===');
  const sockets = [];
  const received = { 0: [], 1: [], 2: [], 3: [] };

  for (let i = 0; i < 4; i++) {
    const sock = io(`${SERVER}/game`, {
      auth: {
        token: tokens[i],
        userId: users[i]._id.toString(),
        displayName: users[i].displayName,
      },
      reconnection: false,
      timeout: 5000,
    });

    await new Promise((resolve, reject) => {
      sock.on('connect', () => {
        console.log(`  ✅ Player ${i+1} (${users[i].displayName}) connected`);
        resolve();
      });
      sock.on('connect_error', (err) => {
        console.log(`  ❌ Player ${i+1} connection error: ${err.message}`);
        resolve();
      });
      setTimeout(resolve, 3000);
    });

    // Listen for events
    sock.onAny((event, data) => {
      received[i].push({ event, data });
    });

    sockets.push(sock);
  }

  // --- Join session ---
  console.log('\n=== All players join session ===');
  for (let i = 0; i < 4; i++) {
    sockets[i].emit('join-session', { sessionId: session._id.toString() });
  }
  await sleep(2000);

  // Check received events
  for (let i = 0; i < 4; i++) {
    const events = received[i].map(r => r.event);
    console.log(`  Player ${i+1} received: ${events.join(', ') || 'nothing'}`);
  }

  // --- Test chat ---
  console.log('\n=== Test multiplayer chat ===');
  // Clear received
  for (let i = 0; i < 4; i++) received[i] = [];

  sockets[0].emit('chat-message', { text: 'Всем привет! Готовы к бою?' });
  await sleep(500);
  sockets[1].emit('chat-message', { text: 'Мой топор готов!' });
  await sleep(500);
  sockets[2].emit('chat-message', { text: 'Песнь вдохновения звучит!' });
  await sleep(500);
  sockets[3].emit('chat-message', { text: 'Да хранит нас Свет!' });
  await sleep(1000);

  for (let i = 0; i < 4; i++) {
    const chatMsgs = received[i].filter(r => r.event === 'chat-message');
    console.log(`  Player ${i+1} got ${chatMsgs.length} chat messages:`);
    for (const m of chatMsgs) {
      console.log(`    💬 ${m.data.displayName}: ${m.data.text}`);
    }
  }

  // --- Test game actions (start game) ---
  console.log('\n=== Host starts game (game initialization) ===');
  for (let i = 0; i < 4; i++) received[i] = [];

  sockets[0].emit('start-game', { sessionId: session._id.toString() });
  await sleep(3000);

  // Check game-started events
  for (let i = 0; i < 4; i++) {
    const started = received[i].filter(r => r.event === 'game-started');
    const gameState = started[0]?.data?.gameState;
    if (gameState) {
      console.log(`  Player ${i+1}: game-started ✅ | Heroes: ${gameState.heroes?.length || 0} | Monsters: ${gameState.monsters?.length || 0} | Mode: ${gameState.mode}`);
    } else {
      const errors = received[i].filter(r => r.event === 'error');
      console.log(`  Player ${i+1}: ${errors.length ? '❌ ' + errors[0].data.message : 'no game-started event'}`);
    }
  }

  // --- Test movement ---
  console.log('\n=== Test player movement ===');
  for (let i = 0; i < 4; i++) received[i] = [];

  // Player 1 moves
  sockets[0].emit('action-request', { type: 'move', x: 3, y: 8 });
  await sleep(1000);

  for (let i = 0; i < 4; i++) {
    const results = received[i].filter(r => r.event === 'action-result');
    if (results.length) {
      const r = results[0].data;
      console.log(`  Player ${i+1} received action-result: type=${r.result?.type || r.actionResult?.type || '?'}`);
    }
    const errors = received[i].filter(r => r.event === 'action-error');
    if (errors.length) console.log(`  Player ${i+1} error: ${errors[0].data.message}`);
  }

  // --- Test end turn ---
  console.log('\n=== Test end turn ===');
  for (let i = 0; i < 4; i++) received[i] = [];

  sockets[0].emit('action-request', { type: 'end-turn' });
  await sleep(1000);

  for (let i = 0; i < 4; i++) {
    const results = received[i].filter(r => r.event === 'action-result');
    if (results.length) {
      const r = results[0].data;
      const ar = r.result || r.actionResult || {};
      console.log(`  Player ${i+1}: end-turn ✅ | round=${ar.round} turnIdx=${ar.turnIdx}`);
    }
  }

  // --- Test save ---
  console.log('\n=== Test save game ===');
  for (let i = 0; i < 4; i++) received[i] = [];

  sockets[0].emit('save-game', { gameState: null });
  await sleep(1000);

  const savedResults = received[0].filter(r => r.event === 'game-saved');
  console.log(`  Save result: ${savedResults.length ? '✅ saved' : '❌ no confirmation'}`);

  // --- Test disconnect/reconnect ---
  console.log('\n=== Test player disconnect ===');
  for (let i = 0; i < 4; i++) received[i] = [];

  sockets[2].disconnect(); // Player 3 disconnects
  await sleep(1000);

  // Check if others got disconnect notification
  for (let i of [0, 1, 3]) {
    const disconnects = received[i].filter(r => r.event === 'player-disconnected');
    if (disconnects.length) {
      console.log(`  Player ${i+1} notified: ${disconnects[0].data.displayName} disconnected ✅`);
    }
  }

  // --- Cleanup ---
  console.log('\n=== Cleanup ===');
  for (const s of sockets) s.disconnect();
  await mongoose.disconnect();

  console.log('\n===========================================');
  console.log('  ALL MULTIPLAYER TESTS COMPLETE ✅');
  console.log('===========================================');
  process.exit(0);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

test().catch(err => { console.error(err); process.exit(1); });
