const express = require('express');
const { auth } = require('../middleware/auth');
const GameMap = require('../models/GameMap');
const Scenario = require('../models/Scenario');
const MonsterTemplate = require('../models/MonsterTemplate');
const GameItem = require('../models/GameItem');
const AbilityTemplate = require('../models/AbilityTemplate');
const redis = require('../services/redis');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

const CACHE_KEY = 'game:config';
const CACHE_TTL = 300; // 5 min

// GET /api/game/config
router.get('/config', auth(), async (req, res, next) => {
  try {
    // Try cache
    const client = redis.getClient();
    if (client) {
      const cached = await client.get(CACHE_KEY);
      if (cached) {
        res.set('Cache-Control', 'public, max-age=60');
        return res.json(JSON.parse(cached));
      }
    }

    const [maps, scenarios, monsters, items, abilities] = await Promise.all([
      GameMap.find({ active: true }).lean(),
      Scenario.find({ active: true }).lean(),
      MonsterTemplate.find({ active: true }).lean(),
      GameItem.find({ active: true }).lean(),
      AbilityTemplate.find({ active: true }).lean(),
    ]);

    const result = { maps, scenarios, monsters, items, abilities };

    if (client) {
      await client.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL);
    }

    res.set('Cache-Control', 'public, max-age=60');
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/game/invalidate-cache
router.post('/invalidate-cache', adminAuth(), async (req, res, next) => {
  try {
    const client = redis.getClient();
    if (client) {
      await client.del(CACHE_KEY);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
