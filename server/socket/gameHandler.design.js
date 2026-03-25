'use strict';

const GameSession = require('../models/GameSession');
const GameEngine = require('../game/GameEngine');
const { GAME_NARRATIONS_KEEP_LIMIT } = require('../constants');

// ============================================================
// IN-MEMORY STATE
// ============================================================

// Active game states: sessionId → gameState
const activeGames = new Map();

// Active engine instances: sessionId → GameEngine
const activeEngines = new Map();

// Circular event buffer for reconnection: sessionId → Array (last 20 events)
const eventBuffers = new Map();
const EVENT_BUFFER_SIZE = 20;

// Debounced DB save timers: sessionId → timeout
const saveTimers = new Map();
const DB_SAVE_INTERVAL = 5000; // 5 seconds

// ============================================================
// HELPERS
// ============================================================

function pushEvent(sessionId, event) {
  if (!eventBuffers.has(sessionId)) {
    eventBuffers.set(sessionId, []);
  }
  const buf = eventBuffers.get(sessionId);
  buf.push({ ...event, timestamp: Date.now() });
  if (buf.length > EVENT_BUFFER_SIZE) {
    buf.shift();
  }
}

function getEngine(sessionId) {
  const gs = activeGames.get(sessionId);
  if (!gs) return null;

  // Reuse or create engine (without player data — for backward compat)
  let engine = activeEngines.get(sessionId);
  if (!engine || engine.gs !== gs) {
    engine = new GameEngine(gs, sessionId);
    activeEngines.set(sessionId, engine);
  }
  return engine;
}

async function getEngineWithPlayers(sessionId) {
  const gs = activeGames.get(sessionId);
  if (!gs) return null;

  let engine = activeEngines.get(sessionId);
  if (!engine || engine.gs !== gs) {
    // Load session players for _ownerId assignment
    const session = await GameSession.findById(sessionId).lean();
    const players = session ? session.players : [];
    engine = new GameEngine(gs, sessionId, players);
    activeEngines.set(sessionId, engine);
  }
  return engine;
}

/**
 * Advance explore turn to next connected, living hero.
 * Reusable from action-request and disconnect handler.
 * @param {string} sessionId
 * @param {Object} io - Socket.io server
 * @param {string} triggeredBy - who triggered ('end-turn' | 'disconnect')
 * @param {string|null} triggerUserId - userId who triggered (for action-result)
 * @returns {Object|null} result or null if no game
 */
async function advanceExploreTurn(sessionId, io, triggeredBy, triggerUserId) {
  const gs = activeGames.get(sessionId);
  if (!gs || gs.mode === 'combat') return null;

  const session = await GameSession.findById(sessionId).lean();
  const players = session ? session.players : [];

  // Assign _ownerId to heroes if missing
  if (players.length > 0 && gs.heroes) {
    gs.heroes.forEach(h => {
      if (h._ownerId) return;
      const pl = players.find(p => {
        if (!p.heroId) return false;
        const hid = p.heroId.toString();
        return hid === h.id || hid === h._serverId;
      });
      if (pl) h._ownerId = pl.userId.toString();
    });
  }

  const currentIdx = gs.activeHeroIdx || 0;

  // Advance to next LIVING and CONNECTED hero
  let nextIdx = currentIdx;
  let tries = 0;
  do {
    nextIdx = (nextIdx + 1) % gs.heroes.length;
    tries++;
    const h = gs.heroes[nextIdx];
    if (!h || h.dead || h.leftGame || h.hp <= 0) continue;
    // Check owner connected
    const owner = players.find(p => p.userId.toString() === h._ownerId);
    const isConnected = owner ? owner.connected !== false : true;
    if (isConnected) break;
    console.log(`⏭️ Skipping disconnected hero: ${h.name}`);
  } while (tries < gs.heroes.length);

  gs.activeHeroIdx = nextIdx;
  gs.moveUsed = false;
  gs.actionUsed = false;
  gs.bonusActionUsed = false;

  const nextHero = gs.heroes[nextIdx];

  // Calculate reachableCells and moveRange on server
  let reachableCells = [];
  let moveRange = 2;
  if (nextHero) {
    const tempEngine = new GameEngine(gs, sessionId, players);
    moveRange = tempEngine.getEffectiveMoveRange(nextHero);
    reachableCells = tempEngine.getReachableCells(nextHero.row, nextHero.col, moveRange, nextHero.id);
    gs.reachableCells = reachableCells;
    gs.movePointsLeft = moveRange;
  }

  const result = {
    type: 'turn_started',
    entityId: nextHero ? nextHero.id : null,
    entityType: 'hero',
    ownerId: nextHero ? nextHero._ownerId : null,
    mode: 'explore',
    reachableCells,
    moveRange,
  };

  activeGames.set(sessionId, gs);
  pushEvent(sessionId, { type: 'turn_started', entityId: result.entityId });

  io.to(`session:${sessionId}`).emit('action-result', {
    action: { type: 'end-turn', auto: triggeredBy === 'disconnect' },
    result,
    gameState: gs,
    userId: triggerUserId || null,
  });

  debouncedSave(sessionId, gs);
  console.log(`🔄 Explore ${triggeredBy}: next hero = ${nextHero?.name} (owner: ${nextHero?._ownerId})`);
  return result;
}

/**
 * Recursively send chained turn results (consecutive monster turns, combat end)
 * Each link in the chain is delayed for client animation
 */
function sendChainedResult(io, sessionId, engine, result, delay) {
  setTimeout(() => {
    const payload = {
      action: { type: 'auto-turn' },
      result,
      gameState: engine.gs,
      actionLog: engine.getActionLog(),
    };
    pushEvent(sessionId, { type: result.type, ...result });
    io.to(`session:${sessionId}`).emit('action-result', payload);
    activeGames.set(sessionId, engine.gs);
    debouncedSave(sessionId, engine.gs);

    // Recurse: if this result has a next turn (another monster), continue chain
    if (result.type === 'monster_action' && result.nextTurn) {
      sendChainedResult(io, sessionId, engine, result.nextTurn, 800);
    }
    // If combat ended in the chain
    if (result.type === 'combat_ended') {
      io.to(`session:${sessionId}`).emit('match-ended', {
        result: result.result,
        summary: result.summary,
        matchStats: result.matchStats,
      });
    }
  }, delay);
}

function debouncedSave(sessionId, gameState) {
  if (saveTimers.has(sessionId)) {
    clearTimeout(saveTimers.get(sessionId));
  }
  saveTimers.set(sessionId, setTimeout(async () => {
    try {
      await GameSession.findByIdAndUpdate(sessionId, {
        gameState,
        status: 'playing',
      });
      console.log(`💾 Game state saved: ${sessionId}`);
    } catch (err) {
      console.error('DB save error:', err);
    }
    saveTimers.delete(sessionId);
  }, DB_SAVE_INTERVAL));
}

// ============================================================
// MAIN HANDLER
// ============================================================

function gameHandler(io, socket) {

  // --- Join a game session ---
  socket.on('join-session', async ({ sessionId }) => {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) {
        return socket.emit('error', { message: 'Сессия не найдена' });
      }

      const player = session.players.find(p => p.userId.toString() === socket.user.id);
      if (!player) {
        return socket.emit('error', { message: 'Вы не участник этой сессии' });
      }

      socket.join(`session:${sessionId}`);
      socket.sessionId = sessionId;

      const wasDisconnected = !player.connected;
      player.connected = true;
      await session.save();

      // Load game state into cache if not already
      if (!activeGames.has(sessionId) && session.gameState) {
        activeGames.set(sessionId, session.gameState);
      }

      const gameState = activeGames.get(sessionId) || session.gameState;

      socket.emit('game-state', {
        sessionId,
        gameState,
        players: session.players,
        status: session.status,
      });

      // Notify others
      if (wasDisconnected && session.status === 'playing') {
        socket.to(`session:${sessionId}`).emit('player-reconnected', {
          userId: socket.user.id,
          displayName: socket.user.displayName,
        });
      } else {
        socket.to(`session:${sessionId}`).emit('player-joined', {
          userId: socket.user.id,
          displayName: socket.user.displayName,
        });
      }

      console.log(`🎮 ${socket.user.displayName} joined session ${sessionId}`);
    } catch (err) {
      console.error('Join session error:', err);
      socket.emit('error', { message: 'Ошибка подключения к сессии' });
    }
  });

  // --- Rejoin session (reconnect to active game) ---
  socket.on('rejoin-session', async ({ sessionId }) => {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) {
        return socket.emit('rejoin-error', { error: 'Сессия не найдена' });
      }

      const player = session.players.find(p => p.userId.toString() === socket.user.id);
      if (!player) {
        return socket.emit('rejoin-error', { error: 'Вы не участник этой сессии' });
      }

      socket.join(`session:${sessionId}`);
      socket.sessionId = sessionId;
      player.connected = true;
      await session.save();

      // Update connected status in cached gameState heroes
      const cachedGs = activeGames.get(sessionId);
      if (cachedGs && cachedGs.heroes) {
        const hero = cachedGs.heroes.find(h => h._ownerId === socket.user.id);
        if (hero) hero._disconnected = false;
      }

      const gs = cachedGs || session.gameState;
      const recentEvents = eventBuffers.get(sessionId) || [];

      // Send full snapshot for sync
      socket.emit('game-snapshot', {
        gameState: gs,
        recentEvents,
        currentTurnEntityId: gs && gs.turnOrder && gs.turnOrder[gs.currentTurnIdx]
          ? gs.turnOrder[gs.currentTurnIdx].entityId
          : null,
        players: session.players,
        status: session.status,
      });

      // Notify others
      socket.to(`session:${sessionId}`).emit('player-reconnected', {
        userId: socket.user.id,
        displayName: socket.user.displayName,
      });

      console.log(`🔄 ${socket.user.displayName} rejoined session ${sessionId}`);
    } catch (err) {
      console.error('Rejoin session error:', err);
      socket.emit('rejoin-error', { error: 'Ошибка реконнекта' });
    }
  });

  // ============================================================
  // ACTION REQUEST — Server-authoritative processing
  // ============================================================

  socket.on('action-request', async ({ sessionId, action }) => {
    try {
      if (!sessionId || !action) return;

      // ── Ensure game state is loaded (fallback to DB if not in cache) ──
      if (!activeGames.has(sessionId)) {
        const dbSession = await GameSession.findById(sessionId).lean();
        if (dbSession && dbSession.gameState) {
          activeGames.set(sessionId, dbSession.gameState);
          console.log(`📦 Loaded gameState from DB for ${sessionId}`);
        }
      }

      // ── Explore mode end-turn: delegate to advanceExploreTurn() ──
      const gs = activeGames.get(sessionId);
      if (gs && action.type === 'end-turn' && gs.mode !== 'combat') {
        // Verify the requesting player owns the current hero
        const currentIdx = gs.activeHeroIdx || 0;
        const currentHero = gs.heroes[currentIdx];
        if (currentHero && currentHero._ownerId && currentHero._ownerId !== socket.user.id) {
          return socket.emit('action-error', { error: 'Сейчас не ваш ход' });
        }

        await advanceExploreTurn(sessionId, io, 'end-turn', socket.user.id);
        return;
      }

      // ── Explore mode move: server-authoritative movement ──
      if (gs && action.type === 'move' && gs.mode !== 'combat') {
        const session = await GameSession.findById(sessionId).lean();
        const players = session ? session.players : [];

        // Assign _ownerId if missing
        if (players.length > 0 && gs.heroes) {
          gs.heroes.forEach(h => {
            if (h._ownerId) return;
            const pl = players.find(p => {
              if (!p.heroId) return false;
              const hid = p.heroId.toString();
              return hid === h.id || hid === h._serverId;
            });
            if (pl) h._ownerId = pl.userId.toString();
          });
        }

        const hero = gs.heroes.find(h => h.id === action.heroId);
        if (!hero) return socket.emit('action-error', { error: 'Герой не найден' });
        if (hero._ownerId && hero._ownerId !== socket.user.id) {
          return socket.emit('action-error', { error: 'Не ваш герой' });
        }

        // Verify it's this hero's turn
        const currentHero = gs.heroes[gs.activeHeroIdx || 0];
        if (!currentHero || currentHero.id !== hero.id) {
          return socket.emit('action-error', { error: 'Сейчас не ход этого героя' });
        }

        // Validate move with GameEngine
        const tempEngine = new GameEngine(gs, sessionId, players);
        const moveRange = tempEngine.getEffectiveMoveRange(hero);
        const reachable = tempEngine.getReachableCells(hero.row, hero.col, moveRange, hero.id);
        const canReach = reachable.some(c => c.row === action.targetRow && c.col === action.targetCol);
        if (!canReach) return socket.emit('action-error', { error: 'Клетка недостижима' });

        // Execute move
        const fromRow = hero.row;
        const fromCol = hero.col;
        hero.row = action.targetRow;
        hero.col = action.targetCol;

        // Update remaining move points
        gs.movePointsLeft = Math.max(0, (gs.movePointsLeft || moveRange) - 1);
        if (gs.movePointsLeft <= 0) gs.moveUsed = true;

        // Recalculate reachable cells from new position
        gs.reachableCells = gs.movePointsLeft > 0
          ? tempEngine.getReachableCells(hero.row, hero.col, gs.movePointsLeft, hero.id)
          : [];

        const result = {
          type: 'move',
          heroId: hero.id,
          targetRow: action.targetRow,
          targetCol: action.targetCol,
          fromRow,
          fromCol,
          reachableCells: gs.reachableCells,
          movePointsLeft: gs.movePointsLeft,
        };

        activeGames.set(sessionId, gs);
        pushEvent(sessionId, { type: 'move', heroId: hero.id });
        io.to(`session:${sessionId}`).emit('action-result', {
          action, result, gameState: gs, userId: socket.user.id,
        });
        debouncedSave(sessionId, gs);
        console.log(`🚶 Explore move by ${socket.user.displayName}: ${hero.name} → (${action.targetRow},${action.targetCol})`);
        return;
      }

      // ── Combat mode: process through GameEngine ──
      const engine = await getEngineWithPlayers(sessionId);
      if (!engine) {
        return socket.emit('action-error', { error: 'Игра не найдена' });
      }

      // Process action through GameEngine
      const { error, result } = engine.processAction(socket.user.id, action);

      if (error) {
        return socket.emit('action-error', { error });
      }

      // Get action log
      const actionLog = engine.getActionLog();

      // Update cache
      activeGames.set(sessionId, engine.gs);

      // Create event payload
      const eventPayload = {
        action,
        result,
        gameState: engine.gs,
        actionLog,
        userId: socket.user.id,
      };

      // Push to event buffer for reconnection
      pushEvent(sessionId, { type: result.type, ...result });

      // Broadcast to ALL players in session
      io.to(`session:${sessionId}`).emit('action-result', eventPayload);

      // Handle chain events (monster turns, combat end)
      if (result.type === 'monster_action' && result.nextTurn) {
        // Recursively send chained turn results with animation delays
        sendChainedResult(io, sessionId, engine, result.nextTurn, 800);
      } else if (result.type === 'combat_ended') {
        // Combat ended — send match summary
        io.to(`session:${sessionId}`).emit('match-ended', {
          result: result.result,
          summary: result.summary,
          matchStats: result.matchStats,
        });
        pushEvent(sessionId, { type: 'match_ended', result: result.result });
      }

      // Debounced save to DB
      debouncedSave(sessionId, engine.gs);

      console.log(`🎯 Action: ${action.type} by ${socket.user.displayName} in ${sessionId}`);
    } catch (err) {
      console.error('Action request error:', err);
      socket.emit('action-error', { error: 'Ошибка обработки действия' });
    }
  });

  // ============================================================
  // COMBAT INITIALIZATION (server-side)
  // ============================================================

  socket.on('init-combat', async ({ sessionId, aggroMonsterIds }) => {
    try {
      const engine = await getEngineWithPlayers(sessionId);
      if (!engine) return;

      const aggroMonsters = engine.gs.monsters.filter(m => aggroMonsterIds.includes(m.id));
      if (aggroMonsters.length === 0) return;

      const combatResult = engine.initCombat(aggroMonsters);

      activeGames.set(sessionId, engine.gs);

      io.to(`session:${sessionId}`).emit('action-result', {
        action: { type: 'init-combat' },
        result: combatResult,
        gameState: engine.gs,
        actionLog: engine.getActionLog(),
      });

      pushEvent(sessionId, combatResult);

      // Start first turn — use chained result for proper monster turn handling
      const firstTurn = engine.startNextTurn();
      sendChainedResult(io, sessionId, engine, firstTurn, 500);

      debouncedSave(sessionId, engine.gs);
    } catch (err) {
      console.error('Init combat error:', err);
    }
  });

  // ============================================================
  // LEGACY: game-action (backward compatibility, still relay for transition period)
  // ============================================================

  socket.on('game-action', async ({ sessionId, action }) => {
    try {
      if (!sessionId || !action) return;

      // Try server-authoritative first
      const engine = getEngine(sessionId);
      if (engine && engine.gs && engine.gs.mode) {
        // Forward to action-request handler
        socket.emit('action-request', { sessionId, action });
        return;
      }

      // Fallback: broadcast (legacy)
      io.to(`session:${sessionId}`).emit('game-action-broadcast', {
        userId: socket.user.id,
        displayName: socket.user.displayName,
        action,
      });
    } catch (err) {
      console.error('Game action error:', err);
    }
  });

  // ============================================================
  // LEGACY: sync-game-state (kept for backward compat + solo mode)
  // ============================================================

  socket.on('sync-game-state', async ({ sessionId, gameState }) => {
    try {
      if (!sessionId || !gameState) return;

      const session = await GameSession.findById(sessionId);
      if (!session) return;

      const hostPlayer = session.players.find(p => p.role === 'host');
      if (!hostPlayer || hostPlayer.userId.toString() !== socket.user.id) {
        return socket.emit('error', { message: 'Только хост может синхронизировать состояние' });
      }

      activeGames.set(sessionId, gameState);

      session.gameState = gameState;
      session.status = 'playing';
      await session.save();

      socket.to(`session:${sessionId}`).emit('game-state-update', {
        gameState,
        source: socket.user.displayName,
      });
    } catch (err) {
      console.error('Sync state error:', err);
    }
  });

  // --- Start game (host only) ---
  socket.on('start-game', async ({ sessionId }) => {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) return;

      const hostPlayer = session.players.find(p => p.role === 'host');
      if (!hostPlayer || hostPlayer.userId.toString() !== socket.user.id) {
        return socket.emit('error', { message: 'Только хост может начать игру' });
      }

      session.status = 'playing';
      await session.save();

      // Pre-load gameState into cache if available (for continued games)
      if (session.gameState && !activeGames.has(sessionId)) {
        activeGames.set(sessionId, session.gameState);
        console.log(`📦 Pre-loaded gameState on start-game for ${sessionId}`);
      }

      io.to(`session:${sessionId}`).emit('game-started', {
        sessionId,
        scenarioId: session.scenarioId,
        players: session.players,
      });

      console.log(`🚀 Game started: ${sessionId}`);
    } catch (err) {
      console.error('Start game error:', err);
    }
  });

  // --- Leave session ---
  socket.on('leave-session', async ({ sessionId }) => {
    try {
      socket.leave(`session:${sessionId}`);
      socket.sessionId = null;

      const session = await GameSession.findById(sessionId);
      if (session) {
        const player = session.players.find(p => p.userId.toString() === socket.user.id);
        if (player) player.connected = false;
        await session.save();
      }

      socket.to(`session:${sessionId}`).emit('player-left', {
        userId: socket.user.id,
        displayName: socket.user.displayName,
      });
    } catch (err) {
      console.error('Leave session error:', err);
    }
  });

  // --- Dice roll result (for animation sync — legacy) ---
  socket.on('dice-result', ({ sessionId, result }) => {
    if (!sessionId) return;
    socket.to(`session:${sessionId}`).emit('dice-result', {
      userId: socket.user.id,
      result,
    });
  });

  // --- Request AI narration ---
  socket.on('request-ai-narration', async ({ sessionId, context }) => {
    try {
      if (!sessionId || !context) return;

      const aiMaster = require('../services/aiMaster');
      context.sessionId = sessionId;

      let result;
      switch (context.type) {
        case 'freeAction':
          result = await aiMaster.generateFreeAction(context);
          break;
        case 'dialog':
          result = await aiMaster.generateDialog(context);
          break;
        case 'scenarioIntro':
          result = await aiMaster.generateScenarioIntro(context);
          result = { narration: result };
          break;
        case 'combat':
          result = await aiMaster.generateCombatNarration(context);
          result = { narration: result };
          break;
        default:
          result = await aiMaster.generateNarration(context);
          result = { narration: result };
      }

      io.to(`session:${sessionId}`).emit('ai-narration', {
        type: context.type || 'narration',
        ...result,
      });

      try {
        await GameSession.findByIdAndUpdate(sessionId, {
          $push: {
            aiNarrations: {
              $each: [{
                text: result.narration || result.npcText || '',
                eventType: context.type || 'narration',
                context: JSON.stringify(context).slice(0, 500),
              }],
              $slice: -GAME_NARRATIONS_KEEP_LIMIT,
            },
          },
        });
      } catch (dbErr) {
        console.error('Save AI narration error:', dbErr);
      }

      console.log(`🤖 AI narration for session ${sessionId}: ${(result.narration || result.npcText || '').slice(0, 50)}...`);
    } catch (err) {
      console.error('AI narration socket error:', err);
      socket.emit('ai-narration', {
        type: context?.type || 'narration',
        narration: 'Приключение продолжается...',
        error: true,
      });
    }
  });
}

// Export for testing/external access
gameHandler.activeGames = activeGames;
gameHandler.eventBuffers = eventBuffers;
gameHandler.advanceExploreTurn = advanceExploreTurn;

module.exports = gameHandler;
