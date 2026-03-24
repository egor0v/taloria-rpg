require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config');
const CraftRecipe = require('../models/CraftRecipe');

const recipes = [
  // === КУЗНИЦА (smithy) ===
  {
    recipeId: 'craft-steel-sword',
    resultItemId: 'steel-sword',
    resultName: 'Стальной меч',
    resultDescription: 'Надёжный стальной клинок. Отличный урон в ближнем бою.',
    resultImg: '/uploads/items/steel-sword.png',
    resultRarity: 'uncommon',
    resultItem: { itemId: 'steel-sword', name: 'Стальной меч', type: 'weapon', slot: 'weapon', rarity: 'uncommon', damage: { die: 'd8', bonus: 2 }, range: 1, weight: 3, img: '/uploads/items/steel-sword.png' },
    ingredients: [
      { itemId: 'iron-sword', name: 'Железный меч', quantity: 1, hint: 'Купить в кузнице (15 серебра)' },
      { itemId: 'iron-ingot', name: 'Стальной слиток', quantity: 2, hint: 'Купить в кузнице (5 серебра) или найти в сундуках на карте «Пещера троллей»' },
      { itemId: 'leather-strip', name: 'Кожаный ремень', quantity: 1, hint: 'Купить у травницы (3 серебра)' },
    ],
    craftCostSilver: 10,
    requiredLevel: 3,
    locationId: 'smithy',
    category: 'weapon',
  },
  {
    recipeId: 'craft-battle-axe',
    resultItemId: 'battle-axe',
    resultName: 'Боевой топор',
    resultDescription: 'Тяжёлый двуручный топор. Огромный урон, но медленный.',
    resultImg: '/uploads/items/battle-axe.png',
    resultRarity: 'uncommon',
    resultItem: { itemId: 'battle-axe', name: 'Боевой топор', type: 'weapon', slot: 'weapon', rarity: 'uncommon', damage: { die: 'd10', bonus: 1 }, range: 1, weight: 5, img: '/uploads/items/battle-axe.png' },
    ingredients: [
      { itemId: 'iron-ingot', name: 'Стальной слиток', quantity: 3, hint: 'Купить в кузнице (5 серебра)' },
      { itemId: 'oak-log', name: 'Дубовое полено', quantity: 2, hint: 'Найти на карте «Заброшенная дорога» (сундуки)' },
      { itemId: 'leather-strip', name: 'Кожаный ремень', quantity: 2, hint: 'Купить у травницы (3 серебра)' },
    ],
    craftCostSilver: 15,
    requiredLevel: 5,
    locationId: 'smithy',
    category: 'weapon',
  },
  {
    recipeId: 'craft-chain-mail',
    resultItemId: 'chain-mail',
    resultName: 'Кольчуга',
    resultDescription: 'Прочная кольчужная броня. Хорошая защита для воинов.',
    resultImg: '/uploads/items/chain-mail.png',
    resultRarity: 'uncommon',
    resultItem: { itemId: 'chain-mail', name: 'Кольчуга', type: 'armor', slot: 'armor', rarity: 'uncommon', stats: { armor: 4 }, weight: 6, img: '/uploads/items/chain-mail.png' },
    ingredients: [
      { itemId: 'iron-ingot', name: 'Стальной слиток', quantity: 4, hint: 'Купить в кузнице (5 серебра)' },
      { itemId: 'leather-armor', name: 'Кожаная броня', quantity: 1, hint: 'Купить в Лавке Брона (12 серебра)' },
    ],
    craftCostSilver: 20,
    requiredLevel: 4,
    locationId: 'smithy',
    category: 'armor',
  },
  {
    recipeId: 'craft-iron-shield',
    resultItemId: 'iron-shield',
    resultName: 'Железный щит',
    resultDescription: 'Крепкий щит. +3 к броне при блоке.',
    resultImg: '/uploads/items/iron-shield.png',
    resultRarity: 'uncommon',
    resultItem: { itemId: 'iron-shield', name: 'Железный щит', type: 'shield', slot: 'shield', rarity: 'uncommon', stats: { armor: 3 }, weight: 4, img: '/uploads/items/iron-shield.png' },
    ingredients: [
      { itemId: 'wooden-shield', name: 'Деревянный щит', quantity: 1, hint: 'Купить в кузнице (8 серебра)' },
      { itemId: 'iron-ingot', name: 'Стальной слиток', quantity: 2, hint: 'Купить в кузнице (5 серебра)' },
    ],
    craftCostSilver: 12,
    requiredLevel: 3,
    locationId: 'smithy',
    category: 'armor',
  },

  // === ЛАБОРАТОРИЯ АЛХИМИКА (alchemist) ===
  {
    recipeId: 'craft-potion-health-medium',
    resultItemId: 'potion-health-medium',
    resultName: 'Среднее зелье лечения',
    resultDescription: 'Восстанавливает 30 HP. Мощнее малого зелья.',
    resultImg: '/uploads/items/potion-health-medium.png',
    resultRarity: 'uncommon',
    resultItem: { itemId: 'potion-health-medium', name: 'Среднее зелье лечения', type: 'potion', rarity: 'uncommon', usable: true, stackable: true, maxStack: 5, effect: { heal: 30 }, weight: 0.5, img: '/uploads/items/potion-health-medium.png' },
    ingredients: [
      { itemId: 'potion-health-small', name: 'Малое зелье лечения', quantity: 2, hint: 'Купить в таверне (5 серебра) или найти в сундуках' },
      { itemId: 'red-herb', name: 'Красная трава', quantity: 3, hint: 'Купить у травницы (2 серебра)' },
      { itemId: 'empty-vial', name: 'Пустая склянка', quantity: 1, hint: 'Купить у алхимика (1 серебро)' },
    ],
    craftCostSilver: 5,
    requiredLevel: 2,
    locationId: 'alchemist',
    category: 'potion',
  },
  {
    recipeId: 'craft-antidote',
    resultItemId: 'antidote',
    resultName: 'Антидот',
    resultDescription: 'Снимает отравление и даёт иммунитет на 3 хода.',
    resultImg: '/uploads/items/potion-health-small.png',
    resultRarity: 'uncommon',
    resultItem: { itemId: 'antidote', name: 'Антидот', type: 'potion', rarity: 'uncommon', usable: true, stackable: true, maxStack: 5, effect: { curePoison: true, immunityTurns: 3 }, weight: 0.3, img: '/uploads/items/potion-health-small.png' },
    ingredients: [
      { itemId: 'green-herb', name: 'Зелёная трава', quantity: 2, hint: 'Купить у травницы (2 серебра)' },
      { itemId: 'spider-venom', name: 'Яд паука', quantity: 1, hint: 'Выпадает из пауков на карте «Пещера троллей»' },
      { itemId: 'empty-vial', name: 'Пустая склянка', quantity: 1, hint: 'Купить у алхимика (1 серебро)' },
    ],
    craftCostSilver: 3,
    requiredLevel: 2,
    locationId: 'alchemist',
    category: 'potion',
  },
  {
    recipeId: 'craft-speed-potion',
    resultItemId: 'speed-potion',
    resultName: 'Зелье скорости',
    resultDescription: '+2 к дальности хода на 3 хода.',
    resultImg: '/uploads/items/potion-mana-small.png',
    resultRarity: 'rare',
    resultItem: { itemId: 'speed-potion', name: 'Зелье скорости', type: 'potion', rarity: 'rare', usable: true, effect: { speedBonus: 2, durationTurns: 3 }, weight: 0.3, img: '/uploads/items/potion-mana-small.png' },
    ingredients: [
      { itemId: 'blue-herb', name: 'Синяя трава', quantity: 2, hint: 'Редкая! Найти на карте «Заброшенная дорога» (бездорожье)' },
      { itemId: 'wolf-claw', name: 'Коготь волка', quantity: 1, hint: 'Выпадает из волков' },
      { itemId: 'empty-vial', name: 'Пустая склянка', quantity: 1, hint: 'Купить у алхимика (1 серебро)' },
    ],
    craftCostSilver: 8,
    requiredLevel: 4,
    locationId: 'alchemist',
    category: 'potion',
  },

  // === ХИЖИНА ТРАВНИЦЫ (herbalist) ===
  {
    recipeId: 'craft-healing-salve',
    resultItemId: 'healing-salve',
    resultName: 'Целебная мазь',
    resultDescription: 'Восстанавливает 5 HP каждый ход в течение 3 ходов.',
    resultImg: '/uploads/items/potion-health-small.png',
    resultRarity: 'uncommon',
    resultItem: { itemId: 'healing-salve', name: 'Целебная мазь', type: 'potion', rarity: 'uncommon', usable: true, effect: { healPerTurn: 5, durationTurns: 3 }, weight: 0.3 },
    ingredients: [
      { itemId: 'red-herb', name: 'Красная трава', quantity: 2, hint: 'Купить у травницы (2 серебра)' },
      { itemId: 'honey', name: 'Мёд', quantity: 1, hint: 'Купить у травницы (4 серебра)' },
      { itemId: 'rag', name: 'Тряпка', quantity: 1, hint: 'Найти в сундуках или купить (1 серебро)' },
    ],
    craftCostSilver: 4,
    requiredLevel: 1,
    locationId: 'herbalist',
    category: 'potion',
  },

  // === МАГИЧЕСКАЯ ЛАВКА (shop-magic) ===
  {
    recipeId: 'craft-scroll-fireball',
    resultItemId: 'scroll-fireball',
    resultName: 'Свиток огненного шара',
    resultDescription: 'Наносит d8+4 урона всем врагам в радиусе 2 клетки.',
    resultImg: '/uploads/items/scroll-fireball.png',
    resultRarity: 'rare',
    resultItem: { itemId: 'scroll-fireball', name: 'Свиток огненного шара', type: 'scroll', rarity: 'rare', usable: true, effect: { damage: { die: 'd8', bonus: 4 }, aoe: 2 }, weight: 0.2, img: '/uploads/items/scroll-fireball.png' },
    ingredients: [
      { itemId: 'blank-scroll', name: 'Чистый пергамент', quantity: 1, hint: 'Купить в магической лавке (5 серебра)' },
      { itemId: 'fire-essence', name: 'Эссенция огня', quantity: 2, hint: 'Выпадает из огненных существ или купить у алхимика (8 серебра)' },
      { itemId: 'mana-crystal', name: 'Кристалл маны', quantity: 1, hint: 'Редкий! Найти в сундуках на сложных картах' },
    ],
    craftCostSilver: 15,
    requiredLevel: 5,
    locationId: 'shop-magic',
    category: 'scroll',
  },
  {
    recipeId: 'craft-ring-of-strength',
    resultItemId: 'ring-of-strength',
    resultName: 'Кольцо силы',
    resultDescription: '+2 к атаке. Подходит для воинов.',
    resultImg: '/uploads/items/iron-shield.png',
    resultRarity: 'rare',
    resultItem: { itemId: 'ring-of-strength', name: 'Кольцо силы', type: 'jewelry', slot: 'ring', rarity: 'rare', stats: { attack: 2 }, weight: 0.1 },
    ingredients: [
      { itemId: 'gold-nugget', name: 'Золотой самородок', quantity: 1, hint: 'Найти в сундуках или купить у торговца (20 серебра)' },
      { itemId: 'ruby', name: 'Рубин', quantity: 1, hint: 'Редкий! Выпадает из боссов' },
      { itemId: 'mana-crystal', name: 'Кристалл маны', quantity: 1, hint: 'Найти в сундуках на сложных картах' },
    ],
    craftCostSilver: 25,
    requiredLevel: 7,
    locationId: 'shop-magic',
    category: 'jewelry',
  },
];

async function seed() {
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB');

  for (const recipe of recipes) {
    await CraftRecipe.findOneAndUpdate(
      { recipeId: recipe.recipeId },
      recipe,
      { upsert: true, new: true }
    );
  }

  console.log(`✅ Seeded ${recipes.length} craft recipes`);
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
