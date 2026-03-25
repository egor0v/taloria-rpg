require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config');
const GameItem = require('../models/GameItem');

// Data from inventory_final.xlsx (124 items)
const RARITY_MAP = { 'Обычный': 'common', 'Необычный': 'uncommon', 'Редкий': 'rare', 'Эпический': 'epic', 'Легендарный': 'legendary' };
const LOCATION_MAP = {
  'Кузница': 'smithy',
  'Таверна': 'tavern-1',
  'Лавка травницы': 'herbalist',
  'Лавка алхимика': 'alchemist',
  'Книжная лавка': 'bookshop',
  'Храм': 'temple',
  'Лавка ювелира': 'jeweler',
  'Лавка Брона': 'bron-shop',
};

function slugify(name) {
  const map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
  return name.toLowerCase().split('').map(c => map[c] || c).join('').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
}

function parseCharacteristic(char) {
  if (!char) return {};
  const m = char.match(/(Урон|Защита|Ценность|Эффект|Качество|Прочность):\s*(\d+%?)/);
  if (!m) return {};
  const [, type, val] = m;
  const num = parseInt(val);
  switch (type) {
    case 'Урон': return { damage: { die: num <= 8 ? 'd4' : num <= 14 ? 'd6' : num <= 18 ? 'd8' : 'd10', bonus: Math.max(0, num - 10) } };
    case 'Защита': return { stats: { armor: Math.ceil(num / 3) } };
    case 'Эффект': return { effect: { heal: num, mana: Math.ceil(num * 0.7) }, usable: true };
    case 'Ценность': return { weight: Math.max(1, Math.ceil(num / 20)) };
    case 'Качество': return { stats: { quality: num } };
    case 'Прочность': return { stats: { durability: num } };
    default: return {};
  }
}

function detectType(name, loc, char) {
  const n = name.toLowerCase();
  if (['меч','клинок','палица','лук','топор','арбалет','посох'].some(w => n.includes(w))) return { type: 'weapon', slot: 'weapon' };
  if (['броня','кольчуг'].some(w => n.includes(w))) return { type: 'armor', slot: 'armor' };
  if (['щит'].some(w => n.includes(w))) return { type: 'shield', slot: 'shield' };
  if (['шлем'].some(w => n.includes(w))) return { type: 'helmet', slot: 'helmet' };
  if (['сапоги','сандалии'].some(w => n.includes(w))) return { type: 'boots', slot: 'boots' };
  if (['штаны'].some(w => n.includes(w))) return { type: 'pants', slot: 'pants' };
  if (['кольцо'].some(w => n.includes(w))) return { type: 'jewelry', slot: 'ring' };
  if (['ожерелье','амулет'].some(w => n.includes(w))) return { type: 'jewelry', slot: 'amulet' };
  if (['зелье','антидот'].some(w => n.includes(w))) return { type: 'potion', slot: 'none' };
  if (['свиток'].some(w => n.includes(w))) return { type: 'scroll', slot: 'none' };
  if (['рубин','сапфир','аметист','изумруд','алмаз','топаз','жемчуг','кристалл'].some(w => n.includes(w))) return { type: 'jewelry', slot: 'none' };
  if (['эссенция','пыль','песок','капля'].some(w => n.includes(w))) return { type: 'potion', slot: 'none' };
  if (['трава','цветок','лист','корень','ягода','роса','гриб','мох'].some(w => n.includes(w))) return { type: 'food', slot: 'none' };
  if (['пергамент','фолиант','чернила'].some(w => n.includes(w))) return { type: 'scroll', slot: 'none' };
  if (['верёвка','крюк','факел','лопата','тряпка','мел','кремень','мешок','карта','руна','ключ','осколок'].some(w => n.includes(w))) return { type: 'tool', slot: 'none' };
  if (['носок','гвоздь','кость','ведро','бутылка','кружка','флакон','вода','свеча','яд'].some(w => n.includes(w))) return { type: 'junk', slot: 'none' };
  if (['слиток','серебро','золото','мифрил','железо'].some(w => n.includes(w))) return { type: 'tool', slot: 'none' };
  if (['рубаха','ткань','нить','ремни','пряжка'].some(w => n.includes(w))) return { type: 'tool', slot: 'none' };
  return { type: 'junk', slot: 'none' };
}

const SELL_PRICES = { common: 1, uncommon: 10, rare: 50, epic: 100, legendary: 500 };

const ITEMS = [
  // Кузница (25)
  {name:"Короткий клинок",loc:"Кузница",char:"Урон: 13",rarity:"Необычный"},
  {name:"Лёгкий меч",loc:"Кузница",char:"Урон: 19",rarity:"Обычный"},
  {name:"Палица",loc:"Кузница",char:"Урон: 12",rarity:"Обычный"},
  {name:"Лук",loc:"Кузница",char:"Урон: 17",rarity:"Редкий"},
  {name:"Топор",loc:"Кузница",char:"Урон: 18",rarity:"Необычный"},
  {name:"Тяжёлый меч",loc:"Кузница",char:"Урон: 14",rarity:"Обычный"},
  {name:"Арбалет",loc:"Кузница",char:"Урон: 12",rarity:"Обычный"},
  {name:"Магический посох",loc:"Кузница",char:"Ценность: 48",rarity:"Необычный"},
  {name:"Лёгкая броня",loc:"Кузница",char:"Защита: 11",rarity:"Редкий"},
  {name:"Тяжёлая броня",loc:"Кузница",char:"Защита: 7",rarity:"Редкий"},
  {name:"Деревянный щит",loc:"Кузница",char:"Защита: 12",rarity:"Редкий"},
  {name:"Стальной щит",loc:"Кузница",char:"Защита: 4",rarity:"Редкий"},
  {name:"Лёгкий кожаный шлем",loc:"Кузница",char:"Защита: 5",rarity:"Обычный"},
  {name:"Стальной шлем",loc:"Кузница",char:"Защита: 9",rarity:"Редкий"},
  {name:"Кожаные сандалии",loc:"Кузница",char:"Ценность: 83",rarity:"Редкий"},
  {name:"Кожаные сапоги",loc:"Кузница",char:"Защита: 12",rarity:"Необычный"},
  {name:"Стальные сапоги",loc:"Кузница",char:"Защита: 7",rarity:"Обычный"},
  {name:"Кольчужные штаны",loc:"Кузница",char:"Защита: 4",rarity:"Редкий"},
  {name:"Слиток стали",loc:"Кузница",char:"Качество: 5",rarity:"Необычный"},
  {name:"Слиток серебра",loc:"Кузница",char:"Качество: 4",rarity:"Необычный"},
  {name:"Слиток золота",loc:"Кузница",char:"Качество: 5",rarity:"Обычный"},
  {name:"Слиток мифрила",loc:"Кузница",char:"Качество: 3",rarity:"Легендарный"},
  {name:"Слиток черного железа",loc:"Кузница",char:"Качество: 4",rarity:"Легендарный"},
  {name:"Черное серебро",loc:"Кузница",char:"Ценность: 26",rarity:"Легендарный"},
  {name:"Черное золото",loc:"Кузница",char:"Ценность: 75",rarity:"Легендарный"},
  // Таверна (5)
  {name:"Пустое ведро",loc:"Таверна",char:"Ценность: 69",rarity:"Обычный"},
  {name:"Пустая бутылка",loc:"Таверна",char:"Ценность: 92",rarity:"Необычный"},
  {name:"Сломанная кружка",loc:"Таверна",char:"Ценность: 96",rarity:"Редкий"},
  {name:"Стеклянные флаконы",loc:"Таверна",char:"Ценность: 53",rarity:"Необычный"},
  {name:"Чистая вода",loc:"Таверна",char:"Ценность: 57",rarity:"Обычный"},
  // Лавка травницы (12)
  {name:"Красная трава",loc:"Лавка травницы",char:"Ценность: 75",rarity:"Необычный"},
  {name:"Огненный цветок",loc:"Лавка травницы",char:"Ценность: 99",rarity:"Редкий"},
  {name:"Лист молнии",loc:"Лавка травницы",char:"Ценность: 78",rarity:"Необычный"},
  {name:"Черный корень",loc:"Лавка травницы",char:"Ценность: 18",rarity:"Легендарный"},
  {name:"Красный корень",loc:"Лавка травницы",char:"Ценность: 62",rarity:"Обычный"},
  {name:"Корень горного дуба",loc:"Лавка травницы",char:"Ценность: 88",rarity:"Необычный"},
  {name:"Ледяная ягода",loc:"Лавка травницы",char:"Ценность: 40",rarity:"Обычный"},
  {name:"Сушёные травы",loc:"Лавка травницы",char:"Ценность: 15",rarity:"Необычный"},
  {name:"Травы очищения",loc:"Лавка травницы",char:"Ценность: 22",rarity:"Обычный"},
  {name:"Роса рассвета",loc:"Лавка травницы",char:"Ценность: 46",rarity:"Необычный"},
  {name:"Гриб",loc:"Лавка травницы",char:"Ценность: 75",rarity:"Необычный"},
  {name:"Мох",loc:"Лавка травницы",char:"Ценность: 62",rarity:"Редкий"},
  // Лавка алхимика (18)
  {name:"Зелье лечения",loc:"Лавка алхимика",char:"Эффект: 22%",rarity:"Редкий"},
  {name:"Малое зелье маны",loc:"Лавка алхимика",char:"Эффект: 26%",rarity:"Редкий"},
  {name:"Антидот",loc:"Лавка алхимика",char:"Ценность: 70",rarity:"Необычный"},
  {name:"Зелье скорости",loc:"Лавка алхимика",char:"Эффект: 49%",rarity:"Редкий"},
  {name:"Яд змеи",loc:"Лавка алхимика",char:"Ценность: 80",rarity:"Обычный"},
  {name:"Яд паука",loc:"Лавка алхимика",char:"Ценность: 32",rarity:"Обычный"},
  {name:"Эссенция тьмы",loc:"Лавка алхимика",char:"Эффект: 37%",rarity:"Эпический"},
  {name:"Эссенция света",loc:"Лавка алхимика",char:"Эффект: 37%",rarity:"Эпический"},
  {name:"Эссенция воздуха",loc:"Лавка алхимика",char:"Эффект: 23%",rarity:"Эпический"},
  {name:"Эссенция ветра",loc:"Лавка алхимика",char:"Эффект: 15%",rarity:"Эпический"},
  {name:"Эссенция пространства",loc:"Лавка алхимика",char:"Эффект: 40%",rarity:"Эпический"},
  {name:"Эссенция маны",loc:"Лавка алхимика",char:"Эффект: 50%",rarity:"Эпический"},
  {name:"Эссенция смерти",loc:"Лавка алхимика",char:"Эффект: 47%",rarity:"Эпический"},
  {name:"Магическая пыль",loc:"Лавка алхимика",char:"Ценность: 42",rarity:"Необычный"},
  {name:"Пыль призрака",loc:"Лавка алхимика",char:"Ценность: 97",rarity:"Обычный"},
  {name:"Пыль иллюзий",loc:"Лавка алхимика",char:"Ценность: 29",rarity:"Обычный"},
  {name:"Песок времени",loc:"Лавка алхимика",char:"Ценность: 13",rarity:"Обычный"},
  {name:"Капля энергии",loc:"Лавка алхимика",char:"Ценность: 28",rarity:"Обычный"},
  // Книжная лавка (12)
  {name:"Пергамент",loc:"Книжная лавка",char:"Ценность: 79",rarity:"Необычный"},
  {name:"Древний пергамент",loc:"Книжная лавка",char:"Ценность: 52",rarity:"Легендарный"},
  {name:"Священный пергамент",loc:"Книжная лавка",char:"Ценность: 27",rarity:"Необычный"},
  {name:"Черный пергамент",loc:"Книжная лавка",char:"Ценность: 36",rarity:"Легендарный"},
  {name:"Древний фолиант",loc:"Книжная лавка",char:"Ценность: 42",rarity:"Легендарный"},
  {name:"Черный фолиант",loc:"Книжная лавка",char:"Ценность: 10",rarity:"Легендарный"},
  {name:"Чернила",loc:"Книжная лавка",char:"Ценность: 5",rarity:"Легендарный"},
  {name:"Чернила мага",loc:"Книжная лавка",char:"Ценность: 23",rarity:"Легендарный"},
  {name:"Серебряные чернила",loc:"Книжная лавка",char:"Ценность: 44",rarity:"Легендарный"},
  {name:"Золотые чернила",loc:"Книжная лавка",char:"Ценность: 14",rarity:"Легендарный"},
  {name:"Чернила из крови",loc:"Книжная лавка",char:"Ценность: 47",rarity:"Легендарный"},
  {name:"Чернила травника",loc:"Книжная лавка",char:"Ценность: 37",rarity:"Легендарный"},
  // Храм (6)
  {name:"Свиток огня",loc:"Храм",char:"Ценность: 51",rarity:"Обычный"},
  {name:"Свиток света",loc:"Храм",char:"Ценность: 84",rarity:"Необычный"},
  {name:"Свиток защиты",loc:"Храм",char:"Защита: 13",rarity:"Необычный"},
  {name:"Свиток воскрешения",loc:"Храм",char:"Ценность: 22",rarity:"Легендарный"},
  {name:"Святая вода",loc:"Храм",char:"Ценность: 95",rarity:"Обычный"},
  {name:"Белая свеча",loc:"Храм",char:"Ценность: 90",rarity:"Необычный"},
  // Лавка ювелира (17)
  {name:"Рубин",loc:"Лавка ювелира",char:"Ценность: 26",rarity:"Необычный"},
  {name:"Сапфир",loc:"Лавка ювелира",char:"Ценность: 61",rarity:"Обычный"},
  {name:"Аметист",loc:"Лавка ювелира",char:"Ценность: 60",rarity:"Необычный"},
  {name:"Изумруд",loc:"Лавка ювелира",char:"Ценность: 100",rarity:"Редкий"},
  {name:"Алмаз",loc:"Лавка ювелира",char:"Ценность: 43",rarity:"Легендарный"},
  {name:"Топаз",loc:"Лавка ювелира",char:"Ценность: 39",rarity:"Необычный"},
  {name:"Жемчуг",loc:"Лавка ювелира",char:"Ценность: 44",rarity:"Необычный"},
  {name:"Огненный кристалл",loc:"Лавка ювелира",char:"Качество: 2",rarity:"Эпический"},
  {name:"Ледяной кристалл",loc:"Лавка ювелира",char:"Качество: 2",rarity:"Эпический"},
  {name:"Кристалл света",loc:"Лавка ювелира",char:"Качество: 1",rarity:"Эпический"},
  {name:"Синий кристалл",loc:"Лавка ювелира",char:"Качество: 2",rarity:"Эпический"},
  {name:"Голубой кристалл",loc:"Лавка ювелира",char:"Качество: 2",rarity:"Эпический"},
  {name:"Черный кристалл",loc:"Лавка ювелира",char:"Качество: 2",rarity:"Легендарный"},
  {name:"Кольцо силы",loc:"Лавка ювелира",char:"Ценность: 31",rarity:"Эпический"},
  {name:"Кольцо маны",loc:"Лавка ювелира",char:"Ценность: 32",rarity:"Эпический"},
  {name:"Ожерелье удачи",loc:"Лавка ювелира",char:"Ценность: 66",rarity:"Необычный"},
  {name:"Амулет защиты",loc:"Лавка ювелира",char:"Защита: 6",rarity:"Эпический"},
  // Лавка Брона (29)
  {name:"Верёвка",loc:"Лавка Брона",char:"Ценность: 47",rarity:"Необычный"},
  {name:"Крюк",loc:"Лавка Брона",char:"Ценность: 17",rarity:"Редкий"},
  {name:"Факел",loc:"Лавка Брона",char:"Ценность: 30",rarity:"Редкий"},
  {name:"Лопата",loc:"Лавка Брона",char:"Ценность: 10",rarity:"Редкий"},
  {name:"Тряпка",loc:"Лавка Брона",char:"Ценность: 43",rarity:"Обычный"},
  {name:"Мел",loc:"Лавка Брона",char:"Ценность: 7",rarity:"Необычный"},
  {name:"Кремень",loc:"Лавка Брона",char:"Ценность: 64",rarity:"Необычный"},
  {name:"Пустой мешок",loc:"Лавка Брона",char:"Ценность: 85",rarity:"Редкий"},
  {name:"Карта сокровищ",loc:"Лавка Брона",char:"Ценность: 7",rarity:"Необычный"},
  {name:"Древняя руна",loc:"Лавка Брона",char:"Ценность: 41",rarity:"Легендарный"},
  {name:"Ключ подземелья",loc:"Лавка Брона",char:"Ценность: 91",rarity:"Необычный"},
  {name:"Осколок артефакта",loc:"Лавка Брона",char:"Ценность: 74",rarity:"Обычный"},
  {name:"Рваный носок",loc:"Лавка Брона",char:"Ценность: 4",rarity:"Редкий"},
  {name:"Ржавый гвоздь",loc:"Лавка Брона",char:"Ценность: 8",rarity:"Необычный"},
  {name:"Кость",loc:"Лавка Брона",char:"Ценность: 53",rarity:"Редкий"},
  {name:"Простая рубаха",loc:"Лавка Брона",char:"Ценность: 68",rarity:"Необычный"},
  {name:"Грязные штаны из мешковины",loc:"Лавка Брона",char:"Защита: 14",rarity:"Редкий"},
  {name:"Ткань теней",loc:"Лавка Брона",char:"Прочность: 3",rarity:"Необычный"},
  {name:"Ткань мага",loc:"Лавка Брона",char:"Прочность: 9",rarity:"Редкий"},
  {name:"Ткань маны",loc:"Лавка Брона",char:"Прочность: 3",rarity:"Редкий"},
  {name:"Ткань леса",loc:"Лавка Брона",char:"Прочность: 7",rarity:"Редкий"},
  {name:"Плотная ткань",loc:"Лавка Брона",char:"Прочность: 8",rarity:"Необычный"},
  {name:"Нить паучьего шелка",loc:"Лавка Брона",char:"Прочность: 6",rarity:"Необычный"},
  {name:"Серебряная нить",loc:"Лавка Брона",char:"Прочность: 9",rarity:"Обычный"},
  {name:"Черная нить",loc:"Лавка Брона",char:"Прочность: 1",rarity:"Легендарный"},
  {name:"Магическая нить",loc:"Лавка Брона",char:"Прочность: 7",rarity:"Обычный"},
  {name:"Нить паука",loc:"Лавка Брона",char:"Прочность: 5",rarity:"Необычный"},
  {name:"Кожаные ремни",loc:"Лавка Брона",char:"Ценность: 85",rarity:"Необычный"},
  {name:"Железная пряжка",loc:"Лавка Брона",char:"Ценность: 96",rarity:"Обычный"},
];

(async () => {
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB');

  let created = 0, updated = 0, errors = 0;

  for (const item of ITEMS) {
    const itemId = slugify(item.name);
    const rarity = RARITY_MAP[item.rarity] || 'common';
    const { type, slot } = detectType(item.name, item.loc, item.char);
    const parsed = parseCharacteristic(item.char);
    const location = LOCATION_MAP[item.loc] || item.loc;
    const sellPrice = SELL_PRICES[rarity] || 1;

    const data = {
      itemId,
      name: item.name,
      type,
      slot,
      rarity,
      description: `${item.name} — продаётся в ${item.loc}`,
      weight: parsed.weight || 1,
      damage: parsed.damage || undefined,
      stats: parsed.stats || undefined,
      effect: parsed.effect || undefined,
      usable: parsed.usable || type === 'potion' || type === 'scroll' || type === 'food',
      stackable: ['potion', 'scroll', 'food', 'tool', 'junk'].includes(type),
      maxStack: ['potion', 'scroll', 'food', 'tool', 'junk'].includes(type) ? 99 : 1,
      sellPrice,
      shopLocation: location,
      img: `/uploads/items/${itemId}.png`,
      active: true,
    };

    try {
      // Check by itemId OR by name to prevent duplicates
      const existing = await GameItem.findOne({ $or: [{ itemId }, { name: item.name }] });
      if (existing) {
        await GameItem.updateOne({ _id: existing._id }, { $set: { ...data, itemId: existing.itemId } });
        updated++;
      } else {
        await GameItem.create(data);
        created++;
      }
    } catch (err) {
      console.error(`  Error: ${item.name}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n✅ Created: ${created} | Updated: ${updated} | Errors: ${errors} | Total: ${ITEMS.length}`);

  // Summary by location
  const byLoc = {};
  ITEMS.forEach(i => { byLoc[i.loc] = (byLoc[i.loc] || 0) + 1; });
  console.log('\n📍 Items by location:');
  for (const [loc, count] of Object.entries(byLoc)) {
    console.log(`  ${loc}: ${count} items → ${LOCATION_MAP[loc]}`);
  }

  await mongoose.disconnect();
})();
