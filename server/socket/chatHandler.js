const ChatMessage = require('../models/ChatMessage');
const logger = require('../services/logger');

function setupChatHandler(io) {
  const chatNsp = io.of('/chat');

  chatNsp.use((socket, next) => {
    if (!socket.handshake.auth?.userId) {
      return next(new Error('Authentication required'));
    }
    socket.userId = socket.handshake.auth.userId;
    socket.displayName = socket.handshake.auth.displayName || 'Игрок';
    next();
  });

  chatNsp.on('connection', (socket) => {
    // Join location room (for city chat)
    socket.on('join-location', (data) => {
      const { locationId } = data;
      if (socket.currentLocation) {
        socket.leave(`location:${socket.currentLocation}`);
      }
      socket.join(`location:${locationId}`);
      socket.currentLocation = locationId;
    });

    // Send message in location
    socket.on('location-message', async (data) => {
      try {
        if (!socket.currentLocation) return;

        const message = {
          userId: socket.userId,
          displayName: socket.displayName,
          heroName: data.heroName || '',
          text: data.text?.slice(0, 500) || '',
          timestamp: new Date().toISOString(),
          locationId: socket.currentLocation,
        };

        chatNsp.to(`location:${socket.currentLocation}`).emit('location-message', message);
      } catch (err) {
        logger.error('location-message error', { error: err.message });
      }
    });

    // Direct message
    socket.on('direct-message', (data) => {
      const { targetUserId, text } = data;
      chatNsp.to(`user:${targetUserId}`).emit('direct-message', {
        fromUserId: socket.userId,
        fromDisplayName: socket.displayName,
        text: text?.slice(0, 500) || '',
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      if (socket.currentLocation) {
        chatNsp.to(`location:${socket.currentLocation}`).emit('player-left', {
          userId: socket.userId,
          displayName: socket.displayName,
        });
      }
    });
  });
}

module.exports = { setupChatHandler };
