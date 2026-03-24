const Redis = require('ioredis');
const config = require('../config');
const logger = require('./logger');

let client = null;
let isConnected = false;

function createClient() {
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) {
        logger.warn('Redis: max reconnect attempts reached, giving up');
        return null; // stop retrying
      }
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  redis.on('connect', () => {
    isConnected = true;
    logger.info('Redis connected');
  });

  redis.on('error', (err) => {
    isConnected = false;
    logger.error('Redis error', { error: err.message });
  });

  redis.on('close', () => {
    isConnected = false;
    logger.warn('Redis connection closed');
  });

  return redis;
}

async function initRedis() {
  if (client) return client;
  client = createClient();
  try {
    await client.ping();
    isConnected = true;
  } catch (err) {
    logger.warn('Redis unavailable, running without cache', { error: err.message });
    isConnected = false;
    client = null;
  }
  return client;
}

function getRedis() {
  return client;
}

function isRedisConnected() {
  return isConnected;
}

// Safe wrappers that silently fail if Redis is unavailable
async function safeGet(key) {
  if (!isConnected) return null;
  try { return await client.get(key); } catch { return null; }
}

async function safeSet(key, value, exSeconds) {
  if (!isConnected) return false;
  try {
    if (exSeconds) {
      await client.set(key, value, 'EX', exSeconds);
    } else {
      await client.set(key, value);
    }
    return true;
  } catch { return false; }
}

async function safeDel(key) {
  if (!isConnected) return false;
  try { await client.del(key); return true; } catch { return false; }
}

module.exports = {
  connect: initRedis,
  initRedis,
  getClient: getRedis,
  getRedis,
  isRedisConnected,
  safeGet,
  safeSet,
  safeDel,
};
