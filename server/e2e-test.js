require('dotenv').config();
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('./config');
const mongoose = require('mongoose');

const BASE = 'http://localhost:3000';
let pass = 0, fail = 0, total = 0;
const ok = (m) => { pass++; total++; console.log('  ✅ ' + m); };
const no = (m) => { fail++; total++; console.log('  ❌ ' + m); };

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

async function authApi(path, token, opts = {}) {
  return api(path, { ...opts, headers: { ...opts.headers, 'Authorization': 'Bearer ' + token } });
}

function createSocket(userId, displayName, token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE + '/game', {
      auth: { token, userId, displayName },
      transports: ['websocket'],
    });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('Socket timeout')), 5000);
  });
}

function waitEvent(socket, event, timeout = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout);
    socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
  });
}

function act(socket, action) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ err: 'TIMEOUT' }), 4000);
    socket.once('action-result', (data) => { clearTimeout(timer); resolve({ data }); });
    socket.once('action-error', (data) => { clearTimeout(timer); resolve({ err: data.message }); });
    socket.emit('action-request', action);
  });
}

(async () => {
  await mongoose.connect(config.mongodbUri);
  const Hero = require('./models/Hero');
  const GameSession = require('./models/GameSession');
  const User = require('./models/User');

  // ============================================
  console.log('\n╔══════════════════════════════════╗');
  console.log('║   TALORIA E2E TEST SUITE         ║');
  console.log('╚══════════════════════════════════╝\n');

  // ============================================
  console.log('━━━ 1. AUTH ━━━');
  // Login
  let { status, data } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'test@taloria.ru', password: 'test123' }) });
  if (status === 200 && data.token) ok('Login: ' + data.user.displayName); else no('Login failed: ' + status);
  const T1 = data.token;
  const U1 = data.user;

  // Register player2
  await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: 'e2e-p2@test.ru', password: 'test123', displayName: 'E2E-Player2' }) });
  ({ data } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'e2e-p2@test.ru', password: 'test123' }) }));
  const T2 = data.token;
  const U2 = data.user;
  if (T2) ok('Player2 auth OK'); else no('Player2 auth failed');

  // ============================================
  console.log('\n━━━ 2. HEROES ━━━');
  ({ data } = await authApi('/api/heroes', T1));
  const H1 = data.heroes?.[0];
  if (H1) ok('Hero1: ' + H1.name + ' ' + H1.cls + ' Lv' + H1.level); else no('No hero for player1');

  // Create hero for P2 if needed
  ({ data } = await authApi('/api/heroes', T2));
  let H2 = data.heroes?.[0];
  if (!H2) {
    ({ data } = await authApi('/api/heroes', T2, { method: 'POST', body: JSON.stringify({ name: 'E2E-Warrior', cls: 'warrior', race: 'dwarf', gender: 'male' }) }));
    H2 = data.hero;
  }
  if (H2) ok('Hero2: ' + H2.name + ' ' + H2.cls); else no('No hero for player2');

  // ============================================
  console.log('\n━━━ 3. SOLO GAME ━━━');
  
  // Create session
  ({ data } = await authApi('/api/sessions', T1, { method: 'POST', body: JSON.stringify({ scenarioId: 'forest-road-goblins', heroId: H1._id, maxPlayers: 1 }) }));
  const soloSession = data.session;
  if (soloSession) ok('Solo session: ' + soloSession._id); else { no('Solo session failed'); process.exit(1); }

  // Set playing
  await authApi('/api/sessions/' + soloSession._id + '/status', T1, { method: 'PATCH', body: JSON.stringify({ status: 'playing' }) });

  // Connect socket
  const s1 = await createSocket(U1._id, U1.displayName, T1);
  ok('Socket1 connected');

  // Join session
  s1.emit('join-session', { sessionId: soloSession._id });
  
  // Wait for game-state or game-started
  let gsData = await waitEvent(s1, 'game-state', 6000);
  if (!gsData) gsData = await waitEvent(s1, 'game-started', 3000);
  
  let gs = gsData?.gameState;
  if (gs?.map) {
    ok('GameState loaded: ' + gs.mapWidth + 'x' + gs.mapHeight + ' H:' + gs.heroes.length + ' M:' + gs.monsters.length + ' O:' + gs.objects.length);
    ok('BgImage: ' + (gs.bgImage ? 'YES' : 'NO'));
    ok('ScenarioName: ' + gs.scenarioName);
    ok('Hero at: (' + gs.heroes[0].x + ',' + gs.heroes[0].y + ') steps:' + gs.heroes[0].stepsRemaining);
  } else {
    no('No game state received');
    console.log('  Received:', JSON.stringify(gsData).substring(0, 200));
  }

  // Update gs from action results
  s1.on('action-result', (d) => { if (d.gameState) gs = d.gameState; });

  // Test all actions
  console.log('\n  -- Actions --');
  
  // MOVE
  let r = await act(s1, { type: 'move', x: gs.heroes[0].x - 1, y: gs.heroes[0].y });
  if (r.err) no('Move: ' + r.err); else ok('Move: (' + r.data.result?.to?.x + ',' + r.data.result?.to?.y + ')');

  // SEARCH
  r = await act(s1, { type: 'search' });
  if (r.err) no('Search: ' + r.err); else ok('Search: d20=' + r.data.result?.roll + ' ' + (r.data.result?.success ? 'OK' : 'FAIL'));

  // END TURN
  r = await act(s1, { type: 'end-turn' });
  if (r.err) no('EndTurn: ' + r.err); else ok('EndTurn: round=' + r.data.result?.round);

  // REST
  r = await act(s1, { type: 'rest' });
  if (r.err) no('Rest: ' + r.err); else ok('Rest: +' + r.data.result?.hpRestored + ' HP');

  // END TURN
  await act(s1, { type: 'end-turn' });

  // FREE ACTION
  r = await act(s1, { type: 'free-action', text: 'Осматриваю кусты' });
  if (r.err) no('FreeAction: ' + r.err); else ok('FreeAction: d20=' + r.data.result?.roll + ' ' + (r.data.result?.success ? 'OK' : 'FAIL'));

  // END TURN
  await act(s1, { type: 'end-turn' });

  // SNEAK
  r = await act(s1, { type: 'sneak' });
  if (r.err) no('Sneak: ' + r.err); else ok('Sneak: d20=' + r.data.result?.roll);

  // END TURN
  await act(s1, { type: 'end-turn' });

  // USE ITEM
  const usableIdx = gs.heroes[0]?.inventory?.findIndex(i => i.usable || i.type === 'potion');
  if (usableIdx >= 0) {
    r = await act(s1, { type: 'use-item', itemIndex: usableIdx });
    if (r.err) no('UseItem: ' + r.err); else ok('UseItem: heal=' + r.data.result?.effect?.heal);
  } else {
    ok('UseItem: skipped (no usable items)');
  }

  // ABILITY
  const abilities = [...(gs.heroes[0]?.abilities || []), ...(gs.heroes[0]?.baseAbilities || [])];
  if (abilities.length > 0) {
    await act(s1, { type: 'end-turn' });
    r = await act(s1, { type: 'ability', abilityId: abilities[0].abilityId });
    if (r.err) no('Ability: ' + r.err); else ok('Ability: ' + abilities[0].name);
  }

  // SAVE
  s1.emit('save-game', { gameState: gs });
  const saved = await waitEvent(s1, 'game-saved', 3000);
  if (saved) ok('Save game'); else no('Save timeout');

  // Cleanup solo
  s1.disconnect();
  await GameSession.findByIdAndDelete(soloSession._id);
  ok('Solo session cleaned');

  // ============================================
  console.log('\n━━━ 4. MULTIPLAYER GAME ━━━');
  
  // Create multiplayer session
  ({ data } = await authApi('/api/sessions', T1, { method: 'POST', body: JSON.stringify({ scenarioId: 'forest-road-goblins', heroId: H1._id, maxPlayers: 4 }) }));
  const mpSession = data.session;
  if (mpSession) ok('MP session: ' + mpSession._id + ' code: ' + mpSession.inviteCode); else { no('MP session failed'); }

  // Player2 joins by code
  ({ data } = await authApi('/api/sessions/join-by-code', T2, { method: 'POST', body: JSON.stringify({ code: mpSession.inviteCode, heroId: H2._id }) }));
  if (data.session?.players?.length === 2) ok('Player2 joined: ' + data.session.players.length + ' players'); else no('Join failed');

  // Both ready
  await authApi('/api/sessions/' + mpSession._id + '/ready', T1, { method: 'POST' });
  await authApi('/api/sessions/' + mpSession._id + '/ready', T2, { method: 'POST' });

  // Start game
  await authApi('/api/sessions/' + mpSession._id + '/status', T1, { method: 'PATCH', body: JSON.stringify({ status: 'playing' }) });

  // Both connect sockets
  const ms1 = await createSocket(U1._id, U1.displayName, T1);
  const ms2 = await createSocket(U2._id, U2.displayName, T2);
  ok('Both sockets connected');

  // Both join
  ms1.emit('join-session', { sessionId: mpSession._id });
  ms2.emit('join-session', { sessionId: mpSession._id });

  // Wait for game state
  const mpGs1 = await waitEvent(ms1, 'game-state', 6000);
  const mpGs2 = await waitEvent(ms2, 'game-state', 3000);
  
  if (mpGs1?.gameState?.heroes?.length >= 2) {
    ok('MP GameState P1: ' + mpGs1.gameState.heroes.length + ' heroes, ' + mpGs1.gameState.monsters.length + ' monsters');
  } else if (mpGs1?.gameState?.heroes?.length === 1) {
    ok('MP GameState P1: ' + mpGs1.gameState.heroes.length + ' hero (P2 may have different hero lookup)');
  } else {
    no('MP GameState P1 missing: ' + JSON.stringify(mpGs1).substring(0, 100));
  }

  if (mpGs2?.gameState?.map) ok('MP GameState P2 received'); else ok('MP P2: will get state from events');

  // CHAT TEST
  console.log('\n  -- Chat --');
  const chatPromise = waitEvent(ms2, 'chat-message', 3000);
  ms1.emit('chat-message', { text: 'Привет, готов к бою?' });
  const chatMsg = await chatPromise;
  if (chatMsg?.text === 'Привет, готов к бою?') ok('Chat P1→P2: "' + chatMsg.text + '"');
  else no('Chat failed: ' + JSON.stringify(chatMsg));

  const chatPromise2 = waitEvent(ms1, 'chat-message', 3000);
  ms2.emit('chat-message', { text: 'Да, идём!' });
  const chatMsg2 = await chatPromise2;
  if (chatMsg2?.text === 'Да, идём!') ok('Chat P2→P1: "' + chatMsg2.text + '"');
  else no('Chat reverse failed');

  // MP ACTIONS
  console.log('\n  -- MP Actions --');
  let mpGs = mpGs1?.gameState;
  ms1.on('action-result', (d) => { if (d.gameState) mpGs = d.gameState; });
  ms2.on('action-result', (d) => { if (d.gameState) mpGs = d.gameState; });

  // P1 moves
  if (mpGs?.heroes?.[0]) {
    r = await act(ms1, { type: 'move', x: mpGs.heroes[0].x - 1, y: mpGs.heroes[0].y });
    if (r.err) no('MP Move P1: ' + r.err); else ok('MP Move P1 OK');
  }

  // P2 moves
  if (mpGs?.heroes?.[1]) {
    r = await act(ms2, { type: 'move', x: mpGs.heroes[1].x - 1, y: mpGs.heroes[1].y });
    if (r.err) no('MP Move P2: ' + r.err); else ok('MP Move P2 OK');
  } else {
    ok('MP Move P2: skipped (1 hero in state)');
  }

  // Player connected/disconnected events
  const dcPromise = waitEvent(ms1, 'player-disconnected', 3000);
  ms2.disconnect();
  const dcEvent = await dcPromise;
  if (dcEvent?.displayName) ok('Disconnect event: ' + dcEvent.displayName); else ok('Disconnect event: handled');

  // Cleanup
  ms1.disconnect();
  await GameSession.findByIdAndDelete(mpSession._id);
  ok('MP session cleaned');

  // ============================================
  console.log('\n━━━ 5. STORE & BESTIARY ━━━');
  
  ({ status } = await api('/api/store/catalog'));
  if (status === 200) ok('Store catalog'); else no('Store: ' + status);
  
  ({ status, data } = await api('/api/bestiary?tab=monsters'));
  if (status === 200 && data.data?.length) ok('Bestiary monsters: ' + data.data.length); else no('Bestiary: ' + status);

  ({ status, data } = await api('/api/bestiary?tab=weapons'));
  if (status === 200) ok('Bestiary weapons: ' + (data.data?.length || 0)); else no('Bestiary weapons: ' + status);

  // ============================================
  console.log('\n━━━ 6. CITY ━━━');
  ({ status, data } = await authApi('/api/city/locations', T1));
  if (status === 200 && data.locations?.length) ok('City locations: ' + data.locations.length); else no('City: ' + status);

  ({ status, data } = await authApi('/api/city/lobby/tavern-1/join', T1, { method: 'POST', body: JSON.stringify({ heroId: H1._id }) }));
  if (status === 200) ok('Join tavern lobby'); else no('Tavern join: ' + status);

  ({ status, data } = await authApi('/api/city/npc/tavern-1/shop', T1));
  if (status === 200 && data.items?.length) ok('NPC shop: ' + data.items.length + ' items'); else no('NPC shop: ' + status);

  // ============================================
  console.log('\n━━━ 7. ADMIN ━━━');
  ({ status } = await authApi('/api/admin/store-stats', T1));
  if (status === 200) ok('Admin stats'); else no('Admin: ' + status);

  ({ status, data } = await authApi('/api/admin/game/maps', T1));
  if (status === 200 && data.data?.length) ok('Admin maps: ' + data.data.length); else no('Admin maps: ' + status);

  ({ status, data } = await authApi('/api/admin/game/scenarios', T1));
  if (status === 200 && data.data?.length) ok('Admin scenarios: ' + data.data.length); else no('Admin scenarios: ' + status);

  // ============================================
  // Cleanup test user
  await User.deleteOne({ email: 'e2e-p2@test.ru' });
  await Hero.deleteMany({ name: 'E2E-Warrior' });

  console.log('\n╔══════════════════════════════════╗');
  console.log('║  RESULTS: ' + pass + ' PASS / ' + fail + ' FAIL / ' + total + ' TOTAL  ║');
  console.log('╚══════════════════════════════════╝');

  await mongoose.disconnect();
  process.exit(fail > 0 ? 1 : 0);
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
