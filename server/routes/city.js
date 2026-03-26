const express = require('express');
const { auth } = require('../middleware/auth');
const { CITY_LOCATIONS } = require('../constants');
const Hero = require('../models/Hero');
const GameItem = require('../models/GameItem');
const NpcShop = require('../models/NpcShop');
const TradeOffer = require('../models/TradeOffer');
const WalletLedger = require('../models/WalletLedger');
const logger = require('../services/logger');

const router = express.Router();

// In-memory lobby state (will use Redis in production)
const lobbyPlayers = new Map(); // locationId -> Map<userId, playerData>

const SELL_PRICES = { common: 1, uncommon: 10, rare: 50, epic: 200, legendary: 5000 };
const THEMATIC_BONUS = 1.2; // +20%

const LOCATION_ACTIONS = {
  tavern: ['drink-ale', 'buy-provisions'],
  smithy: ['upgrade-weapon', 'repair-armor', 'craft-item'],
  temple: ['blessing', 'buy-scroll', 'craft-scroll'],
  alchemist_lab: ['buy-potion', 'craft-potion'],
  herbalist_hut: ['buy-herbs'],
  shop: ['buy-item'],
  main_shop: [],
  gates: [],
};

// Per-location action overrides (adds craft to specific shops)
const LOCATION_ACTIONS_OVERRIDE = {
  'shop-1': ['buy-item', 'craft-item'],   // Книжная лавка — крафт книг
  'shop-2': ['buy-item', 'craft-item'],   // Ювелирная — крафт украшений
  'shop-4': ['buy-item', 'craft-item'],   // Лавка Брона — крафт одежды
};

const LOCATION_MAP_IMAGES = {
  'tavern-1': '/uploads/maps/tavern-1.png',
  'tavern-2': '/uploads/maps/tavern-2.png',
  'tavern-3': '/uploads/maps/tavern-3.png',
  'tavern-4': '/uploads/maps/tavern-4.png',
  'smithy': '/uploads/maps/smithy.png',
  'temple': '/uploads/maps/temple.png',
  'alchemist': '/uploads/maps/alchemist.png',
  'herbalist': '/uploads/maps/herbalist.png',
  'shop-1': '/uploads/maps/shop-1.png',
  'shop-2': '/uploads/maps/shop-2.png',
  'shop-3': '/uploads/maps/shop-3.png',
};

// ==========================================
// LOCATIONS
// ==========================================

// GET /api/city/locations
router.get('/locations', auth(), async (req, res, next) => {
  try {
    const locations = CITY_LOCATIONS.map(loc => ({
      ...loc,
      onlinePlayers: lobbyPlayers.get(loc.id)?.size || 0,
      actions: LOCATION_ACTIONS_OVERRIDE[loc.id] || LOCATION_ACTIONS[loc.type] || [],
      mapImage: LOCATION_MAP_IMAGES[loc.id] || '',
    }));
    res.json({ locations });
  } catch (err) { next(err); }
});

// ==========================================
// LOBBY JOIN / LEAVE / STATE
// ==========================================

// POST /api/city/lobby/:locationId/join
router.post('/lobby/:locationId/join', auth(), async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { heroId } = req.body;

    const location = CITY_LOCATIONS.find(l => l.id === locationId);
    if (!location) return res.status(404).json({ error: 'Локация не найдена' });

    // Special locations
    if (location.type === 'main_shop') return res.json({ redirect: '/lavka' });
    if (location.type === 'gates') return res.json({ redirect: '/dashboard' });

    // Check capacity
    const players = lobbyPlayers.get(locationId) || new Map();
    if (players.size >= location.maxPlayers) {
      return res.status(400).json({ error: 'Локация заполнена' });
    }

    // Get hero
    const hero = heroId ? await Hero.findOne({ _id: heroId, userId: req.user.userId }).lean() : null;

    // Add player to lobby
    const playerData = {
      userId: req.user.userId,
      displayName: req.user.displayName || 'Игрок',
      heroId: hero?._id?.toString() || null,
      heroName: hero?.name || '',
      cls: hero?.cls || '',
      level: hero?.level || 1,
      position: { x: 5, y: 5 }, // default spawn
      joinedAt: new Date(),
    };
    players.set(req.user.userId, playerData);
    lobbyPlayers.set(locationId, players);

    // Get NPC shop
    const npcShop = await NpcShop.findOne({ locationId }).lean();

    // Get all players
    const playersList = Array.from(players.values());

    res.json({
      location: {
        ...location,
        mapImage: LOCATION_MAP_IMAGES[locationId] || '',
        actions: LOCATION_ACTIONS_OVERRIDE[locationId] || LOCATION_ACTIONS[location.type] || [],
      },
      players: playersList,
      npcShop: npcShop ? {
        npcName: npcShop.npcName,
        npcType: npcShop.npcType,
        npcImg: npcShop.npcImg,
        greeting: npcShop.greeting,
        goldBalance: npcShop.goldBalance,
        silverBalance: npcShop.silverBalance,
      } : null,
      hero,
    });
  } catch (err) { next(err); }
});

// POST /api/city/lobby/:locationId/leave
router.post('/lobby/:locationId/leave', auth(), async (req, res, next) => {
  try {
    const players = lobbyPlayers.get(req.params.locationId);
    if (players) {
      players.delete(req.user.userId);
      if (players.size === 0) lobbyPlayers.delete(req.params.locationId);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/city/lobby/:locationId
router.get('/lobby/:locationId', auth(), async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const location = CITY_LOCATIONS.find(l => l.id === locationId);
    if (!location) return res.status(404).json({ error: 'Локация не найдена' });

    const players = lobbyPlayers.get(locationId) || new Map();
    const npcShop = await NpcShop.findOne({ locationId }).lean();

    res.json({
      location: { ...location, mapImage: LOCATION_MAP_IMAGES[locationId] || '' },
      players: Array.from(players.values()),
      npcShop: npcShop || null,
    });
  } catch (err) { next(err); }
});

// ==========================================
// NPC SHOP
// ==========================================

// GET /api/city/npc/:locationId/shop
router.get('/npc/:locationId/shop', auth(), async (req, res, next) => {
  try {
    const npcShop = await NpcShop.findOne({ locationId: req.params.locationId });
    if (!npcShop) return res.status(404).json({ error: 'Магазин не найден' });

    // Load ALL items assigned to this shop location from GameItem
    const baseItems = await GameItem.find({
      active: true,
      $or: [
        { itemId: { $in: npcShop.baseItems || [] } },
        { shopLocation: req.params.locationId },
      ],
    }).lean();

    // Combine base items + sold items
    const items = [
      ...baseItems.map(item => ({
        ...item,
        source: 'base',
        sellPrice: item.price || SELL_PRICES[item.rarity] || 1,
      })),
      ...npcShop.soldToNpcItems.map(si => ({
        itemId: si.itemId,
        name: si.name,
        rarity: si.rarity,
        qty: si.qty,
        price: si.price || SELL_PRICES[si.rarity] || 1,
        source: 'player',
      })),
    ];

    res.json({
      npcName: npcShop.npcName,
      npcType: npcShop.npcType,
      npcImg: npcShop.npcImg,
      greeting: npcShop.greeting,
      goldBalance: npcShop.goldBalance,
      silverBalance: npcShop.silverBalance,
      items,
    });
  } catch (err) { next(err); }
});

// POST /api/city/npc/:locationId/buy
router.post('/npc/:locationId/buy', auth(), async (req, res, next) => {
  try {
    const { itemId, quantity = 1, heroId } = req.body;
    if (!itemId || !heroId) return res.status(400).json({ error: 'itemId и heroId обязательны' });

    const npcShop = await NpcShop.findOne({ locationId: req.params.locationId });
    if (!npcShop) return res.status(404).json({ error: 'Магазин не найден' });

    const hero = await Hero.findOne({ _id: heroId, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });

    // Find item: first in GameItem DB, then in NPC's soldToNpcItems
    let gameItem = await GameItem.findOne({ itemId, active: true }).lean();
    let price = 0;
    let fromPlayerStock = false;

    if (gameItem) {
      price = (gameItem.price || SELL_PRICES[gameItem.rarity] || 1) * quantity;
    } else {
      // Check NPC's player-sold items
      const soldIdx = npcShop.soldToNpcItems.findIndex(si => si.itemId === itemId);
      if (soldIdx === -1) return res.status(404).json({ error: 'Предмет не найден' });
      const soldItem = npcShop.soldToNpcItems[soldIdx];
      price = (soldItem.price || SELL_PRICES[soldItem.rarity] || 1) * quantity;
      gameItem = { itemId: soldItem.itemId, name: soldItem.name, rarity: soldItem.rarity, type: 'junk', slot: 'none', weight: 1 };
      fromPlayerStock = true;
    }

    // Check hero can pay (silver first, then gold)
    if (hero.silver >= price) {
      hero.silver -= price;
    } else if (hero.silver + hero.gold * 100 >= price) {
      let remaining = price - hero.silver;
      hero.silver = 0;
      hero.gold -= Math.ceil(remaining / 100);
    } else {
      return res.status(400).json({ error: `Недостаточно средств. Нужно ${price} серебра` });
    }

    // Add item to inventory (with stacking)
    const isStackable = gameItem.stackable || ['potion', 'scroll', 'food', 'tool', 'junk', 'quest'].includes(gameItem.type);
    const existingIdx = isStackable ? hero.inventory.findIndex(i => i.itemId === itemId) : -1;
    if (existingIdx >= 0) {
      hero.inventory[existingIdx].quantity = (hero.inventory[existingIdx].quantity || 1) + quantity;
      hero.markModified('inventory');
    } else {
      hero.inventory.push({ ...gameItem, stackable: isStackable, quantity });
    }

    // Remove from NPC player stock if applicable
    if (fromPlayerStock) {
      const soldIdx = npcShop.soldToNpcItems.findIndex(si => si.itemId === itemId);
      if (soldIdx !== -1) {
        if (npcShop.soldToNpcItems[soldIdx].qty > 1) {
          npcShop.soldToNpcItems[soldIdx].qty--;
        } else {
          npcShop.soldToNpcItems.splice(soldIdx, 1);
        }
      }
    }

    // Update NPC balance
    npcShop.silverBalance += price;
    await npcShop.save();
    await hero.save();

    res.json({
      hero,
      npcBalance: { gold: npcShop.goldBalance, silver: npcShop.silverBalance },
    });
  } catch (err) { next(err); }
});

// POST /api/city/npc/:locationId/sell
router.post('/npc/:locationId/sell', auth(), async (req, res, next) => {
  try {
    const { itemIndex, heroId } = req.body;
    if (itemIndex === undefined || !heroId) return res.status(400).json({ error: 'itemIndex и heroId обязательны' });

    const npcShop = await NpcShop.findOne({ locationId: req.params.locationId });
    if (!npcShop) return res.status(404).json({ error: 'Магазин не найден' });

    const hero = await Hero.findOne({ _id: heroId, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });

    const item = hero.inventory[itemIndex];
    if (!item) return res.status(400).json({ error: 'Предмет не найден в инвентаре' });

    // Calculate sell price
    let sellPrice = SELL_PRICES[item.rarity] || 1;
    if (npcShop.thematicTypes.includes(item.type)) {
      sellPrice = Math.ceil(sellPrice * THEMATIC_BONUS);
    }

    // Check NPC has enough funds
    if (npcShop.silverBalance < sellPrice) {
      return res.status(400).json({ error: 'У торговца недостаточно средств' });
    }

    // Remove item from hero
    if (item.stackable && (item.quantity || 1) > 1) {
      hero.inventory[itemIndex].quantity--;
    } else {
      hero.inventory.splice(itemIndex, 1);
    }

    // Give currency to hero
    hero.silver += sellPrice;

    // Update NPC
    npcShop.silverBalance -= sellPrice;
    npcShop.soldToNpcItems.push({
      itemId: item.itemId || `sold-${Date.now()}`,
      name: item.name,
      rarity: item.rarity || 'common',
      qty: 1,
      price: sellPrice,
      soldBy: req.user.userId,
      soldAt: new Date(),
    });

    await hero.save();
    await npcShop.save();

    res.json({
      hero,
      sellPrice,
      npcBalance: { gold: npcShop.goldBalance, silver: npcShop.silverBalance },
    });
  } catch (err) { next(err); }
});

// ==========================================
// CITY ACTIONS
// ==========================================

// POST /api/city/action
router.post('/action', auth(), async (req, res, next) => {
  try {
    const { locationId, action, heroId } = req.body;
    if (!locationId || !action || !heroId) {
      return res.status(400).json({ error: 'locationId, action, heroId обязательны' });
    }

    const hero = await Hero.findOne({ _id: heroId, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });

    const location = CITY_LOCATIONS.find(l => l.id === locationId);
    if (!location) return res.status(404).json({ error: 'Локация не найдена' });

    const result = { success: false, message: '', effect: {} };

    switch (action) {
      case 'drink-ale': {
        if (hero.silver < 10) return res.status(400).json({ error: 'Нужно 10 серебра' });
        hero.silver -= 10;
        hero.hp = Math.min(hero.maxHp, hero.hp + 5);
        result.success = true;
        result.message = 'Вы выпили кружку эля. +5 HP!';
        result.effect = { hpBonus: 5 };
        break;
      }
      case 'blessing': {
        if (hero.silver < 10) return res.status(400).json({ error: 'Нужно 10 серебра' });
        hero.silver -= 10;
        hero.mp = Math.min(hero.maxMp, hero.mp + 5);
        result.success = true;
        result.message = 'Жрец благословил вас. +5 MP!';
        result.effect = { mpBonus: 5 };
        break;
      }
      case 'upgrade-weapon': {
        if (hero.silver < 20) return res.status(400).json({ error: 'Нужно 20 серебра' });
        if (!hero.equipment?.weapon) return res.status(400).json({ error: 'Нет экипированного оружия' });
        hero.silver -= 20;
        if (!hero.equipment.weapon.damage) hero.equipment.weapon.damage = { die: 'd6', bonus: 0 };
        hero.equipment.weapon.damage.bonus = (hero.equipment.weapon.damage.bonus || 0) + 1;
        hero.markModified('equipment');
        result.success = true;
        result.message = `Оружие улучшено! Бонус урона: +${hero.equipment.weapon.damage.bonus}`;
        result.effect = { weaponUpgrade: true };
        break;
      }
      case 'repair-armor': {
        if (hero.silver < 20) return res.status(400).json({ error: 'Нужно 20 серебра' });
        hero.silver -= 20;
        result.success = true;
        result.message = 'Броня отремонтирована!';
        result.effect = { armorRepaired: true };
        break;
      }
      default:
        return res.status(400).json({ error: `Неизвестное действие: ${action}` });
    }

    await hero.save();
    res.json({ ...result, hero });
  } catch (err) { next(err); }
});

// ==========================================
// PLAYER TRADING
// ==========================================

// POST /api/city/trade/offer
router.post('/trade/offer', auth(), async (req, res, next) => {
  try {
    const { targetUserId, heroId, locationId, offerItems, requestItems, goldOffer, silverOffer } = req.body;

    const hero = await Hero.findOne({ _id: heroId, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });

    const trade = await TradeOffer.create({
      fromUserId: req.user.userId,
      toUserId: targetUserId,
      fromHeroId: heroId,
      locationId,
      offerItems: offerItems || [],
      requestItems: requestItems || [],
      goldOffer: goldOffer || 0,
      silverOffer: silverOffer || 0,
      status: 'pending',
    });

    res.status(201).json({ trade });
  } catch (err) { next(err); }
});

// POST /api/city/trade/:offerId/accept
router.post('/trade/:offerId/accept', auth(), async (req, res, next) => {
  try {
    const trade = await TradeOffer.findById(req.params.offerId);
    if (!trade) return res.status(404).json({ error: 'Предложение не найдено' });
    if (trade.toUserId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Это предложение не для вас' });
    }
    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Предложение уже обработано' });
    }

    const fromHero = await Hero.findById(trade.fromHeroId);
    const toHero = req.body.heroId ? await Hero.findOne({ _id: req.body.heroId, userId: req.user.userId }) : null;

    if (!fromHero) return res.status(404).json({ error: 'Герой отправителя не найден' });

    // Validate sender has enough funds
    if (trade.goldOffer > 0 && fromHero.gold < trade.goldOffer) {
      return res.status(400).json({ error: 'У отправителя недостаточно золота' });
    }
    if (trade.silverOffer > 0 && fromHero.silver < trade.silverOffer) {
      return res.status(400).json({ error: 'У отправителя недостаточно серебра' });
    }

    // Validate items still exist
    for (const offerItem of trade.offerItems) {
      if (offerItem.itemIndex >= fromHero.inventory.length) {
        return res.status(400).json({ error: 'Предмет больше не в инвентаре отправителя' });
      }
    }

    // Transfer offer items: from → to
    for (const offerItem of trade.offerItems) {
      if (offerItem.itemIndex < fromHero.inventory.length) {
        const item = fromHero.inventory[offerItem.itemIndex];
        if (toHero) {
          const raw = item.toObject ? item.toObject() : { ...item };
          const id = raw.itemId || raw.name;
          const isStackable = raw.stackable || ['potion', 'scroll', 'food', 'ingredient', 'reagent', 'material', 'tool', 'junk'].includes(raw.type);
          const existIdx = isStackable ? toHero.inventory.findIndex(i => (i.itemId || i.name) === id) : -1;
          if (existIdx >= 0) {
            toHero.inventory[existIdx].quantity = (toHero.inventory[existIdx].quantity || 1) + (raw.quantity || 1);
            toHero.markModified('inventory');
          } else {
            toHero.inventory.push(raw);
          }
        }
      }
    }
    // Remove offered items (reverse order to maintain indices)
    const offerIndices = trade.offerItems.map(i => i.itemIndex).sort((a, b) => b - a);
    for (const idx of offerIndices) {
      fromHero.inventory.splice(idx, 1);
    }

    // Transfer gold/silver
    if (trade.goldOffer > 0) {
      fromHero.gold -= trade.goldOffer;
      if (toHero) toHero.gold += trade.goldOffer;
    }
    if (trade.silverOffer > 0) {
      fromHero.silver -= trade.silverOffer;
      if (toHero) toHero.silver += trade.silverOffer;
    }

    trade.status = 'completed';
    await Promise.all([trade.save(), fromHero.save(), toHero?.save()].filter(Boolean));

    res.json({ trade, fromHero, toHero });
  } catch (err) { next(err); }
});

// POST /api/city/trade/:offerId/reject
router.post('/trade/:offerId/reject', auth(), async (req, res, next) => {
  try {
    const trade = await TradeOffer.findById(req.params.offerId);
    if (!trade) return res.status(404).json({ error: 'Предложение не найдено' });
    trade.status = 'rejected';
    await trade.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ==========================================
// BULLETIN BOARD
// ==========================================

// GET /api/city/bulletin-board
router.get('/bulletin-board', auth(), async (req, res, next) => {
  try {
    // Static announcements for now (can be moved to DB later)
    const announcements = [
      { title: 'Добро пожаловать в Талорию!', text: 'Исследуйте город, торгуйте с NPC и другими игроками, готовьтесь к приключениям.', date: new Date().toISOString(), author: 'Система' },
      { title: 'Новые сценарии', text: 'Скоро будут доступны новые карты и сценарии. Следите за обновлениями!', date: new Date().toISOString(), author: 'Команда Taloria' },
    ];
    res.json({ announcements });
  } catch (err) { next(err); }
});

// ==============================
// CRAFT SYSTEM
// ==============================
const CraftRecipe = require('../models/CraftRecipe');

// GET /api/city/craft/recipes?locationId=smithy&heroId=xxx
router.get('/craft/recipes', auth(), async (req, res, next) => {
  try {
    const { locationId, heroId } = req.query;
    const filter = { active: true };
    if (locationId) filter.locationId = locationId;
    const recipes = await CraftRecipe.find(filter).lean();

    // If heroId provided, annotate each recipe with ingredient availability
    let hero = null;
    if (heroId) {
      hero = await Hero.findOne({ _id: heroId, userId: req.user.userId }).lean();
    }

    // Load craft limits + all item images from GameItem
    const allIngredientIds = new Set();
    const craftResultIds = [];
    recipes.forEach(r => {
      craftResultIds.push(r.result?.itemId || r.recipeId);
      (r.ingredients || []).forEach(i => { if (i.itemId) allIngredientIds.add(i.itemId); });
    });
    const allRelevantIds = [...new Set([...craftResultIds, ...allIngredientIds])];
    const allRelevantItems = await GameItem.find({ itemId: { $in: allRelevantIds } }).select('itemId name img craftLimit craftCount').lean();
    const imgLookup = {};
    const craftLimits = {};
    allRelevantItems.forEach(ci => {
      if (ci.img) { imgLookup[ci.itemId] = ci.img; imgLookup[ci.name] = ci.img; }
      if (craftResultIds.includes(ci.itemId)) {
        craftLimits[ci.itemId] = { limit: ci.craftLimit || 0, count: ci.craftCount || 0 };
      }
    });

    const annotated = recipes.map(recipe => {
      const resultId = recipe.result?.itemId || recipe.recipeId;
      const limits = craftLimits[resultId] || { limit: 0, count: 0 };
      const soldOut = limits.limit > 0 && limits.count >= limits.limit;

      // Enrich ingredients with images
      let ingredientStatus = (recipe.ingredients || []).map(ing => ({
        ...ing,
        img: imgLookup[ing.itemId] || imgLookup[ing.name] || '',
      }));
      let canCraft = false;
      if (hero && !soldOut) {
        ingredientStatus = ingredientStatus.map(ing => {
          const owned = (hero.inventory || [])
            .filter(item => item.itemId === ing.itemId || item.name === ing.name)
            .reduce((sum, item) => sum + (item.quantity || 1), 0);
          return { ...ing, owned, hasEnough: owned >= ing.quantity };
        });
        canCraft = ingredientStatus.every(i => i.hasEnough);
      }

      // Enrich result image
      const enrichedResult = recipe.result ? {
        ...recipe.result,
        img: recipe.result.img || imgLookup[recipe.result.itemId] || imgLookup[recipe.result.name] || '',
      } : recipe.result;

      return {
        ...recipe, result: enrichedResult, ingredientStatus, canCraft, soldOut,
        craftLimit: limits.limit, craftCount: limits.count,
        craftRemaining: limits.limit > 0 ? limits.limit - limits.count : null,
      };
    });

    res.json({ recipes: annotated });
  } catch (err) { next(err); }
});

// GET /api/city/craft/recipes/:recipeId - single recipe with ingredient check
router.get('/craft/recipes/:recipeId', auth(), async (req, res, next) => {
  try {
    const recipe = await CraftRecipe.findOne({ recipeId: req.params.recipeId, active: true }).lean();
    if (!recipe) return res.status(404).json({ error: 'Рецепт не найден' });

    // Load images for all ingredients and result
    const ingIds = (recipe.ingredients || []).map(i => i.itemId).filter(Boolean);
    const resultId = recipe.result?.itemId || recipe.recipeId;
    const allIds = [...new Set([...ingIds, resultId])];
    const dbItems = await GameItem.find({ itemId: { $in: allIds } }).select('itemId name img').lean();
    const imgLookup = {};
    dbItems.forEach(i => { if (i.img) { imgLookup[i.itemId] = i.img; imgLookup[i.name] = i.img; } });

    // Enrich result image
    if (recipe.result) {
      recipe.result.img = recipe.result.img || imgLookup[recipe.result.itemId] || imgLookup[recipe.result.name] || '';
    }

    // Check hero inventory for ingredients
    const heroId = req.query.heroId;
    let ingredientStatus = (recipe.ingredients || []).map(ing => ({
      ...ing,
      img: imgLookup[ing.itemId] || imgLookup[ing.name] || '',
    }));

    if (heroId) {
      const hero = await Hero.findOne({ _id: heroId, userId: req.user.userId }).lean();
      if (hero) {
        ingredientStatus = ingredientStatus.map(ing => {
          const owned = (hero.inventory || [])
            .filter(item => item.itemId === ing.itemId || item.name === ing.name)
            .reduce((sum, item) => sum + (item.quantity || 1), 0);
          return { ...ing, owned, hasEnough: owned >= ing.quantity };
        });
      }
    }

    res.json({ recipe, ingredientStatus });
  } catch (err) { next(err); }
});

// POST /api/city/craft - execute craft
router.post('/craft', auth(), async (req, res, next) => {
  try {
    const { recipeId, heroId } = req.body;
    if (!recipeId || !heroId) return res.status(400).json({ error: 'recipeId и heroId обязательны' });

    const recipe = await CraftRecipe.findOne({ recipeId, active: true });
    if (!recipe) return res.status(404).json({ error: 'Рецепт не найден' });

    // Check craft limit from GameItem
    const craftItem = await GameItem.findOne({ itemId: recipe.result?.itemId || recipeId });
    if (craftItem?.craftLimit > 0 && (craftItem.craftCount || 0) >= craftItem.craftLimit) {
      return res.status(400).json({
        error: `Лимит крафта исчерпан! Создано ${craftItem.craftCount}/${craftItem.craftLimit}`,
        craftCount: craftItem.craftCount,
        craftLimit: craftItem.craftLimit,
      });
    }

    const hero = await Hero.findOne({ _id: heroId, userId: req.user.userId });
    if (!hero) return res.status(404).json({ error: 'Герой не найден' });

    // Check level (support both field names)
    const reqLevel = recipe.requiredLevel || recipe.level || 1;
    if (hero.level < reqLevel) {
      return res.status(400).json({ error: `Нужен уровень ${reqLevel} (у вас ${hero.level})` });
    }

    // Check silver (optional cost)
    const craftCost = recipe.craftCostSilver || 0;
    if (craftCost > 0 && (hero.silver || 0) < craftCost) {
      return res.status(400).json({ error: `Нужно ${craftCost} серебра (у вас ${hero.silver})` });
    }

    // Check all ingredients
    const missing = [];
    for (const ing of recipe.ingredients) {
      const owned = (hero.inventory || [])
        .filter(item => item.itemId === ing.itemId || item.name === ing.name)
        .reduce((sum, item) => sum + (item.quantity || 1), 0);
      if (owned < ing.quantity) {
        missing.push(`${ing.name}: нужно ${ing.quantity}, есть ${owned}`);
      }
    }
    if (missing.length > 0) {
      return res.status(400).json({ error: 'Не хватает ингредиентов', missing });
    }

    // Remove ingredients from inventory
    for (const ing of recipe.ingredients) {
      let toRemove = ing.quantity;
      for (let i = hero.inventory.length - 1; i >= 0 && toRemove > 0; i--) {
        const item = hero.inventory[i];
        if (item.itemId === ing.itemId) {
          const qty = item.quantity || 1;
          if (qty <= toRemove) {
            hero.inventory.splice(i, 1);
            toRemove -= qty;
          } else {
            hero.inventory[i].quantity = qty - toRemove;
            toRemove = 0;
          }
        }
      }
    }

    // Deduct silver
    hero.silver = (hero.silver || 0) - craftCost;

    // Add result item (from recipe.result or legacy fields)
    const r = recipe.result || {};
    const resultItem = {
      itemId: r.itemId || recipe.resultItemId || recipe.recipeId,
      name: r.name || recipe.resultName || recipe.name,
      type: r.type || 'tool',
      slot: r.slot || 'none',
      rarity: r.rarity || recipe.resultRarity || 'legendary',
      description: r.description || recipe.description || '',
      characteristics: r.characteristics || '',
      advantages: r.advantages || '',
      img: r.img || recipe.resultImg || '',
      damage: r.damage,
      stats: r.stats,
      effect: r.effect,
    };

    // Check if stackable and already in inventory
    const resultStackable = resultItem.stackable || ['potion', 'scroll', 'food', 'tool', 'junk', 'quest'].includes(resultItem.type);
    const existingIdx = resultStackable ? hero.inventory.findIndex(i => i.itemId === resultItem.itemId) : -1;
    if (existingIdx >= 0) {
      hero.inventory[existingIdx].quantity = (hero.inventory[existingIdx].quantity || 1) + 1;
    } else {
      hero.inventory.push({ ...resultItem, quantity: 1 });
    }

    hero.markModified('inventory');
    await hero.save();

    // Increment global craft counter
    if (craftItem) {
      await GameItem.updateOne({ _id: craftItem._id }, { $inc: { craftCount: 1 } });
    }

    const remaining = craftItem?.craftLimit > 0 ? craftItem.craftLimit - (craftItem.craftCount || 0) - 1 : null;

    res.json({
      success: true,
      message: `Скрафчено: ${resultItem.name}!`,
      hero,
      craftedItem: resultItem,
      craftCount: (craftItem?.craftCount || 0) + 1,
      craftLimit: craftItem?.craftLimit || 0,
      remaining,
    });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.lobbyPlayers = lobbyPlayers;
