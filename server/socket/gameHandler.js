'use strict';

/**
 * Game Socket Handler — adapted from design repo
 * Wraps design's gameHandler(io, socket) in namespace architecture
 */

const GameSession = require('../models/GameSession');
const GameEngine = require('../game/GameEngine');

// In-memory state
const activeGames = new Map();
const activeEngines = new Map();
const eventBuffers = new Map();
const EVENT_BUFFER_SIZE = 20;
const saveTimers = new Map();
const DB_SAVE_INTERVAL = 5000;

function bufferEvent(sessionId, event) {
  if (!eventBuffers.has(sessionId)) eventBuffers.set(sessionId, []);
  const buf = eventBuffers.get(sessionId);
  buf.push(event);
  if (buf.length > EVENT_BUFFER_SIZE) buf.shift();
}

function debouncedSave(sessionId, gameState) {
  if (saveTimers.has(sessionId)) clearTimeout(saveTimers.get(sessionId));
  saveTimers.set(sessionId, setTimeout(async () => {
    try {
      await GameSession.findByIdAndUpdate(sessionId, { gameState });
    } catch (err) {
      console.error('DB save error:', err);
    }
    saveTimers.delete(sessionId);
  }, DB_SAVE_INTERVAL));
}

function getOrCreateEngine(sessionId, gameState, players) {
  let engine = activeEngines.get(sessionId);
  if (!engine) {
    engine = new GameEngine(gameState, sessionId, players);
    activeEngines.set(sessionId, engine);
  } else {
    engine.gs = gameState;
    engine.players = players || engine.players;
  }
  return engine;
}

async function advanceExploreTurn(sessionId, gameNsp, reason, heroId) {
  const gs = activeGames.get(sessionId);
  if (!gs || gs.mode === 'combat') return;

  // Reset hero turn state
  const hero = heroId ? gs.heroes.find(h => h.id === heroId) : gs.heroes[gs.activeHeroIdx || 0];
  if (hero) {
    hero.moveUsed = false;
    hero.actionUsed = false;
    hero.bonusActionUsed = false;
    hero.stepsRemaining = hero.moveRange || 2;
  }

  // Advance to next hero
  gs.activeHeroIdx = ((gs.activeHeroIdx || 0) + 1) % gs.heroes.length;
  gs.round = (gs.round || 0) + 1;

  const payload = {
    action: { type: 'end-turn', heroId: hero?.id, auto: reason === 'disconnect' },
    result: { type: 'end-turn', round: gs.round },
    gameState: gs,
  };

  bufferEvent(sessionId, payload);
  gameNsp.to(`session:${sessionId}`).emit('action-result', payload);
  debouncedSave(sessionId, gs);
}

// ============================================================
// SETUP (namespace wrapper)
// ============================================================

function setupGameHandler(io) {
  const gameNsp = io.of('/game');

  // Auth middleware
  gameNsp.use((socket, next) => {
    const userId = socket.handshake.auth?.userId;
    if (!userId) return next(new Error('userId required'));
    socket.userId = userId;
    socket.displayName = socket.handshake.auth?.displayName || 'Игрок';
    // Compat with design code (socket.user.id)
    socket.user = { id: userId, displayName: socket.displayName };
    next();
  });

  gameNsp.on('connection', (socket) => {
    console.log(`🎮 Game socket connected: ${socket.displayName} (${socket.id})`);

    // --- Join session ---
    socket.on('join-session', async ({ sessionId }) => {
      try {
        const session = await GameSession.findById(sessionId);
        if (!session) return socket.emit('error', { message: 'Сессия не найдена' });

        const isPlayer = session.players.some(p => p.userId?.toString() === socket.userId);
        if (!isPlayer) return socket.emit('error', { message: 'Вы не участник этой сессии' });

        socket.join(`session:${sessionId}`);
        socket.sessionId = sessionId;

        // Mark connected
        const player = session.players.find(p => p.userId?.toString() === socket.userId);
        if (player) {
          player.connected = true;
          await session.save().catch(() => {});
        }

        // Get or initialize game state
        let gs = activeGames.get(sessionId);
        if (!gs && session.gameState?.heroes?.length) {
          gs = session.gameState;
          activeGames.set(sessionId, gs);
        }

        // Auto-init if playing but no state
        if (session.status === 'playing' && (!gs || !gs.heroes?.length)) {
          try {
            gs = await GameEngine.initializeFromDB(session);
            activeGames.set(sessionId, gs);
            session.gameState = gs;
            await session.save().catch(() => {});
            gameNsp.to(`session:${sessionId}`).emit('game-started', { gameState: gs });
          } catch (err) {
            console.error('Auto-init failed:', err.message);
            return socket.emit('error', { message: 'Ошибка инициализации: ' + err.message });
          }
        }

        // Send current state
        socket.emit('game-state', {
          gameState: gs || null,
          session: { _id: session._id, status: session.status, players: session.players },
          eventBuffer: eventBuffers.get(sessionId) || [],
        });

        socket.to(`session:${sessionId}`).emit('player-connected', {
          userId: socket.userId, displayName: socket.displayName,
        });

      } catch (err) {
        console.error('join-session error:', err);
        socket.emit('error', { message: 'Ошибка подключения' });
      }
    });

    // --- Rejoin (reconnect with event buffer) ---
    socket.on('rejoin-session', async ({ sessionId }) => {
      try {
        const session = await GameSession.findById(sessionId);
        if (!session) return socket.emit('rejoin-error', { error: 'Сессия не найдена' });

        const isPlayer = session.players.some(p => p.userId?.toString() === socket.userId);
        if (!isPlayer) return socket.emit('rejoin-error', { error: 'Вы не участник' });

        socket.join(`session:${sessionId}`);
        socket.sessionId = sessionId;

        const player = session.players.find(p => p.userId?.toString() === socket.userId);
        if (player) { player.connected = true; await session.save().catch(() => {}); }

        const gs = activeGames.get(sessionId) || session.gameState;
        socket.emit('game-snapshot', {
          gameState: gs,
          eventBuffer: eventBuffers.get(sessionId) || [],
        });

        socket.to(`session:${sessionId}`).emit('player-reconnected', {
          userId: socket.userId, displayName: socket.displayName,
        });
      } catch (err) {
        socket.emit('rejoin-error', { error: 'Ошибка реконнекта' });
      }
    });

    // --- Action request ---
    socket.on('action-request', async (data) => {
      // Support both { sessionId, action } and flat { type, x, y, ... }
      let action, reqSessionId;
      if (data.action) {
        action = data.action;
        reqSessionId = data.sessionId;
      } else {
        // Flat format from client: { type, x, y, targetId, ... }
        action = { ...data };
        reqSessionId = data.sessionId;
        delete action.sessionId;
      }

      const sessionId = reqSessionId || socket.sessionId;
      if (!sessionId) return socket.emit('action-error', { error: 'Не в сессии' });

      try {
        let gs = activeGames.get(sessionId);

        // Try restore from DB
        if (!gs || !gs.heroes?.length) {
          const session = await GameSession.findById(sessionId);
          if (session?.gameState?.heroes?.length) {
            gs = session.gameState;
            activeGames.set(sessionId, gs);
          } else if (session?.status === 'playing') {
            gs = await GameEngine.initializeFromDB(session);
            activeGames.set(sessionId, gs);
            session.gameState = gs;
            await session.save().catch(() => {});
          } else {
            return socket.emit('action-error', { error: 'Игра не найдена' });
          }
        }

        // Get or create engine
        const session = await GameSession.findById(sessionId).lean();
        const players = session?.players || [];
        const engine = getOrCreateEngine(sessionId, gs, players);

        const userId = socket.userId;
        const actionType = action.type;

        // Auto-assign heroId from session ownership
        if (!action.heroId) {
          const myHero = gs.heroes.find(h => h._ownerId === userId || h.userId === userId);
          if (myHero) action.heroId = myHero.id;
        }

        // Translate client x/y coordinates to engine row/col
        if (actionType === 'move') {
          if (action.y !== undefined) action.targetRow = action.y;
          if (action.x !== undefined) action.targetCol = action.x;
        }

        // Process action through engine
        let result;
        if (actionType === 'end-turn') {
          result = engine.executeEndTurn();
        } else {
          // Validate
          const validation = engine.validateAction(userId, action);
          if (!validation.ok) {
            return socket.emit('action-error', { error: validation.error });
          }
          const processed = await engine.processAction(userId, action);
          // processAction returns { result: {...} } or { error: '...' }
          if (processed.error) {
            return socket.emit('action-error', { error: processed.error });
          }
          result = processed.result || processed;
        }

        // Update state
        activeGames.set(sessionId, engine.gs);

        // Build event payload
        const eventPayload = {
          action: { type: actionType, heroId: action.heroId },
          result,
          gameState: engine.gs,
          actionLog: engine.getActionLog(),
        };

        // Clear engine log
        engine.actionLog = [];
        engine.events = [];

        bufferEvent(sessionId, eventPayload);
        gameNsp.to(`session:${sessionId}`).emit('action-result', eventPayload);
        debouncedSave(sessionId, engine.gs);

        // Check if combat ended
        if (result?.combatEnded) {
          const summary = engine.generateMatchSummary(result.combatResult);
          gameNsp.to(`session:${sessionId}`).emit('match-ended', {
            result: result.combatResult,
            summary,
            gameState: engine.gs,
          });
        }

      } catch (err) {
        console.error('action-request error:', err.message);
        socket.emit('action-error', { error: err.message || 'Ошибка обработки действия' });
      }
    });

    // --- Dice check result (water drowning, etc.) ---
    socket.on('dice-check-result', async ({ sessionId: reqSessionId, entityId, diceRoll, checkType }) => {
      const sessionId = reqSessionId || socket.sessionId;
      if (!sessionId) return;
      try {
        const gs = activeGames.get(sessionId);
        if (!gs) return;
        const session = await GameSession.findById(sessionId).lean();
        const engine = getOrCreateEngine(sessionId, gs, session?.players || []);

        let result;
        if (checkType === 'water_check') {
          result = engine.processWaterCheck(entityId, diceRoll);
        }

        activeGames.set(sessionId, engine.gs);
        const payload = {
          action: { type: 'dice-check' },
          result,
          gameState: engine.gs,
          actionLog: engine.getActionLog(),
        };
        engine.actionLog = [];
        gameNsp.to(`session:${sessionId}`).emit('action-result', payload);
        debouncedSave(sessionId, engine.gs);
      } catch (err) {
        console.error('dice-check error:', err);
      }
    });

    // --- Init combat ---
    socket.on('init-combat', async ({ sessionId: reqSessionId, aggroMonsterIds }) => {
      const sessionId = reqSessionId || socket.sessionId;
      if (!sessionId) return;

      try {
        const gs = activeGames.get(sessionId);
        if (!gs) return;

        const session = await GameSession.findById(sessionId).lean();
        const engine = getOrCreateEngine(sessionId, gs, session?.players || []);
        const result = engine.initCombat(aggroMonsterIds || []);

        activeGames.set(sessionId, engine.gs);

        const payload = {
          action: { type: 'init-combat' },
          result,
          gameState: engine.gs,
          actionLog: engine.getActionLog(),
        };
        engine.actionLog = [];

        bufferEvent(sessionId, payload);
        gameNsp.to(`session:${sessionId}`).emit('action-result', payload);
        debouncedSave(sessionId, engine.gs);
      } catch (err) {
        console.error('init-combat error:', err);
      }
    });

    // --- Start game (host) ---
    socket.on('start-game', async ({ sessionId: reqSessionId }) => {
      const sessionId = reqSessionId || socket.sessionId;
      if (!sessionId) return;

      try {
        const session = await GameSession.findById(sessionId);
        if (!session) return socket.emit('error', { message: 'Сессия не найдена' });
        if (session.hostUserId?.toString() !== socket.userId) {
          return socket.emit('error', { message: 'Только хост' });
        }

        const gs = await GameEngine.initializeFromDB(session);
        session.status = 'playing';
        session.gameState = gs;
        await session.save();
        activeGames.set(sessionId, gs);

        gameNsp.to(`session:${sessionId}`).emit('game-started', { gameState: gs });
      } catch (err) {
        console.error('start-game error:', err);
        socket.emit('error', { message: 'Ошибка запуска' });
      }
    });

    // --- Save game ---
    socket.on('save-game', async () => {
      const sessionId = socket.sessionId;
      if (!sessionId) return;
      const gs = activeGames.get(sessionId);
      if (gs) {
        try {
          await GameSession.findByIdAndUpdate(sessionId, { gameState: gs });
          socket.emit('game-saved', { success: true, timestamp: new Date().toISOString() });
        } catch (err) {
          console.error('save-game error:', err);
        }
      }
    });

    // --- Chat ---
    socket.on('chat-message', (data) => {
      const sessionId = socket.sessionId;
      if (!sessionId || !data?.text) return;
      const msg = {
        userId: socket.userId,
        displayName: socket.displayName,
        text: String(data.text).slice(0, 500),
        timestamp: new Date().toISOString(),
      };
      gameNsp.to(`session:${sessionId}`).emit('chat-message', msg);
    });

    // --- AI narration request ---
    socket.on('request-ai-narration', async ({ sessionId: reqSessionId, context }) => {
      const sessionId = reqSessionId || socket.sessionId;
      if (!sessionId) return;
      try {
        const aiMaster = require('../services/aiMaster');
        const result = await aiMaster.generate(context);
        gameNsp.to(`session:${sessionId}`).emit('ai-narration', {
          type: context?.type || 'narration',
          narration: result.narration || result.npcText || 'Приключение продолжается...',
        });
      } catch (err) {
        console.error('AI narration error:', err);
        socket.emit('ai-narration', {
          type: context?.type || 'narration',
          narration: 'Приключение продолжается...',
          error: true,
        });
      }
    });

    // --- Disconnect ---
    socket.on('disconnect', async (reason) => {
      console.log(`🔌 Game disconnect: ${socket.displayName} (${reason})`);

      if (socket.sessionId) {
        const sessionId = socket.sessionId;

        try {
          const session = await GameSession.findById(sessionId);
          if (session) {
            const player = session.players.find(p => p.userId?.toString() === socket.userId);
            if (player) { player.connected = false; await session.save().catch(() => {}); }
          }
        } catch (err) {
          console.error('disconnect DB error:', err);
        }

        socket.to(`session:${sessionId}`).emit('player-disconnected', {
          userId: socket.userId, displayName: socket.displayName, reason,
        });

        // Auto-advance if this player's turn
        try {
          const gs = activeGames.get(sessionId);
          if (gs && gs.mode !== 'combat') {
            const currentHero = gs.heroes?.[gs.activeHeroIdx || 0];
            if (currentHero && currentHero._ownerId === socket.userId) {
              await advanceExploreTurn(sessionId, gameNsp, 'disconnect', null);
            }
          }
        } catch (err) {
          console.error('Auto-advance error:', err);
        }
      }
    });
  });
}

// Export
setupGameHandler.activeGames = activeGames;
setupGameHandler.eventBuffers = eventBuffers;
setupGameHandler.advanceExploreTurn = advanceExploreTurn;

module.exports = { setupGameHandler, activeGames };
