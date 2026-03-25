require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const config = require('./config');
const logger = require('./services/logger');
const redis = require('./services/redis');
const errorHandler = require('./middleware/errorHandler');
const { setupGameHandler } = require('./socket/gameHandler');
const { setupChatHandler } = require('./socket/chatHandler');
const { setupCityHandler } = require('./socket/cityHandler');
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Ensure uploads dir exists
const uploadsDir = path.resolve(config.uploadDir);
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Socket.io
const io = new Server(server, {
  cors: {
    origin: config.corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false,
  },
});

// Socket.io auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    socket.handshake.auth.userId = decoded.userId;
    socket.handshake.auth.displayName = decoded.displayName || '';
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// Middleware
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use('/uploads', express.static(uploadsDir));
app.use('/img', express.static(path.join(__dirname, '..', 'img')));

// Serve client in production
if (config.nodeEnv === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
}

// Page view tracking
app.use('/api', (req, res, next) => {
  // Track page views for specific endpoints
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/heroes', require('./routes/heroes'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/store', require('./routes/store'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/bestiary', require('./routes/bestiary'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/city', require('./routes/city'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin/game', require('./routes/gameAdmin'));
app.use('/api/game', require('./routes/gameConfig'));
app.use('/api/health', require('./routes/health'));

// SPA fallback in production
if (config.nodeEnv === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');

  // SPA sub-app routes (Express 5 compatible)
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/uploads')) return next();
    if (req.path.match(/\.\w+$/)) return next(); // skip static files

    if (req.path.startsWith('/lavka')) return res.sendFile(path.join(clientDist, 'lavka.html'));
    if (req.path.startsWith('/bestiary')) return res.sendFile(path.join(clientDist, 'bestiary.html'));
    if (req.path.startsWith('/admin')) return res.sendFile(path.join(clientDist, 'admin.html'));

    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

// Socket handlers
setupGameHandler(io);
setupChatHandler(io);
setupCityHandler(io);

// Connect to MongoDB and start server
async function start() {
  try {
    await mongoose.connect(config.mongodbUri);
    logger.info('MongoDB connected', { uri: config.mongodbUri.replace(/\/\/.*@/, '//***@') });

    // Try Redis
    try {
      await redis.connect();
      logger.info('Redis connected');
    } catch (err) {
      logger.warn('Redis not available, running without cache', { error: err.message });
    }

    server.listen(config.port, () => {
      logger.info(`Taloria server running on port ${config.port}`, { env: config.nodeEnv });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

start();

module.exports = { app, server, io };
