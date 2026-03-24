// ── Free tier ────────────────────────────────────────────────────────
const MAX_FREE_HEROES = 2;

// ── XP thresholds (levels 1-50, exponential factor 1.2, base 250) ───
const XP_THRESHOLDS = [0]; // index 0 = level 1 (0 XP needed)
for (let lvl = 2; lvl <= 50; lvl++) {
  XP_THRESHOLDS.push(Math.round(250 * Math.pow(1.2, lvl - 2)));
}

// ── Class defaults ───────────────────────────────────────────────────
const CLASS_DEFAULTS = {
  warrior: { hp: 30, mp: 20, moveRange: 2, vision: 4 },
  mage:    { hp: 20, mp: 30, moveRange: 2, vision: 5 },
  priest:  { hp: 30, mp: 40, moveRange: 2, vision: 4 },
  bard:    { hp: 25, mp: 30, moveRange: 3, vision: 4 },
};

// ── Racial stat bonuses [atk, agi, arm, int, wis, cha] + extras ─────
const RACIAL_BONUSES = {
  human: {
    stats: { attack: 1, agility: 1, armor: 1, intellect: 1, wisdom: 1, charisma: 1 },
    hpBonus: 0,
    visionBonus: 0,
  },
  elf: {
    stats: { attack: 0, agility: 2, armor: 0, intellect: 1, wisdom: 0, charisma: 0 },
    hpBonus: 0,
    visionBonus: 1,
  },
  dwarf: {
    stats: { attack: 1, agility: 0, armor: 2, intellect: 0, wisdom: 0, charisma: 0 },
    hpBonus: 5,
    visionBonus: 0,
  },
};

// ── Combat constants ─────────────────────────────────────────────────
const BASE_MOVE_RANGE = 2;
const OFFROAD_MOVE_RANGE = 1;
const ENCOUNTER_RANGE = 3;
const COMBAT_ZONE_RANGE = 4;
const SURPRISE_INITIATIVE_BONUS = 10;
const SURPRISE_DAMAGE_BONUS = 5;

// ── Fog of war states ────────────────────────────────────────────────
const FOG_STATES = {
  HIDDEN: 'hidden',
  REVEALED: 'revealed',
  VISIBLE: 'visible',
};

// ── Terrain types ────────────────────────────────────────────────────
const TERRAIN_TYPES = {
  GRASS: 'grass',
  FOREST: 'forest',
  MOUNTAIN: 'mountain',
  WATER: 'water',
  ROAD: 'road',
  SAND: 'sand',
  SWAMP: 'swamp',
  SNOW: 'snow',
  LAVA: 'lava',
  WALL: 'wall',
  BRIDGE: 'bridge',
  CITY: 'city',
};

// ── Die types ────────────────────────────────────────────────────────
const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

// ── Trade point costs by rarity ──────────────────────────────────────
const TRADE_POINT_COSTS = {
  common: 3,
  uncommon: 6,
  rare: 10,
  epic: 15,
  legendary: 25,
};

// ── Level up bonuses per class (percentage of base HP / MP) ──────────
const LEVEL_UP_BONUSES = {
  warrior: { hpPercent: 12, mpPercent: 5 },
  mage:    { hpPercent: 6,  mpPercent: 12 },
  priest:  { hpPercent: 8,  mpPercent: 10 },
  bard:    { hpPercent: 8,  mpPercent: 8 },
};

// ── Ability unlock levels per class ──────────────────────────────────
const ABILITY_UNLOCK_LEVELS = {
  warrior: [1, 3, 5, 8, 12, 16, 20, 25, 30, 35, 40, 45, 50],
  mage:    [1, 3, 5, 8, 12, 16, 20, 25, 30, 35, 40, 45, 50],
  priest:  [1, 3, 5, 8, 12, 16, 20, 25, 30, 35, 40, 45, 50],
  bard:    [1, 3, 5, 8, 12, 16, 20, 25, 30, 35, 40, 45, 50],
};

// ── City locations (13 локаций) ──────────────────────────────────────
const CITY_LOCATIONS = [
  { id: 'tavern-1', name: 'Таверна «Золотой кубок»',    type: 'tavern',        maxPlayers: 50 },
  { id: 'tavern-2', name: 'Таверна «Весёлый гоблин»',   type: 'tavern',        maxPlayers: 50 },
  { id: 'tavern-3', name: 'Таверна «Эльфийский дуб»',   type: 'tavern',        maxPlayers: 50 },
  { id: 'tavern-4', name: 'Таверна «Тёмный подвал»',    type: 'tavern',        maxPlayers: 50 },
  { id: 'smithy',   name: 'Кузница',                    type: 'smithy',        maxPlayers: 30 },
  { id: 'temple',   name: 'Храм',                       type: 'temple',        maxPlayers: 30 },
  { id: 'alchemist',name: 'Лаборатория алхимика',       type: 'alchemist_lab', maxPlayers: 30 },
  { id: 'herbalist',name: 'Хижина травницы',             type: 'herbalist_hut', maxPlayers: 20 },
  { id: 'shop-1',   name: 'Книжная лавка',              type: 'shop',          maxPlayers: 30 },
  { id: 'shop-2',   name: 'Ювелирная лавка',            type: 'shop',          maxPlayers: 30 },
  { id: 'shop-3',   name: 'Магическая лавка',           type: 'shop',          maxPlayers: 30 },
  { id: 'shop-4',   name: 'Лавка Брона',                type: 'shop',          maxPlayers: 30 },
  { id: 'main-shop',name: 'Главная Лавка',              type: 'main_shop',     maxPlayers: 50 },
  { id: 'gates',    name: 'Городские ворота',           type: 'gates',         maxPlayers: 50 },
];

// ── Subscription tiers ───────────────────────────────────────────────
const SUBSCRIPTION_TIERS = {
  stranger: { label: 'Странник',    heroSlots: 3, stashRows: 3 },
  seeker:   { label: 'Искатель',    heroSlots: 5, stashRows: 4 },
  legend:   { label: 'Легенда',     heroSlots: 8, stashRows: 6 },
};

module.exports = {
  MAX_FREE_HEROES,
  XP_THRESHOLDS,
  CLASS_DEFAULTS,
  RACIAL_BONUSES,
  BASE_MOVE_RANGE,
  OFFROAD_MOVE_RANGE,
  ENCOUNTER_RANGE,
  COMBAT_ZONE_RANGE,
  SURPRISE_INITIATIVE_BONUS,
  SURPRISE_DAMAGE_BONUS,
  FOG_STATES,
  TERRAIN_TYPES,
  DIE_TYPES,
  TRADE_POINT_COSTS,
  LEVEL_UP_BONUSES,
  ABILITY_UNLOCK_LEVELS,
  CITY_LOCATIONS,
  SUBSCRIPTION_TIERS,
};
