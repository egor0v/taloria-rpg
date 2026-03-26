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
      // Block spectators from acting
      if (socket.isSpectator) {
        return socket.emit('action-error', { error: 'Вы наблюдатель — действия недоступны' });
      }
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

        // Combat started — broadcast turn order
        if (result?.combatStarted) {
          gameNsp.to(`session:${sessionId}`).emit('combat-start', {
            turnOrder: result.turnOrder || engine.gs.turnOrder,
            combatZone: result.combatZone || engine.gs.combatZone,
            combatHeroes: result.combatHeroes || engine.gs.combatHeroes,
            combatMonsters: result.combatMonsters || engine.gs.combatMonsters,
          });

          // Auto-advance to first turn (may be monster)
          setTimeout(async () => {
            try {
              const turnResult = engine.startNextTurn();
              if (turnResult?.type === 'monster_action') {
                gameNsp.to(`session:${sessionId}`).emit('monster-action', {
                  ...turnResult, gameState: engine.gs,
                });
                debouncedSave(sessionId, engine.gs);
              } else if (turnResult?.type === 'turn_started') {
                gameNsp.to(`session:${sessionId}`).emit('turn-started', {
                  ...turnResult, gameState: engine.gs,
                });
              }
            } catch {}
          }, 1500);
        }

        // Combat ended — rewards
        if (result?.combatEnded) {
          gameNsp.to(`session:${sessionId}`).emit('combat-ended', {
            result: result.combatEnded.result,
            summary: result.combatEnded.summary,
            rewards: result.combatEnded.rewards,
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
      const engine = activeGames.get(sessionId);
      if (engine?.gs) {
        try {
          await GameSession.findByIdAndUpdate(sessionId, { gameState: engine.gs, status: 'paused' });
          socket.emit('game-saved', { success: true, timestamp: new Date().toISOString() });
        } catch (err) {
          console.error('save-game error:', err);
        }
      }
    });

    // --- Toggle public/private ---
    socket.on('toggle-public', async ({ isPublic }) => {
      const sid = socket.sessionId;
      if (!sid) return;
      try {
        const session = await GameSession.findById(sid);
        if (!session) return;
        // Only host can toggle
        if (session.hostUserId?.toString() !== socket.userId) return;

        session.isPublic = isPublic;
        await session.save();

        if (!isPublic) {
          // Kick all spectators
          const room = gameNsp.adapter.rooms.get(`session:${sid}`);
          if (room) {
            for (const sockId of [...room]) {
              const s = gameNsp.sockets.get(sockId);
              if (s?.isSpectator) {
                s.emit('kicked', { reason: 'Игра закрыта для наблюдателей' });
                s.leave(`session:${sid}`);
                s.disconnect(true);
              }
            }
          }
        }

        gameNsp.to(`session:${sid}`).emit('visibility-changed', { isPublic });
      } catch (err) {
        console.error('toggle-public error:', err);
      }
    });

    // --- Join as spectator ---
    socket.on('join-as-spectator', async ({ sessionId, displayName }) => {
      if (!sessionId) return;
      try {
        const session = await GameSession.findById(sessionId);
        if (!session) return socket.emit('error', { message: 'Сессия не найдена' });

        // Check if game is public
        if (session.isPublic === false) {
          return socket.emit('error', { message: 'Игра закрыта для наблюдателей' });
        }

        socket.join(`session:${sessionId}`);
        socket.sessionId = sessionId;
        socket.isSpectator = true;
        socket.displayName = displayName || 'Гость';

        // Count spectators in room
        const room = gameNsp.adapter.rooms.get(`session:${sessionId}`);
        const allSockets = room ? [...room] : [];
        let specCount = 0;
        for (const sid of allSockets) {
          const s = gameNsp.sockets.get(sid);
          if (s?.isSpectator) specCount++;
        }

        // Send current game state (readonly)
        const engine = activeGames.get(sessionId);
        socket.emit('game-state', {
          gameState: engine?.gs || session.gameState || null,
          session: { _id: session._id, status: session.status, players: session.players },
        });

        // Broadcast to all
        gameNsp.to(`session:${sessionId}`).emit('spectator-joined', {
          displayName: socket.displayName,
          spectatorCount: specCount,
        });
      } catch (err) {
        socket.emit('error', { message: 'Ошибка подключения' });
      }
    });

    // --- Request to join game (spectator → player) ---
    socket.on('request-join-game', async ({ sessionId, displayName }) => {
      if (!sessionId || !socket.userId) return;
      // Send to host
      const session = await GameSession.findById(sessionId);
      if (!session) return;
      const hostSocket = [...(gameNsp.adapter.rooms.get(`session:${sessionId}`) || [])].find(sid => {
        const s = gameNsp.sockets.get(sid);
        return s && s.userId === session.hostUserId?.toString();
      });
      if (hostSocket) {
        gameNsp.sockets.get(hostSocket)?.emit('join-request', {
          userId: socket.userId,
          displayName: displayName || socket.displayName || 'Игрок',
          sessionId,
        });
      } else {
        // Broadcast to all players if host not found
        gameNsp.to(`session:${sessionId}`).emit('join-request', {
          userId: socket.userId,
          displayName: displayName || socket.displayName || 'Игрок',
          sessionId,
        });
      }
    });

    // --- Approve/reject join request ---
    socket.on('approve-join', async ({ sessionId, userId, approved }) => {
      if (!sessionId || !userId) return;
      const session = await GameSession.findById(sessionId);
      if (!session) return;
      // Only host can approve
      if (session.hostUserId?.toString() !== socket.userId) return;

      if (approved && session.players.length < session.maxPlayers) {
        // Add player to session
        session.players.push({
          userId,
          displayName: '',
          connected: true,
          ready: true,
          role: 'player',
        });
        await session.save();

        // Find spectator socket and convert to player
        const room = gameNsp.adapter.rooms.get(`session:${sessionId}`);
        if (room) {
          for (const sid of room) {
            const s = gameNsp.sockets.get(sid);
            if (s && s.userId === userId) {
              s.isSpectator = false;
              s.emit('join-approved', { session });
              break;
            }
          }
        }

        gameNsp.to(`session:${sessionId}`).emit('player-connected', {
          userId, displayName: 'Новый игрок',
        });
      } else {
        // Rejected — stay as spectator
        const room = gameNsp.adapter.rooms.get(`session:${sessionId}`);
        if (room) {
          for (const sid of room) {
            const s = gameNsp.sockets.get(sid);
            if (s && s.userId === userId) {
              s.emit('join-rejected', { reason: approved ? 'Игра заполнена' : 'Хост отклонил запрос' });
              break;
            }
          }
        }
      }
    });

    // --- Place marker (multiplayer) ---
    socket.on('place-marker', (data) => {
      const sessionId = socket.sessionId;
      if (!sessionId || !data) return;
      const engine = activeGames.get(sessionId);
      if (engine?.gs) {
        if (!engine.gs.markers) engine.gs.markers = [];
        const marker = {
          type: data.type || 'cross',
          icon: data.icon || '✖',
          col: data.col,
          row: data.row,
          owner: socket.userId,
          ownerName: socket.displayName,
          visibleTo: data.visibleTo || [],
          timestamp: new Date().toISOString(),
        };
        engine.gs.markers.push(marker);
        // Broadcast to all players in session
        gameNsp.to(`session:${sessionId}`).emit('marker-placed', marker);
      }
    });

    // --- Remove marker ---
    socket.on('remove-marker', (data) => {
      const sessionId = socket.sessionId;
      if (!sessionId || !data) return;
      const engine = activeGames.get(sessionId);
      if (engine?.gs?.markers) {
        const idx = engine.gs.markers.findIndex(m => m.col === data.col && m.row === data.row && m.owner === socket.userId);
        if (idx >= 0) {
          engine.gs.markers.splice(idx, 1);
          gameNsp.to(`session:${sessionId}`).emit('marker-removed', { col: data.col, row: data.row });
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

    // --- NPC Dialog (AI master processes player message) ---
    socket.on('npc-dialog', async (data) => {
      const sessionId = socket.sessionId;
      if (!sessionId || !data?.playerMessage) return;

      const engine = activeGames.get(sessionId);
      const npc = engine?.gs?.monsters?.find(m => m.id === data.npcId);
      const npcName = npc?.name || data.npcName || 'НПС';
      const npcType = npc?.type || 'npc';
      const npcDialog = npc?.dialog || npc?.greeting || '';

      try {
        const aiMaster = require('../services/aiMaster');
        const result = await aiMaster.generate({
          type: 'npc-dialog',
          npcName,
          npcType,
          npcBaseDialog: npcDialog,
          npcFriendly: npc?.friendly || false,
          npcIsTrader: npc?.isTrader || false,
          npcIsQuestNpc: npc?.isQuestNpc || false,
          playerMessage: data.playerMessage,
          playerName: socket.displayName,
          scenarioName: engine?.gs?.scenarioName || '',
        });
        socket.emit('npc-dialog-response', {
          npcId: data.npcId,
          npcName,
          npcResponse: result.npcText || result.narration || `${npcName}: Хм... интересно.`,
        });
      } catch (err) {
        console.error('NPC dialog AI error:', err);
        // Fallback response based on NPC type
        const fallbacks = {
          trader: `${npcName}: Хочешь что-то купить? Посмотри мой товар.`,
          quest: `${npcName}: Помоги мне, прошу!`,
          default: `${npcName}: *кивает* Интересно...`,
        };
        const fallback = npc?.isTrader ? fallbacks.trader : npc?.isQuestNpc ? fallbacks.quest : fallbacks.default;
        socket.emit('npc-dialog-response', {
          npcId: data.npcId,
          npcName,
          npcResponse: fallback,
        });
      }
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
