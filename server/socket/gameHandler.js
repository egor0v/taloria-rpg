/**
 * Game Socket Handler — WebSocket event processing for Taloria RPG
 * Based on game-implementation-guide.md §19
 */

const GameSession = require('../models/GameSession');
const logger = require('../services/logger');
const GameEngine = require('../game/GameEngine');

// In-memory active game states (sessionId → gameState)
const activeGames = new Map();

// Debounced save timers
const saveTimers = new Map();

function setupGameHandler(io) {
  const gameNsp = io.of('/game');

  // Auth middleware
  gameNsp.use((socket, next) => {
    const userId = socket.handshake.auth?.userId;
    if (!userId) return next(new Error('userId required'));
    socket.userId = userId;
    socket.displayName = socket.handshake.auth?.displayName || 'Игрок';
    next();
  });

  gameNsp.on('connection', (socket) => {
    logger.info('Game socket connected', { userId: socket.userId });

    // ─── JOIN SESSION ───
    socket.on('join-session', async (data) => {
      try {
        const { sessionId } = data;
        if (!sessionId) return socket.emit('action-error', { message: 'sessionId required' });

        const session = await GameSession.findById(sessionId);
        if (!session) return socket.emit('action-error', { message: 'Сессия не найдена' });

        // Verify player is in session
        const isPlayer = session.players.some(p => p.userId?.toString() === socket.userId);
        if (!isPlayer) return socket.emit('action-error', { message: 'Вы не участник этой сессии' });

        // Join socket room
        socket.join(`session:${sessionId}`);
        socket.sessionId = sessionId;

        // Mark connected
        const player = session.players.find(p => p.userId?.toString() === socket.userId);
        if (player) {
          player.connected = true;
          await session.save().catch(() => {});
        }

        // Get or create game state
        let gameState = activeGames.get(sessionId);

        // Try DB fallback
        if (!gameState || !gameState.map || !gameState.heroes?.length) {
          if (session.gameState?.map && session.gameState?.heroes?.length) {
            gameState = session.gameState;
            activeGames.set(sessionId, gameState);
          }
        }

        // Auto-initialize if session is playing but no game state
        if (session.status === 'playing' && (!gameState || !gameState.map || !gameState.heroes?.length)) {
          logger.info('Auto-initializing game', { sessionId });
          try {
            gameState = await GameEngine.initializeGame(session);
            activeGames.set(sessionId, gameState);
            session.gameState = gameState;
            await session.save().catch(() => {});
            // Notify all players
            gameNsp.to(`session:${sessionId}`).emit('game-started', { gameState });
          } catch (err) {
            logger.error('Init failed', { error: err.message });
            return socket.emit('action-error', { message: 'Ошибка инициализации: ' + err.message });
          }
        }

        // Send current state
        socket.emit('game-state', { gameState: gameState || null, session: { _id: session._id, status: session.status, players: session.players } });

        // Notify others
        socket.to(`session:${sessionId}`).emit('player-connected', {
          userId: socket.userId, displayName: socket.displayName,
        });

      } catch (err) {
        logger.error('join-session error', { error: err.message });
        socket.emit('action-error', { message: 'Ошибка подключения' });
      }
    });

    // ─── START GAME (host only) ───
    socket.on('start-game', async (data) => {
      try {
        const { sessionId } = socket;
        if (!sessionId) return;

        const session = await GameSession.findById(sessionId);
        if (!session) return socket.emit('action-error', { message: 'Сессия не найдена' });
        if (session.hostUserId?.toString() !== socket.userId) {
          return socket.emit('action-error', { message: 'Только хост может начать' });
        }

        const gameState = await GameEngine.initializeGame(session);
        session.status = 'playing';
        session.gameState = gameState;
        await session.save();
        activeGames.set(sessionId, gameState);

        gameNsp.to(`session:${sessionId}`).emit('game-started', { gameState });
      } catch (err) {
        logger.error('start-game error', { error: err.message });
        socket.emit('action-error', { message: 'Ошибка запуска' });
      }
    });

    // ─── ACTION REQUEST ───
    socket.on('action-request', async (data) => {
      try {
        const { sessionId } = socket;
        if (!sessionId) return socket.emit('action-error', { message: 'Не в сессии' });

        // Get game state
        let gameState = activeGames.get(sessionId);
        if (!gameState || !gameState.heroes?.length) {
          // Try to restore
          const session = await GameSession.findById(sessionId);
          if (session?.gameState?.map && session.gameState.heroes?.length) {
            gameState = session.gameState;
            activeGames.set(sessionId, gameState);
          } else if (session?.status === 'playing') {
            try {
              gameState = await GameEngine.initializeGame(session);
              activeGames.set(sessionId, gameState);
              session.gameState = gameState;
              await session.save().catch(() => {});
            } catch (err) {
              return socket.emit('action-error', { message: 'Игра не инициализирована' });
            }
          } else {
            return socket.emit('action-error', { message: 'Нет состояния игры' });
          }
        }

        // Process action through GameEngine
        let result;
        if (['interact', 'loot'].includes(data.type)) {
          // These are async (loot generation from DB)
          result = await GameEngine.processAction(gameState, data, socket.userId);
        } else {
          result = GameEngine.processAction(gameState, data, socket.userId);
        }

        if (result.error) {
          return socket.emit('action-error', { message: result.error });
        }

        // Update active games
        if (result.gameState) {
          activeGames.set(sessionId, result.gameState);
        }

        // Broadcast to all players in session
        gameNsp.to(`session:${sessionId}`).emit('action-result', {
          action: { type: data.type },
          result: result.actionResult,
          gameState: result.gameState,
        });

        // Debounced save to DB
        debouncedSave(sessionId, result.gameState);

      } catch (err) {
        logger.error('action-request error', { error: err.message, stack: err.stack?.split('\n')[1] });
        socket.emit('action-error', { message: 'Ошибка: ' + err.message });
      }
    });

    // ─── CHAT MESSAGE ───
    socket.on('chat-message', (data) => {
      const { sessionId } = socket;
      if (!sessionId || !data?.text) return;

      const msg = {
        userId: socket.userId,
        displayName: socket.displayName,
        text: String(data.text).slice(0, 500),
        timestamp: new Date().toISOString(),
      };

      gameNsp.to(`session:${sessionId}`).emit('chat-message', msg);
    });

    // ─── SAVE GAME ───
    socket.on('save-game', async () => {
      try {
        const { sessionId } = socket;
        if (!sessionId) return;

        const gameState = activeGames.get(sessionId);
        if (gameState) {
          await GameSession.findByIdAndUpdate(sessionId, { gameState });
          socket.emit('game-saved', { success: true, timestamp: new Date().toISOString() });
        }
      } catch (err) {
        logger.error('save-game error', { error: err.message });
      }
    });

    // ─── DISCONNECT ───
    socket.on('disconnect', async () => {
      try {
        if (socket.sessionId) {
          const session = await GameSession.findById(socket.sessionId);
          if (session) {
            const player = session.players.find(p => p.userId?.toString() === socket.userId);
            if (player) {
              player.connected = false;
              await session.save().catch(() => {});
            }
          }

          socket.to(`session:${socket.sessionId}`).emit('player-disconnected', {
            userId: socket.userId, displayName: socket.displayName,
          });
        }
      } catch (err) {
        logger.error('disconnect error', { error: err.message });
      }
    });
  });
}

// Save to DB every 5 seconds (debounced)
function debouncedSave(sessionId, gameState) {
  if (saveTimers.has(sessionId)) clearTimeout(saveTimers.get(sessionId));
  saveTimers.set(sessionId, setTimeout(async () => {
    try {
      await GameSession.findByIdAndUpdate(sessionId, { gameState });
      saveTimers.delete(sessionId);
    } catch (err) {
      logger.error('debouncedSave error', { error: err.message });
    }
  }, 5000));
}

module.exports = { setupGameHandler, activeGames };
