const express = require('express');
const mongoose = require('mongoose');
const redis = require('../services/redis');

const router = express.Router();

router.get('/', async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'ok' : 'error';
  const redisStatus = redis.getClient()?.status === 'ready' ? 'ok' : 'unavailable';

  const status = mongoStatus === 'ok' ? 'ok' : 'degraded';

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoStatus,
      redis: redisStatus,
    },
  });
});

module.exports = router;
