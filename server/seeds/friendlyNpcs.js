/**
 * Seed FriendlyNpc collection with all city traders and scenario NPCs
 */
const mongoose = require('mongoose');
const config = require('../config');
require('../models/FriendlyNpc');

const NPCS = [
  // ═══════════════════════════
  // CITY TRADERS (one per lobby)
  // ═══════════════════════════

  // Taverns — еда и напитки
  {
    npcId: 'tavern-keeper-1', name: 'Хельга', label: '🍺',
    role: 'innkeeper', locationId: 'tavern-1',
    hp: 50, canTalk: true, isTrader: true,
    greeting: 'Добро пожаловать в «Золотой кубок»! Чем могу угостить?',
    description: 'Владелица таверны «Золотой кубок», полная женщина с добрым нравом.',
    thematicTypes: ['food', 'provisions'],
  },
  {
    npcId: 'tavern-keeper-2', name: 'Гримбольд', label: '🍻',
    role: 'innkeeper', locationId: 'tavern-2',
    hp: 50, canTalk: true, isTrader: true,
    greeting: 'Ха! Заходи, путник. У нас лучшее пиво в городе!',
    description: 'Весёлый бородатый дварф, хозяин «Весёлого гоблина».',
    thematicTypes: ['food', 'provisions'],
  },
  {
    npcId: 'tavern-keeper-3', name: 'Лиара', label: '🌿',
    role: 'innkeeper', locationId: 'tavern-3',
    hp: 50, canTalk: true, isTrader: true,
    greeting: 'Тишина и покой ждут тебя под сенью Эльфийского дуба.',
    description: 'Эльфийка с мелодичным голосом, хозяйка «Эльфийского дуба».',
    thematicTypes: ['food', 'provisions'],
  },
  {
    npcId: 'tavern-keeper-4', name: 'Ворг', label: '🖤',
    role: 'innkeeper', locationId: 'tavern-4',
    hp: 50, canTalk: true, isTrader: true,
    greeting: 'Чего надо? Если пить — садись. Если болтать — проваливай.',
    description: 'Угрюмый хозяин «Тёмного подвала», но варит отличный грог.',
    thematicTypes: ['food', 'provisions'],
  },

  // Кузница — оружие, броня, слитки, крафт легендарных
  {
    npcId: 'blacksmith-morn', name: 'Кузнец Морн', label: '🔨',
    role: 'blacksmith', locationId: 'smithy',
    hp: 80, armor: 5, canTalk: true, isTrader: true,
    greeting: 'Огонь и сталь — вот моя жизнь. Что выкуешь сегодня?',
    description: 'Мастер-кузнец. Куёт лучшее оружие и броню в городе. Может скрафтить легендарные предметы.',
    thematicTypes: ['weapon', 'armor', 'helmet', 'shield', 'boots'],
  },

  // Травница — травы и ингредиенты
  {
    npcId: 'herbalist-mira', name: 'Травница Мира', label: '🌿',
    role: 'herbalist', locationId: 'herbalist',
    hp: 30, canTalk: true, isTrader: true,
    greeting: 'Природа щедра к тем, кто умеет слушать. Заходи, путник.',
    description: 'Мудрая травница, собирает редкие травы и коренья.',
    thematicTypes: ['herb', 'ingredient', 'provisions'],
  },

  // Алхимик — зелья, реагенты, крафт легендарных зелий
  {
    npcId: 'alchemist-zoran', name: 'Алхимик Зоран', label: '⚗️',
    role: 'alchemist', locationId: 'alchemist',
    hp: 40, canTalk: true, isTrader: true,
    greeting: 'Осторожнее! Здесь повсюду реактивы... Что тебе нужно?',
    description: 'Эксцентричный алхимик, создаёт зелья и может крафтить легендарные эликсиры.',
    thematicTypes: ['potion', 'reagent', 'ingredient'],
  },

  // Храм — свитки, крафт легендарных свитков
  {
    npcId: 'priest-aldric', name: 'Жрец Алдрик', label: '✝️',
    role: 'priest', locationId: 'temple',
    hp: 60, canTalk: true, isTrader: true,
    greeting: 'Свет да озарит твой путь. Чем могу помочь, странник?',
    description: 'Старший жрец храма. Продаёт священные свитки и может крафтить легендарные.',
    thematicTypes: ['scroll'],
  },

  // Книжная лавка — пергаменты, перья, книги, крафт легендарных книг
  {
    npcId: 'scribe-elwin', name: 'Книжник Элвин', label: '📚',
    role: 'scribe', locationId: 'shop-1',
    hp: 25, canTalk: true, isTrader: true,
    greeting: 'А, ценитель знаний! Проходи, у меня есть кое-что интересное...',
    description: 'Учёный и каллиграф. Торгует книгами, пергаментами и может крафтить легендарные фолианты.',
    thematicTypes: ['scroll', 'book', 'parchment'],
  },

  // Ювелирная лавка — камни, украшения, крафт легендарных
  {
    npcId: 'jeweler-raya', name: 'Ювелир Рая', label: '💎',
    role: 'jeweler', locationId: 'shop-2',
    hp: 30, canTalk: true, isTrader: true,
    greeting: 'Блеск камней — отражение души. Выбирай, не стесняйся!',
    description: 'Искусная ювелирша. Торгует камнями и украшениями, крафтит легендарные амулеты и кольца.',
    thematicTypes: ['jewelry', 'ring', 'amulet', 'gem'],
  },

  // Магическая лавка
  {
    npcId: 'mage-vendor-talis', name: 'Маг Талис', label: '🔮',
    role: 'other', locationId: 'shop-3',
    hp: 45, canTalk: true, isTrader: true,
    greeting: 'Магия — не игрушка. Но если знаешь, что ищешь — милости прошу.',
    description: 'Торговец магическими принадлежностями. Продаёт посохи, реагенты и зачарованные предметы.',
    thematicTypes: ['scroll', 'reagent', 'tool'],
  },

  // Лавка Брона — одежда, ткани, нитки, крафт легендарной одежды
  {
    npcId: 'tailor-brona', name: 'Бронна', label: '🧵',
    role: 'tailor', locationId: 'shop-4',
    hp: 30, canTalk: true, isTrader: true,
    greeting: 'Добро пожаловать! У меня лучшие ткани во всём королевстве.',
    description: 'Мастерица-портниха. Торгует одеждой, тканями и мелочами, крафтит легендарную одежду.',
    thematicTypes: ['armor', 'cloak', 'cloth', 'thread'],
  },

  // Главная Лавка
  {
    npcId: 'main-shop-keeper', name: 'Торговец Марк', label: '🧑‍🌾',
    role: 'trader', locationId: 'main-shop',
    hp: 50, canTalk: true, isTrader: true,
    greeting: 'У меня найдётся всё! Ну, почти всё...',
    description: 'Главный торговец города. Скупает и продаёт всё понемногу.',
    thematicTypes: ['tool', 'junk', 'provisions'],
  },

  // Городские ворота — стражник
  {
    npcId: 'gate-guard', name: 'Стражник Рольф', label: '🛡️',
    role: 'guard', locationId: 'gates',
    hp: 80, armor: 5, attack: 3, canTalk: true, isTrader: false,
    greeting: 'Стой! Кто идёт? А, это ты... Проходи.',
    description: 'Главный стражник у ворот. Знает всё о том, что происходит за стенами города.',
  },

  // ═══════════════════════════
  // SCENARIO NPCs
  // ═══════════════════════════

  // Abandoned road scenario
  {
    npcId: 'wanderer', name: 'Странник', label: '🧙',
    role: 'wanderer', hp: 40, canTalk: true,
    greeting: 'Дорога опасна, путник. Будь осторожен.',
    description: 'Таинственный странник, бродящий по заброшенным дорогам.',
  },
  {
    npcId: 'woodcutter-boris', name: 'Дровосек Борис', label: '🪓',
    role: 'other', hp: 60, canTalk: true,
    greeting: 'Здорово! Гоблины совсем обнаглели...',
    description: 'Крепкий мужик с топором. Рубит деревья и не любит гоблинов.',
  },
  {
    npcId: 'herbalist-mira-wild', name: 'Травница Мира', label: '🌿',
    role: 'herbalist', hp: 30, canTalk: true,
    greeting: 'Тише, тише... Травы не любят шума.',
    description: 'Та самая травница Мира — иногда выходит за стены собирать травы.',
  },
  {
    npcId: 'trader-mark-road', name: 'Торговец Марк', label: '🧑‍🌾',
    role: 'trader', hp: 10, canTalk: true, isTrader: true,
    greeting: 'Мой обоз разграбили! Может купишь что осталось?',
    description: 'Бедолага-торговец, чей обоз был разграблен гоблинами.',
  },
  {
    npcId: 'trader-anna', name: 'Торговка Анна', label: '👩‍🌾',
    role: 'trader', hp: 10, canTalk: true, isTrader: true,
    greeting: 'Спасибо что помогаешь! Бери что нужно по хорошей цене.',
    description: 'Жена Торговца Марка. Спаслась от гоблинов.',
  },

  // Troll cave scenario
  {
    npcId: 'dwarf-miner', name: 'Дварф копатель', label: '⛏️',
    role: 'guide', hp: 50, armor: 3, canTalk: true,
    greeting: 'Эй! Ты тоже застрял здесь? Тролли повсюду...',
    description: 'Дварф-шахтёр, заблудившийся в пещерах троллей.',
  },
  {
    npcId: 'prisoner-cave', name: 'Пленник', label: '🙏',
    role: 'quest', hp: 15, canTalk: true, isQuestNpc: true,
    greeting: 'Помоги! Тролли держат меня в плену!',
    description: 'Несчастный путник, захваченный троллями. Квестовый НПС.',
  },
];

async function seed() {
  await mongoose.connect(config.mongoUri);
  const FriendlyNpc = mongoose.model('FriendlyNpc');

  let created = 0;
  let updated = 0;

  for (const npc of NPCS) {
    const existing = await FriendlyNpc.findOne({ npcId: npc.npcId });
    if (existing) {
      await FriendlyNpc.updateOne({ npcId: npc.npcId }, { $set: npc });
      updated++;
    } else {
      await FriendlyNpc.create(npc);
      created++;
    }
  }

  console.log(`✅ FriendlyNpc seed: ${created} created, ${updated} updated (total: ${NPCS.length})`);
  await mongoose.disconnect();
}

if (require.main === module) {
  seed().catch(err => { console.error('Seed error:', err); process.exit(1); });
}

module.exports = { seed, NPCS };
