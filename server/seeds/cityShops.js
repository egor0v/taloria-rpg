/**
 * Seed: City NPC Shops, Items, and Craft Recipes
 * Run: node server/seeds/cityShops.js
 */
const mongoose = require('mongoose');
require('../models/GameItem');
require('../models/NpcShop');
require('../models/CraftRecipe');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://mongo:27017/taloria';

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const GameItem = mongoose.model('GameItem');
  const NpcShop = mongoose.model('NpcShop');
  const CraftRecipe = mongoose.model('CraftRecipe');

  // ═══════════════════════════════════════════
  // STEP A: Update shopLocation on existing items
  // ═══════════════════════════════════════════
  const slotMap = {
    weapon: 'smithy', armor: 'smithy', helmet: 'smithy', boots: 'smithy',
    pants: 'smithy', shield: 'smithy',
  };
  const typeMap = {
    potion: 'alchemist', scroll: 'temple', food: 'tavern-1',
    jewelry: 'shop-2',
  };

  const existing = await GameItem.find({});
  for (const item of existing) {
    if (!item.shopLocation) {
      const loc = slotMap[item.slot] || typeMap[item.type] || '';
      if (loc) {
        item.shopLocation = loc;
        await item.save();
        console.log(`  Updated shopLocation: ${item.name} → ${loc}`);
      }
    }
  }

  // ═══════════════════════════════════════════
  // STEP B: Create new ingredient items
  // ═══════════════════════════════════════════
  const newItems = [
    // --- Кузница: слитки ---
    { itemId: 'iron-ingot', name: 'Железный слиток', type: 'tool', rarity: 'common', price: 15, shopLocation: 'smithy', stackable: true, weight: 2, description: 'Грубый слиток железа. Используется в ковке.' },
    { itemId: 'steel-ingot', name: 'Стальной слиток', type: 'tool', rarity: 'uncommon', price: 40, shopLocation: 'smithy', stackable: true, weight: 2.5, description: 'Качественный стальной слиток.' },
    { itemId: 'mithril-ingot', name: 'Мифриловый слиток', type: 'tool', rarity: 'rare', price: 200, shopLocation: 'smithy', stackable: true, weight: 1.5, description: 'Редчайший мифриловый слиток. Легче стали, но прочнее.' },

    // --- Алхимик: реагенты ---
    { itemId: 'moon-dust', name: 'Лунная пыль', type: 'tool', rarity: 'uncommon', price: 25, shopLocation: 'alchemist', stackable: true, weight: 0.1, description: 'Мерцающая пыль, собранная при полнолунии.' },
    { itemId: 'sulfur-essence', name: 'Серная эссенция', type: 'tool', rarity: 'common', price: 12, shopLocation: 'alchemist', stackable: true, weight: 0.2, description: 'Едкая жидкость с резким запахом.' },
    { itemId: 'mana-crystal', name: 'Кристалл маны', type: 'tool', rarity: 'rare', price: 80, shopLocation: 'alchemist', stackable: true, weight: 0.3, description: 'Чистый кристалл, пульсирующий магической энергией.' },
    { itemId: 'dragon-blood', name: 'Драконья кровь', type: 'tool', rarity: 'epic', price: 300, shopLocation: 'alchemist', stackable: true, weight: 0.5, description: 'Тёмно-алая кровь древнего дракона. Невероятно редка.' },
    { itemId: 'alchemist-mercury', name: 'Ртуть алхимика', type: 'tool', rarity: 'uncommon', price: 30, shopLocation: 'alchemist', stackable: true, weight: 0.3, description: 'Очищенная ртуть для алхимических рецептов.' },
    { itemId: 'ethereal-oil', name: 'Эфирное масло', type: 'tool', rarity: 'uncommon', price: 20, shopLocation: 'alchemist', stackable: true, weight: 0.2, description: 'Маслянистая жидкость с магическими свойствами.' },
    { itemId: 'phosphor-salt', name: 'Фосфорная соль', type: 'tool', rarity: 'uncommon', price: 18, shopLocation: 'alchemist', stackable: true, weight: 0.2, description: 'Светящаяся в темноте соль.' },
    { itemId: 'poison-mushroom', name: 'Ядовитый гриб', type: 'tool', rarity: 'common', price: 8, shopLocation: 'alchemist', stackable: true, weight: 0.1, description: 'Опасный гриб. В малых дозах — лекарство.' },

    // --- Травница ---
    { itemId: 'healing-herb', name: 'Целебная трава', type: 'tool', rarity: 'common', price: 5, shopLocation: 'herbalist', stackable: true, weight: 0.1, description: 'Простая лечебная трава.' },
    { itemId: 'life-root', name: 'Корень жизни', type: 'tool', rarity: 'uncommon', price: 20, shopLocation: 'herbalist', stackable: true, weight: 0.2, description: 'Целебный корень, растущий глубоко под землёй.' },
    { itemId: 'moon-flower', name: 'Лунный цветок', type: 'tool', rarity: 'uncommon', price: 25, shopLocation: 'herbalist', stackable: true, weight: 0.1, description: 'Цветок, раскрывающийся только при луне.' },
    { itemId: 'fire-bloom', name: 'Огнецвет', type: 'tool', rarity: 'uncommon', price: 22, shopLocation: 'herbalist', stackable: true, weight: 0.1, description: 'Горячий на ощупь цветок из вулканических земель.' },
    { itemId: 'ice-moss', name: 'Ледяной мох', type: 'tool', rarity: 'common', price: 10, shopLocation: 'herbalist', stackable: true, weight: 0.1, description: 'Мох, растущий на ледяных скалах.' },
    { itemId: 'swamp-vine', name: 'Болотная лоза', type: 'tool', rarity: 'common', price: 8, shopLocation: 'herbalist', stackable: true, weight: 0.2, description: 'Гибкая лоза из глубоких болот.' },
    { itemId: 'fairy-pollen', name: 'Пыльца фей', type: 'tool', rarity: 'rare', price: 60, shopLocation: 'herbalist', stackable: true, weight: 0.05, description: 'Мерцающая золотая пыльца. Говорят, собирается феями.' },
    { itemId: 'golden-lotus', name: 'Золотой лотос', type: 'tool', rarity: 'rare', price: 70, shopLocation: 'herbalist', stackable: true, weight: 0.1, description: 'Легендарный цветок с целебной силой.' },
    { itemId: 'dark-mushroom', name: 'Тёмный гриб', type: 'tool', rarity: 'uncommon', price: 15, shopLocation: 'herbalist', stackable: true, weight: 0.1, description: 'Гриб из глубоких пещер. Используется в зельеварении.' },
    { itemId: 'thorny-leaf', name: 'Шипастый лист', type: 'tool', rarity: 'common', price: 6, shopLocation: 'herbalist', stackable: true, weight: 0.1, description: 'Колючий лист с лечебными свойствами.' },

    // --- Книжная лавка ---
    { itemId: 'blank-parchment', name: 'Чистый пергамент', type: 'tool', rarity: 'common', price: 5, shopLocation: 'shop-1', stackable: true, weight: 0.1, description: 'Чистый лист пергамента.' },
    { itemId: 'quill-pen', name: 'Гусиное перо', type: 'tool', rarity: 'common', price: 3, shopLocation: 'shop-1', stackable: true, weight: 0.05, description: 'Острое перо для письма.' },
    { itemId: 'ink', name: 'Чернила', type: 'tool', rarity: 'common', price: 8, shopLocation: 'shop-1', stackable: true, weight: 0.2, description: 'Чёрные чернила из каракатицы.' },
    { itemId: 'magic-ink', name: 'Магические чернила', type: 'tool', rarity: 'rare', price: 60, shopLocation: 'shop-1', stackable: true, weight: 0.2, description: 'Чернила, пропитанные магией. Светятся в темноте.' },
    { itemId: 'binding-leather', name: 'Переплётная кожа', type: 'tool', rarity: 'uncommon', price: 15, shopLocation: 'shop-1', stackable: true, weight: 0.3, description: 'Мягкая выделанная кожа для переплёта книг.' },
    { itemId: 'ancient-manuscript', name: 'Древний манускрипт', type: 'tool', rarity: 'rare', price: 100, shopLocation: 'shop-1', stackable: true, weight: 0.5, description: 'Пожелтевший манускрипт с древними знаниями.' },
    { itemId: 'spellbook', name: 'Книга заклинаний', type: 'tool', rarity: 'uncommon', price: 40, shopLocation: 'shop-1', stackable: true, weight: 1, description: 'Книга с описаниями магических формул.' },
    { itemId: 'warrior-guide', name: 'Руководство воина', type: 'tool', rarity: 'uncommon', price: 35, shopLocation: 'shop-1', stackable: true, weight: 1, description: 'Пособие по боевым техникам.' },
    { itemId: 'wisdom-tome', name: 'Том мудрости', type: 'tool', rarity: 'uncommon', price: 45, shopLocation: 'shop-1', stackable: true, weight: 1.2, description: 'Толстый том с философскими трактатами.' },

    // --- Храм ---
    { itemId: 'holy-water', name: 'Святая вода', type: 'tool', rarity: 'common', price: 10, shopLocation: 'temple', stackable: true, weight: 0.3, description: 'Освящённая вода из храмового источника.' },
    { itemId: 'incense', name: 'Благовония', type: 'tool', rarity: 'common', price: 8, shopLocation: 'temple', stackable: true, weight: 0.1, description: 'Ароматные палочки для ритуалов.' },
    { itemId: 'prayer-beads', name: 'Молитвенные чётки', type: 'tool', rarity: 'uncommon', price: 20, shopLocation: 'temple', stackable: true, weight: 0.1, description: 'Деревянные чётки для медитации.' },
    { itemId: 'sacred-chalk', name: 'Священный мел', type: 'tool', rarity: 'uncommon', price: 15, shopLocation: 'temple', stackable: true, weight: 0.2, description: 'Мел для рисования защитных кругов.' },

    // --- Ювелир ---
    { itemId: 'ruby', name: 'Рубин', type: 'tool', rarity: 'rare', price: 100, shopLocation: 'shop-2', stackable: true, weight: 0.1, description: 'Огненно-красный драгоценный камень.' },
    { itemId: 'sapphire', name: 'Сапфир', type: 'tool', rarity: 'rare', price: 100, shopLocation: 'shop-2', stackable: true, weight: 0.1, description: 'Глубокий синий камень чистой воды.' },
    { itemId: 'emerald', name: 'Изумруд', type: 'tool', rarity: 'rare', price: 120, shopLocation: 'shop-2', stackable: true, weight: 0.1, description: 'Зелёный камень с магическим мерцанием.' },
    { itemId: 'amethyst', name: 'Аметист', type: 'tool', rarity: 'uncommon', price: 50, shopLocation: 'shop-2', stackable: true, weight: 0.1, description: 'Фиолетовый кристалл с успокаивающей аурой.' },
    { itemId: 'silver-chain', name: 'Серебряная цепочка', type: 'tool', rarity: 'uncommon', price: 30, shopLocation: 'shop-2', stackable: true, weight: 0.1, description: 'Тонкая серебряная цепочка ручной работы.' },
    { itemId: 'gold-setting', name: 'Золотая оправа', type: 'tool', rarity: 'uncommon', price: 45, shopLocation: 'shop-2', stackable: true, weight: 0.1, description: 'Ювелирная оправа из чистого золота.' },
    { itemId: 'raw-diamond', name: 'Необработанный алмаз', type: 'tool', rarity: 'epic', price: 250, shopLocation: 'shop-2', stackable: true, weight: 0.1, description: 'Неогранённый алмаз невероятной чистоты.' },
    { itemId: 'pearl', name: 'Жемчужина', type: 'tool', rarity: 'uncommon', price: 40, shopLocation: 'shop-2', stackable: true, weight: 0.05, description: 'Идеально круглая речная жемчужина.' },
    { itemId: 'moonstone', name: 'Лунный камень', type: 'tool', rarity: 'rare', price: 90, shopLocation: 'shop-2', stackable: true, weight: 0.1, description: 'Молочно-белый камень, светящийся при луне.' },
    { itemId: 'cut-opal', name: 'Огранённый опал', type: 'tool', rarity: 'rare', price: 85, shopLocation: 'shop-2', stackable: true, weight: 0.1, description: 'Переливающийся всеми цветами радуги камень.' },
    { itemId: 'bracelet-silver', name: 'Серебряный браслет', type: 'jewelry', rarity: 'uncommon', price: 35, shopLocation: 'shop-2', slot: 'ring', weight: 0.1, description: 'Простой серебряный браслет.' },
    { itemId: 'pendant-star', name: 'Кулон Звезды', type: 'jewelry', rarity: 'uncommon', price: 40, shopLocation: 'shop-2', slot: 'amulet', weight: 0.1, description: 'Кулон в виде звезды.' },

    // --- Лавка Брона ---
    { itemId: 'silk-fabric', name: 'Шёлковая ткань', type: 'tool', rarity: 'uncommon', price: 25, shopLocation: 'shop-4', stackable: true, weight: 0.3, description: 'Мягкий шёлк высшего качества.' },
    { itemId: 'rough-fabric', name: 'Грубая ткань', type: 'tool', rarity: 'common', price: 5, shopLocation: 'shop-4', stackable: true, weight: 0.3, description: 'Простая холщовая ткань.' },
    { itemId: 'thread', name: 'Нитки', type: 'tool', rarity: 'common', price: 3, shopLocation: 'shop-4', stackable: true, weight: 0.05, description: 'Крепкие льняные нитки.' },
    { itemId: 'needle', name: 'Иголка', type: 'tool', rarity: 'common', price: 2, shopLocation: 'shop-4', stackable: true, weight: 0.01, description: 'Стальная швейная игла.' },
    { itemId: 'buttons', name: 'Пуговицы', type: 'tool', rarity: 'common', price: 2, shopLocation: 'shop-4', stackable: true, weight: 0.05, description: 'Набор костяных пуговиц.' },
    { itemId: 'leather-strips', name: 'Кожаные ленты', type: 'tool', rarity: 'common', price: 4, shopLocation: 'shop-4', stackable: true, weight: 0.1, description: 'Полоски выделанной кожи.' },
    { itemId: 'dye-set', name: 'Красители', type: 'tool', rarity: 'uncommon', price: 15, shopLocation: 'shop-4', stackable: true, weight: 0.3, description: 'Набор натуральных красителей.' },
    { itemId: 'lining-fabric', name: 'Подкладочная ткань', type: 'tool', rarity: 'common', price: 6, shopLocation: 'shop-4', stackable: true, weight: 0.2, description: 'Мягкая ткань для подкладки одежды.' },

    // --- Таверны: дополнительная еда ---
    { itemId: 'mead', name: 'Медовуха', type: 'food', rarity: 'common', price: 8, shopLocation: 'tavern-1', stackable: true, weight: 0.5, description: 'Сладкая медовуха. +3 HP.', usable: true, effect: { heal: 3 } },
    { itemId: 'bread', name: 'Свежий хлеб', type: 'food', rarity: 'common', price: 3, shopLocation: 'tavern-1', stackable: true, weight: 0.3, description: 'Тёплый свежий хлеб. +2 HP.', usable: true, effect: { heal: 2 } },
    { itemId: 'cheese', name: 'Сыр', type: 'food', rarity: 'common', price: 5, shopLocation: 'tavern-1', stackable: true, weight: 0.3, description: 'Выдержанный сыр. +2 HP.', usable: true, effect: { heal: 2 } },
    { itemId: 'apple-pie', name: 'Яблочный пирог', type: 'food', rarity: 'common', price: 7, shopLocation: 'tavern-1', stackable: true, weight: 0.4, description: 'Домашний пирог. +4 HP.', usable: true, effect: { heal: 4 } },
    { itemId: 'dried-meat', name: 'Вяленое мясо', type: 'food', rarity: 'common', price: 6, shopLocation: 'tavern-1', stackable: true, weight: 0.3, description: 'Долго хранится в дороге. +3 HP.', usable: true, effect: { heal: 3 } },
    { itemId: 'wine', name: 'Вино', type: 'food', rarity: 'uncommon', price: 15, shopLocation: 'tavern-1', stackable: true, weight: 0.5, description: 'Эльфийское вино. +5 HP, +2 MP.', usable: true, effect: { heal: 5, mana: 2 } },
    { itemId: 'kvass', name: 'Квас', type: 'food', rarity: 'common', price: 4, shopLocation: 'tavern-1', stackable: true, weight: 0.5, description: 'Прохладный квас. +2 HP.', usable: true, effect: { heal: 2 } },
  ];

  let created = 0;
  for (const itemData of newItems) {
    const exists = await GameItem.findOne({ itemId: itemData.itemId });
    if (!exists) {
      await GameItem.create({ ...itemData, active: true });
      created++;
      console.log(`  Created item: ${itemData.name}`);
    }
  }
  console.log(`Created ${created} new items`);

  // ═══════════════════════════════════════════
  // STEP C: Create NPC Shops
  // ═══════════════════════════════════════════
  const npcShops = [
    { locationId: 'tavern-1', npcName: 'Грок Пивовар', npcType: 'Трактирщик', greeting: 'Добро пожаловать в «Золотой кубок»! Чем угощу?', goldBalance: 50, silverBalance: 5000, thematicTypes: ['food'], baseItems: [] },
    { locationId: 'tavern-2', npcName: 'Мирабель Весёлая', npcType: 'Трактирщица', greeting: 'Заходите, дорогие! У нас лучшая еда в городе!', goldBalance: 50, silverBalance: 5000, thematicTypes: ['food'], baseItems: [] },
    { locationId: 'tavern-3', npcName: 'Элариэль Дубовый', npcType: 'Трактирщик-эльф', greeting: 'Присаживайтесь. Эльфийская кухня не знает равных.', goldBalance: 50, silverBalance: 5000, thematicTypes: ['food'], baseItems: [] },
    { locationId: 'tavern-4', npcName: 'Тень Каган', npcType: 'Трактирщик', greeting: '...Что будете? Не люблю болтать попусту.', goldBalance: 50, silverBalance: 5000, thematicTypes: ['food'], baseItems: [] },
    { locationId: 'smithy', npcName: 'Торвальд Молот', npcType: 'Кузнец', greeting: 'Хорошая сталь и крепкая рука — всё, что нужно воину! Чего желаете?', goldBalance: 100, silverBalance: 10000, thematicTypes: ['weapon', 'armor', 'shield', 'helmet', 'boots', 'pants'], baseItems: [] },
    { locationId: 'temple', npcName: 'Верховный жрец Аэлий', npcType: 'Жрец', greeting: 'Да пребудет с вами свет. Чем храм может помочь?', goldBalance: 80, silverBalance: 8000, thematicTypes: ['scroll'], baseItems: [] },
    { locationId: 'alchemist', npcName: 'Магистр Зельдар', npcType: 'Алхимик', greeting: 'Осторожнее! Не касайтесь ничего... впрочем, что вам нужно?', goldBalance: 80, silverBalance: 8000, thematicTypes: ['potion'], baseItems: [] },
    { locationId: 'herbalist', npcName: 'Бабушка Ивара', npcType: 'Травница', greeting: 'Заходи, дитя. Природа-матушка щедра к тем, кто знает, где искать.', goldBalance: 30, silverBalance: 3000, thematicTypes: ['tool'], baseItems: [] },
    { locationId: 'shop-1', npcName: 'Книжник Фалмер', npcType: 'Книготорговец', greeting: 'А, ценитель знаний! Добро пожаловать в мою скромную лавку.', goldBalance: 60, silverBalance: 6000, thematicTypes: ['tool', 'scroll'], baseItems: [] },
    { locationId: 'shop-2', npcName: 'Ювелир Каэлин', npcType: 'Ювелир', greeting: 'Каждый камень хранит историю. Позвольте показать мои лучшие работы.', goldBalance: 150, silverBalance: 15000, thematicTypes: ['jewelry'], baseItems: [] },
    { locationId: 'shop-3', npcName: 'Маг Ильвар', npcType: 'Маг-торговец', greeting: 'Магия — это искусство. А у искусства есть цена.', goldBalance: 100, silverBalance: 10000, thematicTypes: ['scroll', 'tool'], baseItems: [] },
    { locationId: 'shop-4', npcName: 'Брон Портной', npcType: 'Портной', greeting: 'Добрый день! Лучшие ткани и одежда — только у Брона!', goldBalance: 60, silverBalance: 6000, thematicTypes: ['armor', 'pants', 'boots'], baseItems: [] },
  ];

  let shopsCreated = 0;
  for (const shop of npcShops) {
    const exists = await NpcShop.findOne({ locationId: shop.locationId });
    if (!exists) {
      await NpcShop.create(shop);
      shopsCreated++;
      console.log(`  Created NPC shop: ${shop.npcName} @ ${shop.locationId}`);
    } else {
      console.log(`  NPC shop already exists: ${shop.locationId}`);
    }
  }
  console.log(`Created ${shopsCreated} NPC shops`);

  // ═══════════════════════════════════════════
  // STEP D: Create Craft Recipes
  // ═══════════════════════════════════════════
  const recipes = [
    // --- Кузница ---
    {
      recipeId: 'dawn-blade', name: 'Клинок Рассвета', description: 'Легендарный меч, выкованный из мифрила и закалённый драконьей кровью.',
      locationId: 'smithy', level: 5,
      ingredients: [
        { itemId: 'mithril-ingot', name: 'Мифриловый слиток', quantity: 3 },
        { itemId: 'moonstone', name: 'Лунный камень', quantity: 1 },
        { itemId: 'dragon-blood', name: 'Драконья кровь', quantity: 1 },
      ],
      result: { itemId: 'dawn-blade', name: 'Клинок Рассвета', type: 'weapon', slot: 'weapon', rarity: 'legendary', damage: { die: 'd12', bonus: 3 }, stats: { attack: 3, agility: 1 }, description: 'Легендарный клинок, сияющий золотым светом.' },
    },
    {
      recipeId: 'titan-armor', name: 'Доспех Титана', description: 'Непробиваемые доспехи из мифрила и стали.',
      locationId: 'smithy', level: 5,
      ingredients: [
        { itemId: 'steel-ingot', name: 'Стальной слиток', quantity: 5 },
        { itemId: 'mithril-ingot', name: 'Мифриловый слиток', quantity: 2 },
        { itemId: 'silk-fabric', name: 'Шёлковая ткань', quantity: 2 },
      ],
      result: { itemId: 'titan-armor', name: 'Доспех Титана', type: 'armor', slot: 'armor', rarity: 'legendary', stats: { armor: 5, attack: 1 }, description: 'Непробиваемые доспехи титана.' },
    },

    // --- Алхимик ---
    {
      recipeId: 'immortality-elixir', name: 'Эликсир Бессмертия', description: 'Легендарное зелье, восстанавливающее всё здоровье.',
      locationId: 'alchemist', level: 5,
      ingredients: [
        { itemId: 'health-potion', name: 'Зелье лечения', quantity: 3 },
        { itemId: 'dragon-blood', name: 'Драконья кровь', quantity: 2 },
        { itemId: 'moon-dust', name: 'Лунная пыль', quantity: 2 },
        { itemId: 'golden-lotus', name: 'Золотой лотос', quantity: 1 },
      ],
      result: { itemId: 'immortality-elixir', name: 'Эликсир Бессмертия', type: 'potion', slot: 'none', rarity: 'legendary', usable: true, stackable: true, effect: { heal: 999 }, description: 'Полностью восстанавливает здоровье.' },
    },
    {
      recipeId: 'absolute-mana', name: 'Эликсир Абсолютной Маны', description: 'Легендарное зелье, восстанавливающее всю ману.',
      locationId: 'alchemist', level: 5,
      ingredients: [
        { itemId: 'mana-potion', name: 'Зелье маны', quantity: 3 },
        { itemId: 'mana-crystal', name: 'Кристалл маны', quantity: 2 },
        { itemId: 'ethereal-oil', name: 'Эфирное масло', quantity: 2 },
        { itemId: 'fairy-pollen', name: 'Пыльца фей', quantity: 1 },
      ],
      result: { itemId: 'absolute-mana', name: 'Эликсир Абсолютной Маны', type: 'potion', slot: 'none', rarity: 'legendary', usable: true, stackable: true, effect: { mana: 999 }, description: 'Полностью восстанавливает ману.' },
    },

    // --- Книжная лавка ---
    {
      recipeId: 'codex-eternity', name: 'Кодекс Вечности', description: 'Легендарная книга с древними знаниями.',
      locationId: 'shop-1', level: 5,
      ingredients: [
        { itemId: 'ancient-manuscript', name: 'Древний манускрипт', quantity: 2 },
        { itemId: 'magic-ink', name: 'Магические чернила', quantity: 3 },
        { itemId: 'binding-leather', name: 'Переплётная кожа', quantity: 2 },
        { itemId: 'moon-dust', name: 'Лунная пыль', quantity: 1 },
      ],
      result: { itemId: 'codex-eternity', name: 'Кодекс Вечности', type: 'tool', slot: 'none', rarity: 'legendary', stats: { intellect: 5, wisdom: 3 }, description: 'Книга даёт +5 интеллекта и +3 мудрости владельцу.' },
    },
    {
      recipeId: 'grimoire-elements', name: 'Гримуар Стихий', description: 'Легендарная книга заклинаний стихий.',
      locationId: 'shop-1', level: 5,
      ingredients: [
        { itemId: 'spellbook', name: 'Книга заклинаний', quantity: 2 },
        { itemId: 'blank-parchment', name: 'Чистый пергамент', quantity: 5 },
        { itemId: 'magic-ink', name: 'Магические чернила', quantity: 2 },
        { itemId: 'mana-crystal', name: 'Кристалл маны', quantity: 1 },
      ],
      result: { itemId: 'grimoire-elements', name: 'Гримуар Стихий', type: 'tool', slot: 'none', rarity: 'legendary', stats: { intellect: 3, wisdom: 2 }, effect: { allStats: 1 }, description: 'Мощная книга заклинаний стихий. +1 ко всем статам.' },
    },

    // --- Храм ---
    {
      recipeId: 'scroll-divine-wrath', name: 'Свиток Божественного Гнева', description: 'Легендарный свиток с разрушительной силой.',
      locationId: 'temple', level: 5,
      ingredients: [
        { itemId: 'scroll-fire', name: 'Свиток огня', quantity: 3 },
        { itemId: 'holy-water', name: 'Святая вода', quantity: 2 },
        { itemId: 'sacred-chalk', name: 'Священный мел', quantity: 3 },
        { itemId: 'moon-dust', name: 'Лунная пыль', quantity: 1 },
      ],
      result: { itemId: 'scroll-divine-wrath', name: 'Свиток Божественного Гнева', type: 'scroll', slot: 'none', rarity: 'legendary', usable: true, description: 'Наносит массовый святой урон всем врагам.' },
    },
    {
      recipeId: 'scroll-absolute-shield', name: 'Свиток Абсолютной Защиты', description: 'Легендарный свиток неуязвимости.',
      locationId: 'temple', level: 5,
      ingredients: [
        { itemId: 'scroll-protection', name: 'Свиток защиты', quantity: 3 },
        { itemId: 'incense', name: 'Благовония', quantity: 2 },
        { itemId: 'prayer-beads', name: 'Молитвенные чётки', quantity: 2 },
        { itemId: 'golden-lotus', name: 'Золотой лотос', quantity: 1 },
      ],
      result: { itemId: 'scroll-absolute-shield', name: 'Свиток Абсолютной Защиты', type: 'scroll', slot: 'none', rarity: 'legendary', usable: true, description: 'Даёт неуязвимость на 3 хода.' },
    },

    // --- Лавка Брона ---
    {
      recipeId: 'archmage-robe', name: 'Мантия Архимага', description: 'Легендарная мантия с магической защитой.',
      locationId: 'shop-4', level: 5,
      ingredients: [
        { itemId: 'silk-fabric', name: 'Шёлковая ткань', quantity: 5 },
        { itemId: 'magic-ink', name: 'Магические чернила', quantity: 2 },
        { itemId: 'fairy-pollen', name: 'Пыльца фей', quantity: 2 },
        { itemId: 'moonstone', name: 'Лунный камень', quantity: 1 },
      ],
      result: { itemId: 'archmage-robe', name: 'Мантия Архимага', type: 'armor', slot: 'armor', rarity: 'legendary', stats: { intellect: 4, wisdom: 3, armor: 2 }, description: 'Мантия сияет магической энергией.' },
    },
    {
      recipeId: 'wind-boots', name: 'Сапоги Ветра', description: 'Легендарные сапоги невероятной лёгкости.',
      locationId: 'shop-4', level: 5,
      ingredients: [
        { itemId: 'leather-boots', name: 'Кожаные сапоги', quantity: 2 },
        { itemId: 'silk-fabric', name: 'Шёлковая ткань', quantity: 3 },
        { itemId: 'thread', name: 'Нитки', quantity: 5 },
        { itemId: 'fairy-pollen', name: 'Пыльца фей', quantity: 1 },
      ],
      result: { itemId: 'wind-boots', name: 'Сапоги Ветра', type: 'boots', slot: 'boots', rarity: 'legendary', stats: { agility: 4, armor: 1 }, description: '+4 ловкость, +1 броня. Невесомые сапоги.' },
    },

    // --- Ювелир ---
    {
      recipeId: 'amulet-eternal-flame', name: 'Амулет Вечного Пламени', description: 'Легендарный амулет с огненной силой.',
      locationId: 'shop-2', level: 5,
      ingredients: [
        { itemId: 'ruby', name: 'Рубин', quantity: 3 },
        { itemId: 'gold-setting', name: 'Золотая оправа', quantity: 2 },
        { itemId: 'dragon-blood', name: 'Драконья кровь', quantity: 1 },
        { itemId: 'fire-bloom', name: 'Огнецвет', quantity: 2 },
      ],
      result: { itemId: 'amulet-eternal-flame', name: 'Амулет Вечного Пламени', type: 'jewelry', slot: 'amulet', rarity: 'legendary', stats: { attack: 3, intellect: 2 }, description: 'Амулет пылает вечным пламенем. +3 атака, +2 интеллект.' },
    },
    {
      recipeId: 'necklace-stars', name: 'Ожерелье Звёзд', description: 'Легендарное ожерелье из сапфиров и жемчуга.',
      locationId: 'shop-2', level: 5,
      ingredients: [
        { itemId: 'sapphire', name: 'Сапфир', quantity: 2 },
        { itemId: 'pearl', name: 'Жемчужина', quantity: 3 },
        { itemId: 'silver-chain', name: 'Серебряная цепочка', quantity: 2 },
        { itemId: 'moonstone', name: 'Лунный камень', quantity: 1 },
      ],
      result: { itemId: 'necklace-stars', name: 'Ожерелье Звёзд', type: 'jewelry', slot: 'amulet', rarity: 'legendary', stats: { wisdom: 3, charisma: 3 }, description: 'Ожерелье мерцает как ночное небо. +3 мудрость, +3 харизма.' },
    },
    {
      recipeId: 'pendant-abyss', name: 'Кулон Бездны', description: 'Легендарный кулон тьмы.',
      locationId: 'shop-2', level: 5,
      ingredients: [
        { itemId: 'amethyst', name: 'Аметист', quantity: 3 },
        { itemId: 'raw-diamond', name: 'Необработанный алмаз', quantity: 1 },
        { itemId: 'gold-setting', name: 'Золотая оправа', quantity: 1 },
        { itemId: 'dark-mushroom', name: 'Тёмный гриб', quantity: 2 },
      ],
      result: { itemId: 'pendant-abyss', name: 'Кулон Бездны', type: 'jewelry', slot: 'amulet', rarity: 'legendary', stats: { intellect: 4, attack: 2 }, description: 'Кулон поглощает свет вокруг. +4 интеллект, +2 атака.' },
    },
    {
      recipeId: 'ring-absolute', name: 'Кольцо Абсолюта', description: 'Легендарное кольцо абсолютной силы.',
      locationId: 'shop-2', level: 5,
      ingredients: [
        { itemId: 'emerald', name: 'Изумруд', quantity: 2 },
        { itemId: 'cut-opal', name: 'Огранённый опал', quantity: 2 },
        { itemId: 'gold-setting', name: 'Золотая оправа', quantity: 2 },
        { itemId: 'mana-crystal', name: 'Кристалл маны', quantity: 2 },
      ],
      result: { itemId: 'ring-absolute', name: 'Кольцо Абсолюта', type: 'jewelry', slot: 'ring', rarity: 'legendary', stats: { attack: 2, agility: 2, armor: 2, intellect: 2, wisdom: 2, charisma: 2 }, description: '+2 ко всем характеристикам.' },
    },
  ];

  let recipesCreated = 0;
  for (const recipe of recipes) {
    const exists = await CraftRecipe.findOne({ recipeId: recipe.recipeId });
    if (!exists) {
      await CraftRecipe.create({ ...recipe, active: true });
      recipesCreated++;
      console.log(`  Created recipe: ${recipe.name}`);
    }
  }
  console.log(`Created ${recipesCreated} craft recipes`);

  // Also create GameItem entries for legendary craft results (so they can be tracked with craftLimit)
  for (const recipe of recipes) {
    const r = recipe.result;
    const exists = await GameItem.findOne({ itemId: r.itemId });
    if (!exists) {
      await GameItem.create({
        itemId: r.itemId, name: r.name, type: r.type, slot: r.slot || 'none',
        rarity: r.rarity, description: r.description, stats: r.stats, damage: r.damage,
        effect: r.effect, usable: r.usable, stackable: r.stackable,
        isCraftable: true, craftLocation: recipe.locationId, craftLimit: 10, craftCount: 0,
        active: true, price: 0,
      });
      console.log(`  Created legendary item: ${r.name}`);
    }
  }

  console.log('\n✅ Seed complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
