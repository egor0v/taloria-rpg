const express = require('express');
const MonsterTemplate = require('../models/MonsterTemplate');
const AbilityTemplate = require('../models/AbilityTemplate');
const GameItem = require('../models/GameItem');
const validate = require('../middleware/validate');
const { bestiaryQuerySchema } = require('../schemas/game.schema');

const router = express.Router();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TAB_MAP = {
  monsters: { model: MonsterTemplate, filter: {} },
  spells: { model: AbilityTemplate, filter: { type: { $in: ['class_ability', 'skill', 'spell'] } } },
  abilities: { model: AbilityTemplate, filter: { type: 'class_ability' } },
  potions: { model: GameItem, filter: { type: 'potion' } },
  weapons: { model: GameItem, filter: { type: 'weapon' } },
  artifacts: { model: GameItem, filter: { type: { $in: ['jewelry', 'shield'] } } },
  equipment: { model: GameItem, filter: { type: { $in: ['armor', 'helmet', 'boots', 'pants'] } } },
  scrolls: { model: GameItem, filter: { type: 'scroll' } },
  tools: { model: GameItem, filter: { type: { $in: ['tool', 'food', 'junk', 'quest'] } } },
};

// GET /api/bestiary
router.get('/', validate(bestiaryQuerySchema), async (req, res, next) => {
  try {
    const { tab, search, rarity, cls, page, limit } = req.validated.query;
    const mapping = TAB_MAP[tab];
    if (!mapping) return res.status(400).json({ error: 'Неизвестная вкладка' });

    const filter = { ...mapping.filter, active: true };
    if (search) filter.name = new RegExp(escapeRegex(search), 'i');
    if (rarity) filter.rarity = rarity;
    if (cls) filter.cls = cls;

    const skip = (page - 1) * limit;
    const [data, count] = await Promise.all([
      mapping.model.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
      mapping.model.countDocuments(filter),
    ]);

    res.set('Cache-Control', 'public, max-age=60');
    res.json({ tab, count, data, page, pages: Math.ceil(count / limit) });
  } catch (err) { next(err); }
});

module.exports = router;
