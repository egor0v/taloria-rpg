/**
 * LootGenerator — Loot generation for Taloria RPG
 * Based on game-implementation-guide.md §9.6, §10.1
 */

const GameItem = require('../models/GameItem');

// Loot tables from docs
const MONSTER_LOOT = {
  common: [
    { type: 'silver', weight: 60, min: 3, max: 10 },
    { type: 'potion', weight: 20 },
    { type: 'junk',   weight: 10 },
    { type: 'weapon', weight: 7, rarity: 'common' },
    { type: 'scroll', weight: 3 },
  ],
  elite: [
    { type: 'silver',  weight: 40, min: 10, max: 25 },
    { type: 'potion',  weight: 20, qty: [1, 2] },
    { type: 'weapon',  weight: 15, rarity: 'uncommon' },
    { type: 'armor',   weight: 10, rarity: 'uncommon' },
    { type: 'scroll',  weight: 10 },
    { type: 'item',    weight: 5, rarity: 'rare' },
    { type: 'gold',    weight: 1, min: 1, max: 3 },
  ],
  boss: [
    { type: 'gold',   weight: 50, min: 2, max: 6 },
    { type: 'item',   weight: 100, rarity: 'rare' },
    { type: 'item',   weight: 20, rarity: 'epic' },
    { type: 'potion', weight: 15, qty: [2, 4] },
    { type: 'item',   weight: 1, rarity: 'legendary' },
  ],
};

const CHEST_LOOT = {
  normal: {
    items: [2, 4],
    emptyChance: 0.15,
    table: [
      { type: 'silver', weight: 40, min: 5, max: 15 },
      { type: 'potion', weight: 25 },
      { type: 'tool',   weight: 15 },
      { type: 'junk',   weight: 10 },
      { type: 'weapon', weight: 10, rarity: 'common' },
      { type: 'armor',  weight: 5, rarity: 'common' },
      { type: 'scroll', weight: 5 },
    ],
  },
  large: {
    items: [3, 5],
    emptyChance: 0,
    table: [
      { type: 'gold',   weight: 30, min: 15, max: 30 },
      { type: 'item',   weight: 25, rarity: 'rare' },
      { type: 'armor',  weight: 10, rarity: 'uncommon' },
      { type: 'scroll', weight: 15 },
      { type: 'item',   weight: 5, rarity: 'epic' },
    ],
  },
};

const SELL_PRICES = {
  common: 1,
  uncommon: 10,
  rare: 50,
  epic: 100,
  legendary: 500,
};

const RARITY_STAT_MULTIPLIER = {
  common: 1, uncommon: 1.2, rare: 1.5, epic: 2, legendary: 2.5,
};

/**
 * Roll from weighted table
 */
function rollWeightedTable(table) {
  const totalWeight = table.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return table[table.length - 1];
}

/**
 * Generate loot for a killed monster
 */
async function generateMonsterLoot(monster) {
  const lootType = monster.lootTable || (monster.xpReward >= 80 ? 'boss' : monster.xpReward >= 40 ? 'elite' : 'common');
  const table = MONSTER_LOOT[lootType] || MONSTER_LOOT.common;
  const loot = [];

  // Silver/gold from monster
  const silver = Math.floor(Math.random() * (monster.goldMax - monster.goldMin + 1)) + monster.goldMin;
  if (silver > 0) loot.push({ type: 'currency', currency: 'silver', amount: silver });

  // One loot roll
  const entry = rollWeightedTable(table);
  const item = await resolveEntry(entry);
  if (item) loot.push(item);

  return loot;
}

/**
 * Generate loot for a chest
 */
async function generateChestLoot(chestType = 'normal') {
  const config = CHEST_LOOT[chestType] || CHEST_LOOT.normal;

  if (Math.random() < config.emptyChance) {
    return []; // Empty chest
  }

  const numItems = config.items[0] + Math.floor(Math.random() * (config.items[1] - config.items[0] + 1));
  const loot = [];

  for (let i = 0; i < numItems; i++) {
    const entry = rollWeightedTable(config.table);
    const item = await resolveEntry(entry);
    if (item) loot.push(item);
  }

  return loot;
}

/**
 * Resolve a loot table entry into an actual item
 */
async function resolveEntry(entry) {
  if (!entry) return null;

  // Currency
  if (entry.type === 'silver' || entry.type === 'gold') {
    const amount = entry.min + Math.floor(Math.random() * ((entry.max || entry.min) - entry.min + 1));
    return { type: 'currency', currency: entry.type, amount };
  }

  // Get random item from DB
  const query = { active: true };

  if (entry.type === 'potion') query.type = 'potion';
  else if (entry.type === 'weapon') query.type = 'weapon';
  else if (entry.type === 'armor') query.type = { $in: ['armor', 'helmet', 'boots', 'pants'] };
  else if (entry.type === 'scroll') query.type = 'scroll';
  else if (entry.type === 'junk') query.type = { $in: ['junk', 'tool'] };
  else if (entry.type === 'tool') query.type = 'tool';
  else if (entry.type === 'item') { /* any type */ }

  if (entry.rarity) query.rarity = entry.rarity;

  try {
    const items = await GameItem.find(query).lean();
    if (items.length === 0) return null;
    const template = items[Math.floor(Math.random() * items.length)];

    const qty = entry.qty ? (entry.qty[0] + Math.floor(Math.random() * (entry.qty[1] - entry.qty[0] + 1))) : 1;

    return {
      itemId: template.itemId,
      name: template.name,
      type: template.type,
      slot: template.slot || 'none',
      rarity: template.rarity || 'common',
      description: template.description,
      damage: template.damage,
      range: template.range,
      weight: template.weight || 1,
      stats: template.stats,
      effect: template.effect,
      img: template.img,
      stackable: template.stackable,
      usable: template.usable || template.type === 'potion' || template.type === 'scroll',
      quantity: qty,
      sellPrice: SELL_PRICES[template.rarity || 'common'],
    };
  } catch {
    return null;
  }
}

module.exports = {
  generateMonsterLoot,
  generateChestLoot,
  SELL_PRICES,
  RARITY_STAT_MULTIPLIER,
};
