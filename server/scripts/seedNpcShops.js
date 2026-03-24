require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const config = require('../config');
const NpcShop = require('../models/NpcShop');

async function seed() {
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB');

  await NpcShop.deleteMany({});

  const shops = [
    // Taverns
    { locationId: 'tavern-1', npcName: 'Бармен Григ', npcType: 'tavern', thematicTypes: ['food'], baseItems: ['potion-health-small', 'potion-mana-small'], greeting: 'Добро пожаловать в «Золотой кубок»! Что изволите?' },
    { locationId: 'tavern-2', npcName: 'Хозяйка Марта', npcType: 'tavern', thematicTypes: ['food'], baseItems: ['potion-health-small', 'potion-mana-small'], greeting: 'Присаживайтесь! У нас лучший эль в городе.' },
    { locationId: 'tavern-3', npcName: 'Эльф Линдар', npcType: 'tavern', thematicTypes: ['food'], baseItems: ['potion-health-small', 'potion-health-medium', 'potion-mana-small'], greeting: 'Приветствую, путник. Эльфийское вино?' },
    { locationId: 'tavern-4', npcName: 'Тёмный Барт', npcType: 'tavern', thematicTypes: ['food'], baseItems: ['potion-health-small', 'potion-mana-small'], greeting: 'Тсс... У меня есть кое-что особенное.' },
    // Smithy
    { locationId: 'smithy', npcName: 'Кузнец Брондар', npcType: 'smithy', thematicTypes: ['weapon', 'armor', 'helmet', 'boots', 'pants', 'shield'], baseItems: ['iron-sword', 'steel-sword', 'battle-axe', 'leather-armor', 'chain-mail', 'wooden-shield', 'iron-shield', 'leather-cap'], greeting: 'Горн горяч, сталь крепка! Чем могу помочь?' },
    // Temple
    { locationId: 'temple', npcName: 'Жрица Элара', npcType: 'temple', thematicTypes: ['scroll'], baseItems: ['scroll-fireball', 'potion-health-medium'], greeting: 'Свет хранит тебя, путник. Нуждаешься в благословении?' },
    // Alchemist
    { locationId: 'alchemist', npcName: 'Алхимик Зефир', npcType: 'alchemist', thematicTypes: ['potion'], baseItems: ['potion-health-small', 'potion-health-medium', 'potion-mana-small'], greeting: 'Ааа, новый клиент! Мои зелья — лучшие в Талории!' },
    // Herbalist
    { locationId: 'herbalist', npcName: 'Травница Вилла', npcType: 'herbalist', thematicTypes: ['tool', 'food'], baseItems: ['torch', 'potion-health-small'], greeting: 'Тише, тише... Не спугни фей. Что тебе нужно?' },
    // Shops
    { locationId: 'shop-1', npcName: 'Книжник Эдвин', npcType: 'book_shop', thematicTypes: ['scroll'], baseItems: ['scroll-fireball'], greeting: 'Знание — величайшее оружие. Ищешь что-нибудь почитать?' },
    { locationId: 'shop-2', npcName: 'Ювелир Сельма', npcType: 'jewelry_shop', thematicTypes: ['ring', 'amulet', 'jewelry'], baseItems: [], greeting: 'Украшения с магической силой... Взгляни на мою коллекцию!' },
    { locationId: 'shop-3', npcName: 'Маг Ториан', npcType: 'magic_shop', thematicTypes: ['scroll', 'potion'], baseItems: ['staff-fire', 'scroll-fireball', 'potion-mana-small'], greeting: 'Магия — тонкое искусство. Что ищешь, чародей?' },
    { locationId: 'shop-4', npcName: 'Брон', npcType: 'general_shop', thematicTypes: ['weapon', 'armor', 'helmet', 'boots', 'pants', 'shield', 'tool', 'potion'], baseItems: ['iron-sword', 'leather-armor', 'wooden-shield', 'leather-cap', 'leather-sandals', 'simple-pants', 'potion-health-small', 'torch'], greeting: 'У Брона есть всё! Оружие, доспехи, зелья — называй, что нужно!' },
  ];

  await NpcShop.insertMany(shops.map(s => ({
    ...s,
    goldBalance: 10,
    silverBalance: 1000,
    soldToNpcItems: [],
  })));

  console.log(`✅ Seeded ${shops.length} NPC shops`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
