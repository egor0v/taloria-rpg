/**
 * Solo game full test — tests complete single-player game flow
 * Usage: node scripts/testSoloGame.js
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function test() {
  await mongoose.connect(config.mongodbUri);
  console.log('=========================================');
  console.log('  SOLO GAME FULL TEST');
  console.log('=========================================\n');

  // --- Setup ---
  const user = await User.findOne({ email: 'test@taloria.ru' });
  if (!user) { console.error('Test user not found!'); process.exit(1); }

  const hero = await Hero.findOne({ userId: user._id });
  if (!hero) { console.error('Hero not found!'); process.exit(1); }

  // Give hero full HP/MP and some silver
  hero.hp = hero.maxHp;
  hero.mp = hero.maxMp;
  hero.silver = Math.max(hero.silver, 50);
  await hero.save();

  const token = jwt.sign(
    { userId: user._id, email: user.email, displayName: user.displayName },
    config.jwtSecret, { expiresIn: '1h' }
  );

  console.log(`Player: ${user.displayName}`);
  console.log(`Hero: ${hero.name} (${hero.race} ${hero.cls}) Lv${hero.level}`);
  console.log(`  HP: ${hero.hp}/${hero.maxHp} | MP: ${hero.mp}/${hero.maxMp}`);
  console.log(`  ATK:${hero.attack} AGI:${hero.agility} ARM:${hero.armor} INT:${hero.intellect}`);
  console.log(`  Gold:${hero.gold} Silver:${hero.silver}`);
  console.log(`  Inventory: ${hero.inventory.length} items`);

  // --- Create solo session ---
  console.log('\n=== 1. CREATE SOLO SESSION ===');
  const crypto = require('crypto');
  const session = await GameSession.create({
    scenarioId: 'forest-road-goblins',
    mapId: 'forest-road',
    hostUserId: user._id,
    inviteCode: crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6),
    maxPlayers: 1,
    status: 'lobby',
    players: [{
      userId: user._id,
      heroId: hero._id,
      displayName: user.displayName,
      connected: true,
      ready: true,
      role: 'host',
    }],
  });
  console.log(`Session: ${session._id} | Code: ${session.inviteCode}`);

  // --- Connect WebSocket ---
  console.log('\n=== 2. CONNECT WEBSOCKET ===');
  const sock = io(`${SERVER}/game`, {
    auth: { token, userId: user._id.toString(), displayName: user.displayName },
    reconnection: false,
  });

  const events = [];
  await new Promise(r => {
    sock.on('connect', () => { console.log('Connected ✅'); r(); });
    sock.on('connect_error', (e) => { console.log('Connection error:', e.message); r(); });
    setTimeout(r, 5000);
  });

  sock.onAny((event, data) => events.push({ event, data, time: Date.now() }));

  // --- Join session ---
  console.log('\n=== 3. JOIN SESSION ===');
  sock.emit('join-session', { sessionId: session._id.toString() });
  await sleep(1000);

  const joinEvents = events.filter(e => e.event === 'game-state' || e.event === 'error');
  console.log(`Received: ${joinEvents.map(e => e.event).join(', ')}`);

  // --- Start game ---
  console.log('\n=== 4. START GAME ===');
  events.length = 0;
  sock.emit('start-game', { sessionId: session._id.toString() });
  await sleep(3000);

  const startEvent = events.find(e => e.event === 'game-started');
  if (!startEvent) {
    const err = events.find(e => e.event === 'error');
    console.log('❌ Game start failed:', err?.data?.message || 'no response');
    sock.disconnect();
    await cleanup(session._id);
    process.exit(1);
  }

  const gs = startEvent.data.gameState;
  console.log('✅ Game started!');
  console.log(`  Mode: ${gs.mode}`);
  console.log(`  Map: ${gs.mapWidth}x${gs.mapHeight}`);
  console.log(`  Scenario: ${gs.scenario?.name}`);
  console.log(`  Heroes: ${gs.heroes?.length}`);
  console.log(`  Monsters: ${gs.monsters?.length}`);

  const myHero = gs.heroes[0];
  console.log(`  My hero: ${myHero.name} at (${myHero.x},${myHero.y})`);

  for (const m of gs.monsters) {
    console.log(`  Monster: ${m.name} at (${m.x},${m.y}) HP:${m.hp} discovered:${m.discovered}`);
  }

  // --- Test movement ---
  console.log('\n=== 5. MOVEMENT (explore) ===');
  let currentState = gs;

  // Move to adjacent cell
  const moveTarget = { x: myHero.x + 1, y: myHero.y };
  console.log(`Moving from (${myHero.x},${myHero.y}) to (${moveTarget.x},${moveTarget.y})`);

  events.length = 0;
  sock.emit('action-request', { type: 'move', x: moveTarget.x, y: moveTarget.y });
  await sleep(1000);

  const moveResult = events.find(e => e.event === 'action-result');
  const moveError = events.find(e => e.event === 'action-error');
  if (moveResult) {
    const r = moveResult.data.actionResult || moveResult.data.result;
    console.log(`✅ Moved! type=${r.type} to=(${r.to?.x},${r.to?.y})`);
    if (r.encounter) console.log(`  ⚠ Encounter! ${r.encounter.monsterName} at distance ${r.encounter.distance}`);
    currentState = moveResult.data.gameState || currentState;
  } else if (moveError) {
    console.log(`❌ Move error: ${moveError.data.message}`);
  }

  // Move a few more times
  for (let step = 0; step < 3; step++) {
    const h = currentState.heroes[0];
    const nx = h.x + 1;
    const ny = h.y;
    if (nx >= currentState.mapWidth) break;

    events.length = 0;
    sock.emit('action-request', { type: 'end-turn' });
    await sleep(300);
    sock.emit('action-request', { type: 'move', x: nx, y: ny });
    await sleep(500);

    const mr = events.find(e => e.event === 'action-result' && (e.data.actionResult?.type === 'move' || e.data.result?.type === 'move'));
    if (mr) {
      currentState = mr.data.gameState || currentState;
      const ar = mr.data.actionResult || mr.data.result;
      console.log(`  Step ${step+1}: moved to (${ar.to?.x},${ar.to?.y})${ar.encounter ? ' ⚠ ENCOUNTER: ' + ar.encounter.monsterName : ''}`);
    } else {
      const err = events.find(e => e.event === 'action-error');
      console.log(`  Step ${step+1}: ${err ? err.data.message : 'no result'}`);
    }
  }

  // --- Test search ---
  console.log('\n=== 6. SEARCH ACTION ===');
  events.length = 0;
  sock.emit('action-request', { type: 'end-turn' });
  await sleep(300);
  sock.emit('action-request', { type: 'search' });
  await sleep(1000);

  const searchResult = events.find(e => e.event === 'action-result' && (e.data.actionResult?.type === 'search' || e.data.result?.type === 'search'));
  if (searchResult) {
    const sr = searchResult.data.actionResult || searchResult.data.result;
    console.log(`✅ Search: success=${sr.success} roll=${sr.roll} radius=${sr.radius} discovered=${sr.discovered?.length || 0}`);
  } else {
    const err = events.find(e => e.event === 'action-error');
    console.log(`❌ Search: ${err?.data?.message || 'no result'}`);
  }

  // --- Test use item ---
  console.log('\n=== 7. USE ITEM ===');
  events.length = 0;
  sock.emit('action-request', { type: 'end-turn' });
  await sleep(300);

  // Check if hero has any usable items
  const heroNow = currentState.heroes[0];
  const usableItem = heroNow.inventory?.find(i => i.usable);
  if (usableItem) {
    sock.emit('action-request', { type: 'use-item', itemId: usableItem.itemId });
    await sleep(1000);
    const useResult = events.find(e => e.event === 'action-result');
    if (useResult) {
      const ur = useResult.data.actionResult || useResult.data.result;
      console.log(`✅ Used ${usableItem.name}: effect=${JSON.stringify(ur.effect || {})}`);
      currentState = useResult.data.gameState || currentState;
    }
  } else {
    console.log('No usable items in inventory, skipping');
  }

  // --- Test chat (solo) ---
  console.log('\n=== 8. SOLO CHAT ===');
  events.length = 0;
  sock.emit('chat-message', { text: 'Тест чата в одиночной игре' });
  await sleep(500);
  const chatMsg = events.find(e => e.event === 'chat-message');
  console.log(chatMsg ? `✅ Chat: ${chatMsg.data.displayName}: ${chatMsg.data.text}` : '❌ No chat response');

  // --- Test save & verify DB ---
  console.log('\n=== 9. SAVE GAME ===');
  events.length = 0;
  sock.emit('save-game', { gameState: currentState });
  await sleep(2000);

  const savedSession = await GameSession.findById(session._id);
  console.log(`DB status: ${savedSession.status}`);
  console.log(`DB gameState exists: ${!!savedSession.gameState}`);
  if (savedSession.gameState) {
    console.log(`  Mode: ${savedSession.gameState.mode}`);
    console.log(`  Heroes: ${savedSession.gameState.heroes?.length || 0}`);
  }

  // --- Test fog of war state ---
  console.log('\n=== 10. FOG OF WAR ===');
  const fog = currentState.fog;
  if (fog) {
    let visible = 0, explored = 0, hidden = 0;
    for (const row of fog) {
      for (const cell of row) {
        if (cell === 2) visible++;
        else if (cell === 1) explored++;
        else hidden++;
      }
    }
    console.log(`  Visible: ${visible} | Explored: ${explored} | Hidden: ${hidden} | Total: ${visible+explored+hidden}`);
  } else {
    console.log('  No fog data');
  }

  // --- Test end session ---
  console.log('\n=== 11. END SESSION (abandon) ===');
  savedSession.status = 'abandoned';
  await savedSession.save();
  console.log('Session status: abandoned ✅');

  // Check stats
  const stats = await GameSession.aggregate([
    { $match: { 'players.userId': user._id } },
    { $group: {
      _id: null,
      total: { $sum: 1 },
      completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      abandoned: { $sum: { $cond: [{ $eq: ['$status', 'abandoned'] }, 1, 0] } },
      playing: { $sum: { $cond: [{ $eq: ['$status', 'playing'] }, 1, 0] } },
    }},
  ]);
  const s = stats[0] || {};
  console.log(`Stats: total=${s.total} playing=${s.playing} completed=${s.completed} abandoned=${s.abandoned}`);

  // --- Cleanup ---
  sock.disconnect();
  await mongoose.disconnect();

  console.log('\n=========================================');
  console.log('  SOLO GAME TEST COMPLETE ✅');
  console.log('=========================================');
  process.exit(0);
}

async function cleanup(sessionId) {
  await GameSession.findByIdAndDelete(sessionId);
  await mongoose.disconnect();
}

test().catch(err => { console.error('Test error:', err); process.exit(1); });
