/**
 * Seeds initial game data: maps, scenarios, monsters, items, abilities
 * Run: node scripts/seedGameData.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const config = require('../config');
const GameMap = require('../models/GameMap');
const Scenario = require('../models/Scenario');
const MonsterTemplate = require('../models/MonsterTemplate');
const GameItem = require('../models/GameItem');
const AbilityTemplate = require('../models/AbilityTemplate');

async function seed() {
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB');

  // --- MAPS ---
  // Upsert maps (don't delete existing data from admin)
  const maps = [
    {
      mapId: 'forest-road',
      name: 'Заброшенная дорога',
      description: 'Лесная дорога, полная опасностей. Деревья нависают со всех сторон.',
      maxPlayers: 4,
      bgImage: '/uploads/maps/forest-road.jpg',
      mapData: Array(15).fill(null).map(() => Array(20).fill(0)),
      roadMap: Array(15).fill(null).map((_, y) =>
        Array(20).fill('offroad').map((_, x) => (x >= 8 && x <= 11) ? 'road' : 'offroad')
      ),
      active: true,
    },
    {
      mapId: 'troll-cave',
      name: 'Пещера троллей',
      description: 'Тёмная пещера, в которой обитают тролли и другие существа.',
      maxPlayers: 4,
      bgImage: '/uploads/maps/troll-cave.jpg',
      mapData: Array(12).fill(null).map(() => Array(16).fill(0)),
      roadMap: Array(12).fill(null).map(() => Array(16).fill('offroad')),
      active: true,
    },
  ];
  for (const m of maps) { await GameMap.updateOne({ mapId: m.mapId }, { $setOnInsert: m }, { upsert: true }); }
  console.log(`Seeded ${maps.length} maps (upsert)`);

  // --- MONSTERS ---
  // Upsert monsters
  const monsters = [
    { type: 'goblin', name: 'Гоблин', hp: 12, armor: 2, attack: 2, agility: 3, moveRange: 3, vision: 4, attackRange: 1, damageDie: 'd4', xpReward: 15, goldMin: 1, goldMax: 5, aiType: 'aggressive', canTalk: true },
    { type: 'skeleton', name: 'Скелет', hp: 15, armor: 4, attack: 3, agility: 1, moveRange: 2, vision: 3, attackRange: 1, damageDie: 'd6', xpReward: 20, goldMin: 0, goldMax: 3, aiType: 'aggressive' },
    { type: 'wolf', name: 'Волк', hp: 10, armor: 1, attack: 3, agility: 4, moveRange: 4, vision: 5, attackRange: 1, damageDie: 'd6', xpReward: 12, goldMin: 0, goldMax: 1, aiType: 'aggressive' },
    { type: 'troll', name: 'Тролль', hp: 35, armor: 5, attack: 5, agility: 1, moveRange: 2, vision: 3, attackRange: 1, damageDie: 'd8', xpReward: 40, goldMin: 5, goldMax: 15, aiType: 'aggressive' },
    { type: 'spider', name: 'Паук', hp: 8, armor: 1, attack: 2, agility: 5, moveRange: 3, vision: 4, attackRange: 1, damageDie: 'd4', xpReward: 10, goldMin: 0, goldMax: 2, aiType: 'coward' },
    { type: 'bandit', name: 'Бандит', hp: 18, armor: 3, attack: 3, agility: 3, moveRange: 2, vision: 4, attackRange: 1, damageDie: 'd6', xpReward: 22, goldMin: 3, goldMax: 10, aiType: 'aggressive', canTalk: true },
    { type: 'orc', name: 'Орк', hp: 25, armor: 4, attack: 4, agility: 2, moveRange: 2, vision: 4, attackRange: 1, damageDie: 'd8', xpReward: 30, goldMin: 2, goldMax: 8, aiType: 'aggressive', canTalk: true },
    { type: 'dark-mage', name: 'Тёмный маг', hp: 15, armor: 2, attack: 2, agility: 2, moveRange: 2, vision: 5, attackRange: 3, damageDie: 'd8', xpReward: 35, goldMin: 5, goldMax: 12, aiType: 'support' },
    { type: 'troll-boss', name: 'Тролль-вождь', hp: 60, armor: 6, attack: 7, agility: 2, moveRange: 2, vision: 4, attackRange: 1, damageDie: 'd10', xpReward: 80, goldMin: 15, goldMax: 30, aiType: 'boss' },
  ];
  for (const m of monsters) { await MonsterTemplate.updateOne({ type: m.type }, { $setOnInsert: m }, { upsert: true }); }
  console.log(`Seeded ${monsters.length} monsters (upsert)`);

  // --- ITEMS ---
  // Upsert items (never delete admin data)
  const items = [
    // Potions
    { itemId: 'potion-health-small', name: 'Малое зелье лечения', type: 'potion', slot: 'none', rarity: 'common', description: 'Восстанавливает 15 HP', usable: true, effect: { heal: 15 }, stackable: true, maxStack: 10, weight: 0.5, price: 5 },
    { itemId: 'potion-health-medium', name: 'Среднее зелье лечения', type: 'potion', slot: 'none', rarity: 'uncommon', description: 'Восстанавливает 30 HP', usable: true, effect: { heal: 30 }, stackable: true, maxStack: 10, weight: 0.5, price: 15 },
    { itemId: 'potion-mana-small', name: 'Малое зелье маны', type: 'potion', slot: 'none', rarity: 'common', description: 'Восстанавливает 10 MP', usable: true, effect: { mana: 10 }, stackable: true, maxStack: 10, weight: 0.5, price: 5 },
    // Weapons
    { itemId: 'iron-sword', name: 'Железный меч', type: 'weapon', slot: 'weapon', rarity: 'common', damage: { die: 'd6', bonus: 1 }, range: 1, weight: 3, stats: { attack: 1 }, price: 20 },
    { itemId: 'steel-sword', name: 'Стальной меч', type: 'weapon', slot: 'weapon', rarity: 'uncommon', damage: { die: 'd8', bonus: 2 }, range: 1, weight: 3, stats: { attack: 2 }, price: 50 },
    { itemId: 'wooden-bow', name: 'Деревянный лук', type: 'weapon', slot: 'weapon', rarity: 'common', damage: { die: 'd6', bonus: 0 }, range: 3, weight: 2, price: 15 },
    { itemId: 'staff-fire', name: 'Посох огня', type: 'weapon', slot: 'weapon', rarity: 'rare', damage: { die: 'd8', bonus: 2 }, range: 3, weight: 2, stats: { intellect: 2 }, price: 80 },
    { itemId: 'battle-axe', name: 'Боевой топор', type: 'weapon', slot: 'weapon', rarity: 'uncommon', damage: { die: 'd8', bonus: 1 }, range: 1, weight: 4, stats: { attack: 2 }, price: 45 },
    // Armor
    { itemId: 'leather-armor', name: 'Кожаная броня', type: 'armor', slot: 'armor', rarity: 'common', stats: { armor: 2 }, weight: 4, price: 15 },
    { itemId: 'chain-mail', name: 'Кольчуга', type: 'armor', slot: 'armor', rarity: 'uncommon', stats: { armor: 4 }, weight: 6, price: 40 },
    { itemId: 'plate-armor', name: 'Латная броня', type: 'armor', slot: 'armor', rarity: 'rare', stats: { armor: 6 }, weight: 8, price: 100 },
    // Starting gear
    { itemId: 'leather-sandals', name: 'Кожаные сандалии', type: 'boots', slot: 'boots', rarity: 'common', stats: { armor: 1 }, weight: 1, price: 3 },
    { itemId: 'simple-pants', name: 'Простые штаны', type: 'pants', slot: 'pants', rarity: 'common', stats: { armor: 1 }, weight: 1, price: 3 },
    { itemId: 'simple-shirt', name: 'Простая рубаха', type: 'armor', slot: 'armor', rarity: 'common', stats: { armor: 1 }, weight: 1, price: 3 },
    // Shields
    { itemId: 'wooden-shield', name: 'Деревянный щит', type: 'shield', slot: 'shield', rarity: 'common', stats: { armor: 2 }, weight: 3, price: 10 },
    { itemId: 'iron-shield', name: 'Железный щит', type: 'shield', slot: 'shield', rarity: 'uncommon', stats: { armor: 4 }, weight: 5, price: 35 },
    // Helmets
    { itemId: 'leather-cap', name: 'Кожаный шлем', type: 'helmet', slot: 'helmet', rarity: 'common', stats: { armor: 1 }, weight: 1, price: 8 },
    // Tools
    { itemId: 'torch', name: 'Факел', type: 'tool', slot: 'none', rarity: 'common', usable: true, effect: { visionBonus: 1, permanent: true }, weight: 1, price: 2, description: '+1 к обзору на всю игру' },
    // Scrolls
    { itemId: 'scroll-fireball', name: 'Свиток огненного шара', type: 'scroll', slot: 'none', rarity: 'rare', usable: true, effect: { spell: 'fireball', damage: 15, aoe: 2 }, weight: 0.2, price: 50 },
    // Junk
    { itemId: 'goblin-ear', name: 'Ухо гоблина', type: 'junk', slot: 'none', rarity: 'common', weight: 0.1, price: 1 },
    { itemId: 'troll-tooth', name: 'Зуб тролля', type: 'junk', slot: 'none', rarity: 'uncommon', weight: 0.2, price: 5 },
  ];
  for (const i of items) { await GameItem.updateOne({ $or: [{ itemId: i.itemId }, { name: i.name }] }, { $setOnInsert: i }, { upsert: true }); }
  console.log(`Seeded ${items.length} items (upsert)`);

  // --- ABILITIES ---
  // Upsert abilities
  const abilities = [
    // Warrior
    { abilityId: 'shield-bash', name: 'Удар щитом', type: 'class_ability', cls: 'warrior', branch: 'bastion', unlockLevel: 2, manaCost: 3, description: 'Оглушающий удар щитом', difficulty: 1, effect: { damage: 'd4', status: 'stunned', statusChance: 30 } },
    { abilityId: 'war-cry', name: 'Боевой клич', type: 'class_ability', cls: 'warrior', branch: 'vanguard', unlockLevel: 4, manaCost: 4, description: 'Вдохновляет союзников', difficulty: 2, effect: { buff: 'inspired', aoe: 3, duration: 2 } },
    { abilityId: 'berserk', name: 'Берсерк', type: 'class_ability', cls: 'warrior', branch: 'vanguard', unlockLevel: 7, manaCost: 7, description: '+50% урона на 2 хода', difficulty: 3, effect: { selfBuff: 'berserk', duration: 2 } },
    { abilityId: 'whirlwind', name: 'Вихрь', type: 'class_ability', cls: 'warrior', branch: 'vanguard', unlockLevel: 10, manaCost: 9, description: 'AoE атака вокруг', difficulty: 4, effect: { damage: 'd8', aoe: 1, pattern: 'circle' } },
    { abilityId: 'shield-wall', name: 'Стена щитов', type: 'class_ability', cls: 'warrior', branch: 'bastion', unlockLevel: 15, manaCost: 9, description: 'Щит для себя и союзника', difficulty: 4, effect: { buff: 'shielded', aoe: 2, duration: 2 } },
    // Mage
    { abilityId: 'fireball', name: 'Огненный шар', type: 'spell', cls: 'mage', branch: 'destruction', unlockLevel: 2, manaCost: 5, description: 'Огненный шар с AoE', difficulty: 2, range: 5, effect: { damage: 'd6', aoe: 1, element: 'fire' } },
    { abilityId: 'ice-shield', name: 'Ледяной щит', type: 'spell', cls: 'mage', branch: 'protection', unlockLevel: 4, manaCost: 5, description: 'Ледяная защита', difficulty: 2, effect: { buff: 'shielded', duration: 3 } },
    { abilityId: 'lightning', name: 'Молния', type: 'spell', cls: 'mage', branch: 'destruction', unlockLevel: 7, manaCost: 7, description: 'Удар молнией', difficulty: 3, range: 5, effect: { damage: 'd8', chain: 2 } },
    { abilityId: 'teleport', name: 'Телепортация', type: 'spell', cls: 'mage', branch: 'utility', unlockLevel: 10, manaCost: 9, description: 'Мгновенное перемещение', difficulty: 4, range: 6, effect: { teleport: true } },
    // Priest
    { abilityId: 'heal', name: 'Лечение', type: 'spell', cls: 'priest', branch: 'restoration', unlockLevel: 2, manaCost: 5, description: 'Лечит союзника', difficulty: 2, range: 4, effect: { heal: 'd8+4' } },
    { abilityId: 'bless', name: 'Благословение', type: 'spell', cls: 'priest', branch: 'restoration', unlockLevel: 4, manaCost: 5, description: '+2 к атаке и защите', difficulty: 2, range: 4, effect: { buff: 'inspired', duration: 3 } },
    { abilityId: 'smite', name: 'Кара', type: 'spell', cls: 'priest', branch: 'judgment', unlockLevel: 7, manaCost: 7, description: 'Святой урон', difficulty: 3, range: 5, effect: { damage: 'd8', element: 'holy' } },
    { abilityId: 'sanctuary', name: 'Святилище', type: 'spell', cls: 'priest', branch: 'restoration', unlockLevel: 10, manaCost: 9, description: 'Зона защиты', difficulty: 4, effect: { zone: 'sanctuary', radius: 2, duration: 3 } },
    { abilityId: 'mass-heal', name: 'Массовое лечение', type: 'spell', cls: 'priest', branch: 'restoration', unlockLevel: 15, manaCost: 12, description: 'Лечит всех союзников', difficulty: 5, effect: { heal: 'd10+5', aoe: 'all_allies' } },
    // Bard
    { abilityId: 'inspire', name: 'Вдохновение', type: 'class_ability', cls: 'bard', branch: 'harmony', unlockLevel: 2, manaCost: 3, description: 'Вдохновляет союзника', difficulty: 1, range: 4, effect: { buff: 'inspired', duration: 3 } },
    { abilityId: 'lullaby', name: 'Колыбельная', type: 'class_ability', cls: 'bard', branch: 'discord', unlockLevel: 4, manaCost: 5, description: 'Усыпляет врага', difficulty: 2, range: 4, effect: { status: 'stunned', statusChance: 50, duration: 1 } },
    { abilityId: 'discord', name: 'Диссонанс', type: 'class_ability', cls: 'bard', branch: 'discord', unlockLevel: 7, manaCost: 7, description: 'Ослабляет врагов', difficulty: 3, range: 4, effect: { status: 'weakness', aoe: 2, duration: 2 } },
    { abilityId: 'song-of-rest', name: 'Песнь отдыха', type: 'class_ability', cls: 'bard', branch: 'harmony', unlockLevel: 10, manaCost: 9, description: 'Восстанавливает HP и MP', difficulty: 4, effect: { heal: 'd6+3', manaRestore: 5, aoe: 'all_allies' } },
    // Racial passives
    { abilityId: 'human-adaptability', name: 'Адаптивность', type: 'passive', cls: 'any', description: '+1 ко всем характеристикам', effect: { allStats: 1 } },
    { abilityId: 'elf-keen-sight', name: 'Острое зрение', type: 'passive', cls: 'any', description: '+1 к обзору', effect: { visionBonus: 1 } },
    { abilityId: 'dwarf-toughness', name: 'Стойкость', type: 'passive', cls: 'any', description: '+5 HP', effect: { hpBonus: 5 } },
  ];
  for (const a of abilities) { await AbilityTemplate.updateOne({ abilityId: a.abilityId }, { $setOnInsert: a }, { upsert: true }); }
  console.log(`Seeded ${abilities.length} abilities (upsert)`);

  // --- SCENARIOS ---
  // Upsert scenarios
  const scenarios = [
    {
      scenarioId: 'forest-road-goblins',
      name: 'Засада гоблинов',
      description: 'Гоблины устроили засаду на лесной дороге. Разберитесь с ними!',
      mapId: 'forest-road',
      difficulty: 'easy',
      playerLevel: 1,
      maxPlayers: 4,
      monsterPool: [
        { type: 'goblin', count: 3, positions: [{ x: 12, y: 3 }, { x: 14, y: 5 }, { x: 11, y: 7 }] },
        { type: 'goblin', count: 2, positions: [{ x: 15, y: 8 }, { x: 13, y: 10 }] },
      ],
      objectives: { primary: 'Уничтожить всех гоблинов', secondary: 'Найти сундук с сокровищами' },
      rewards: { xp: 50, gold: 10, items: ['potion-health-small'] },
      zones: { startZone: [{ x: 2, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 8 }, { x: 3, y: 8 }] },
      briefing: { lore: 'Торговцы сообщают о гоблинах на лесной дороге...', hints: ['Гоблины слабы в ближнем бою', 'Используйте укрытия'] },
      winCondition: 'all_enemies_dead',
      lossCondition: 'all_heroes_dead',
    },
    {
      scenarioId: 'troll-cave-raid',
      name: 'Логово тролля',
      description: 'В глубине пещеры обитает тролль-вождь. Победите его!',
      mapId: 'troll-cave',
      difficulty: 'medium',
      playerLevel: 3,
      maxPlayers: 4,
      monsterPool: [
        { type: 'troll', count: 2, positions: [{ x: 8, y: 4 }, { x: 10, y: 6 }] },
        { type: 'troll-boss', count: 1, positions: [{ x: 12, y: 8 }] },
      ],
      bossType: 'troll-boss',
      objectives: { primary: 'Победить тролля-вождя' },
      rewards: { xp: 120, gold: 25, items: ['steel-sword'] },
      zones: { startZone: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }] },
      briefing: { lore: 'Древний тролль обосновался в пещере...', hints: ['Тролль-вождь очень силён', 'Используйте огненные заклинания'] },
      winCondition: 'boss_dead',
      lossCondition: 'all_heroes_dead',
    },
  ];
  for (const s of scenarios) { await Scenario.updateOne({ scenarioId: s.scenarioId }, { $setOnInsert: s }, { upsert: true }); }
  console.log(`Seeded ${scenarios.length} scenarios (upsert)`);

  console.log('✅ Game data seeded successfully');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
