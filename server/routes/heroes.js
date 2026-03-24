const express = require('express');
const Hero = require('../models/Hero');
const User = require('../models/User');
const GameItem = require('../models/GameItem');
const AbilityTemplate = require('../models/AbilityTemplate');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createHeroSchema, updateHeroSchema, levelUpSchema, spendSkillPointsSchema, unlockAbilitySchema, tradeSchema } = require('../schemas/hero.schema');
const { heroLimiter } = require('../middleware/rateLimiter');
const { MAX_FREE_HEROES, XP_THRESHOLDS, LEVEL_UP_BONUSES, TRADE_POINT_COSTS } = require('../constants');

const router = express.Router();

// GET /api/heroes
// Enrich items with images from GameItem DB
let _imgCache = null;
async function getImgLookup() {
  if (_imgCache) return _imgCache;
  const items = await GameItem.find({ active: true }).select('itemId name img').lean();
  _imgCache = {};
  items.forEach(i => { if (i.img) { _imgCache[i.itemId] = i.img; _imgCache[i.name] = i.img; } });
  // Clear cache after 5 min
  setTimeout(() => { _imgCache = null; }, 300000);
  return _imgCache;
}

function enrichItemImages(hero, lookup) {
  // Enrich inventory
  if (hero.inventory) {
    for (const item of hero.inventory) {
      if (item && !item.img) {
        item.img = lookup[item.itemId] || lookup[item.name] || '';
      }
    }
  }
  // Enrich equipment
  if (hero.equipment) {
    for (const [slot, item] of Object.entries(hero.equipment)) {
      if (item && item.name && !item.img) {
        item.img = lookup[item.itemId] || lookup[item.name] || '';
      }
    }
  }
  // Enrich stash
  if (hero.stash) {
    for (const item of hero.stash) {
      if (item && !item.img) {
        item.img = lookup[item.itemId] || lookup[item.name] || '';
      }
    }
  }
}

router.get('/', auth(), async (req, res, next) => {
  try {
    const heroes = await Hero.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    const lookup = await getImgLookup();
    const enriched = heroes.map(h => {
      const obj = h.toObject();
      enrichItemImages(obj, lookup);
      return obj;
    });
    res.json({ heroes: enriched });
  } catch (err) { next(err); }
});

// POST /api/heroes
router.post('/', auth(), heroLimiter, validate(createHeroSchema), async (req, res, next) => {
  try {
    const { name, cls, race, gender, statBonuses, appearance } = req.validated.body;

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const heroCount = await Hero.countDocuments({ userId: user._id });
    const maxSlots = MAX_FREE_HEROES + (user.heroSlots || 0);
    if (heroCount >= maxSlots) {
      return res.status(400).json({ error: 'Достигнут лимит героев. Купите дополнительный слот.' });
    }

    const defaults = Hero.getClassDefaults(cls, race);

    // Apply stat bonuses (max 6 points total)
    if (statBonuses) {
      const totalBonus = Object.values(statBonuses).reduce((s, v) => s + v, 0);
      if (totalBonus > 6) return res.status(400).json({ error: 'Максимум 6 бонусных очков' });
      for (const [stat, val] of Object.entries(statBonuses)) {
        if (defaults[stat] !== undefined) {
          defaults[stat] += val;
          if (defaults[stat] > 12) defaults[stat] = 12;
        }
      }
    }

    // Load base abilities from DB
    const baseAbilities = await AbilityTemplate.find({
      cls: { $in: [cls, 'any'] },
      type: { $in: ['passive', 'class_ability'] },
      unlockLevel: { $lte: 1 },
      active: true,
    }).lean();

    // Starting inventory
    // Load starting items from DB with images
    const startingItemIds = ['potion-health-small', 'leather-sandals', 'simple-pants', 'simple-shirt'];
    const startingFromDB = await GameItem.find({ itemId: { $in: startingItemIds } }).lean();
    const startingItems = startingItemIds.map(id => {
      const dbItem = startingFromDB.find(i => i.itemId === id);
      if (dbItem) return { itemId: dbItem.itemId, name: dbItem.name, type: dbItem.type, slot: dbItem.slot || 'none', rarity: dbItem.rarity || 'common', img: dbItem.img || '', usable: dbItem.usable, stackable: dbItem.stackable, effect: dbItem.effect, stats: dbItem.stats, weight: dbItem.weight || 1, quantity: 1 };
      // Fallback
      return { itemId: id, name: id, type: 'tool', rarity: 'common', quantity: 1 };
    });

    const hero = await Hero.create({
      userId: user._id,
      name,
      cls,
      race,
      gender,
      ...defaults,
      appearance: appearance || {},
      baseAbilities: baseAbilities.map(a => a.abilityId),
      inventory: startingItems,
      silver: 10,
    });

    res.status(201).json({ hero });
  } catch (err) { next(err); }
});

// GET /api/heroes/:id
router.get('/:id', auth(), async (req, res, next) => {
  try {
    const hero = await Hero.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });
    const obj = hero.toObject();
    const lookup = await getImgLookup();
    enrichItemImages(obj, lookup);
    res.json({ hero: obj });
  } catch (err) { next(err); }
});

// PATCH /api/heroes/:id
router.patch('/:id', auth(), validate(updateHeroSchema), async (req, res, next) => {
  try {
    const allowedFields = [
      'name', 'equipment', 'inventory', 'items', 'spells', 'gold', 'silver',
      'weaponChosen', 'xp', 'level', 'attack', 'agility', 'armor', 'intellect',
      'wisdom', 'charisma', 'maxHp', 'maxMp', 'hp', 'mp', 'canLevelUp',
      'tradePoints', 'missionCompletions', 'skillPoints', 'unlockedAbilities',
      'abilities', 'learnedAbilities', 'abilityChosen', 'baseAbilities', 'stash', 'stashRows',
    ];

    const update = {};
    for (const field of allowedFields) {
      if (req.validated.body[field] !== undefined) {
        update[field] = req.validated.body[field];
      }
    }

    const hero = await Hero.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      update,
      { new: true }
    );

    if (!hero) return res.status(404).json({ error: 'Герой не найден' });
    res.json({ hero });
  } catch (err) { next(err); }
});

// POST /api/heroes/:id/level-up
router.post('/:id/level-up', auth(), validate(levelUpSchema), async (req, res, next) => {
  try {
    const hero = await Hero.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });
    if (hero.level >= 50) return res.status(400).json({ error: 'Максимальный уровень' });

    const required = XP_THRESHOLDS[hero.level + 1] || Infinity;
    if (hero.xp < required) return res.status(400).json({ error: 'Недостаточно опыта' });

    hero.level += 1;
    const bonuses = LEVEL_UP_BONUSES[hero.cls] || { hpPercent: 8, mpPercent: 8 };
    const hpBonus = Math.max(1, Math.round(hero.maxHp * bonuses.hpPercent / 100));
    const mpBonus = Math.max(1, Math.round(hero.maxMp * bonuses.mpPercent / 100));

    hero.maxHp += hpBonus;
    hero.hp = hero.maxHp;
    hero.maxMp += mpBonus;
    hero.mp = hero.maxMp;
    hero.skillPoints += 2;
    hero.tradePoints += 1;

    // Check new ability unlock
    const newAbility = await AbilityTemplate.findOne({
      cls: hero.cls,
      unlockLevel: hero.level,
      active: true,
    }).lean();

    if (newAbility && !hero.unlockedAbilities.includes(newAbility.abilityId)) {
      hero.unlockedAbilities.push(newAbility.abilityId);
    }

    hero.canLevelUp = hero.xp >= (XP_THRESHOLDS[hero.level + 1] || Infinity);
    await hero.save();

    res.json({
      hero,
      rewards: { hpBonus, mpBonus, skillPoints: 2, tradePoints: 1, newAbility: newAbility?.abilityId || null },
    });
  } catch (err) { next(err); }
});

// POST /api/heroes/:id/spend-skill-points
router.post('/:id/spend-skill-points', auth(), validate(spendSkillPointsSchema), async (req, res, next) => {
  try {
    const hero = await Hero.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });

    const stats = req.validated.body;
    const total = Object.values(stats).reduce((s, v) => s + (v || 0), 0);
    if (total > hero.skillPoints) return res.status(400).json({ error: 'Недостаточно очков навыков' });

    for (const [stat, val] of Object.entries(stats)) {
      if (val && hero[stat] !== undefined) {
        hero[stat] += val;
      }
    }
    hero.skillPoints -= total;
    await hero.save();
    res.json({ hero });
  } catch (err) { next(err); }
});

// POST /api/heroes/:id/unlock-ability
router.post('/:id/unlock-ability', auth(), validate(unlockAbilitySchema), async (req, res, next) => {
  try {
    const hero = await Hero.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });

    const { abilityId, replaceAbilityId } = req.validated.body;
    const ability = await AbilityTemplate.findOne({ abilityId, active: true });
    if (!ability) return res.status(404).json({ error: 'Способность не найдена' });
    if (hero.level < ability.unlockLevel) return res.status(400).json({ error: 'Недостаточный уровень' });
    if (hero.learnedAbilities.includes(abilityId)) return res.status(400).json({ error: 'Уже разблокирована' });

    // Max 6 active abilities
    if (hero.abilities.length >= 6 && !replaceAbilityId) {
      return res.status(400).json({ error: 'Максимум 6 активных способностей. Укажите replaceAbilityId.' });
    }

    if (replaceAbilityId) {
      const idx = hero.abilities.indexOf(replaceAbilityId);
      if (idx !== -1) hero.abilities.splice(idx, 1);
    }

    hero.abilities.push(abilityId);
    hero.learnedAbilities.push(abilityId);
    await hero.save();
    res.json({ hero });
  } catch (err) { next(err); }
});

// POST /api/heroes/:id/trade
router.post('/:id/trade', auth(), validate(tradeSchema), async (req, res, next) => {
  try {
    const hero = await Hero.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });

    const { rarity } = req.validated.body;
    const cost = TRADE_POINT_COSTS[rarity];
    if (hero.tradePoints < cost) {
      return res.status(400).json({ error: `Нужно ${cost} очков обмена, у вас ${hero.tradePoints}` });
    }

    // Get random item of given rarity from DB
    const items = await GameItem.find({ rarity, active: true }).lean();
    if (!items.length) return res.status(404).json({ error: 'Предметы не найдены' });

    const item = items[Math.floor(Math.random() * items.length)];
    hero.tradePoints -= cost;
    hero.inventory.push({ ...item, quantity: 1 });
    await hero.save();
    res.json({ hero, item });
  } catch (err) { next(err); }
});

// DELETE /api/heroes/:id
router.delete('/:id', auth(), async (req, res, next) => {
  try {
    const hero = await Hero.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });
    res.json({ message: 'Герой удалён' });
  } catch (err) { next(err); }
});

module.exports = router;
