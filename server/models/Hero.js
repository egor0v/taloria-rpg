const mongoose = require('mongoose');
const { CLASS_DEFAULTS, RACIAL_BONUSES } = require('../constants');

const heroSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    cls: { type: String, enum: ['warrior', 'mage', 'priest', 'bard'], required: true },
    race: { type: String, enum: ['human', 'elf', 'dwarf'], required: true },
    gender: { type: String, enum: ['male', 'female'], required: true },

    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },

    hp: { type: Number },
    maxHp: { type: Number },
    mp: { type: Number },
    maxMp: { type: Number },

    attack: { type: Number, default: 6 },
    agility: { type: Number, default: 6 },
    armor: { type: Number, default: 6 },
    intellect: { type: Number, default: 6 },
    wisdom: { type: Number, default: 6 },
    charisma: { type: Number, default: 6 },

    moveRange: { type: Number },
    vision: { type: Number },

    equipment: {
      weapon: { type: mongoose.Schema.Types.Mixed, default: null },
      shield: { type: mongoose.Schema.Types.Mixed, default: null },
      helmet: { type: mongoose.Schema.Types.Mixed, default: null },
      cloak: { type: mongoose.Schema.Types.Mixed, default: null },
      armor: { type: mongoose.Schema.Types.Mixed, default: null },
      pants: { type: mongoose.Schema.Types.Mixed, default: null },
      boots: { type: mongoose.Schema.Types.Mixed, default: null },
      gloves: { type: mongoose.Schema.Types.Mixed, default: null },
      ring: { type: mongoose.Schema.Types.Mixed, default: null },
      amulet: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    inventory: { type: [mongoose.Schema.Types.Mixed], default: [] },
    stash: { type: [mongoose.Schema.Types.Mixed], default: [] },
    stashRows: { type: Number, default: 2 },

    gold: { type: Number, default: 0 },
    silver: { type: Number, default: 10 },

    abilities: { type: [mongoose.Schema.Types.Mixed], default: [] },
    baseAbilities: { type: [mongoose.Schema.Types.Mixed], default: [] },
    learnedAbilities: { type: [mongoose.Schema.Types.Mixed], default: [] },
    spells: { type: [mongoose.Schema.Types.Mixed], default: [] },
    skillPoints: { type: Number, default: 0 },
    tradePoints: { type: Number, default: 0 },

    appearance: { type: mongoose.Schema.Types.Mixed, default: {} },

    canLevelUp: { type: Boolean, default: false },
    weaponChosen: { type: Boolean, default: false },
    abilityChosen: { type: Boolean, default: false },

    missionCompletions: { type: Number, default: 0 },
    unlockedAbilities: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  {
    timestamps: true,
  }
);

/**
 * Returns computed starting stats for a class + race combination.
 */
heroSchema.statics.getClassDefaults = function (cls, race) {
  const base = CLASS_DEFAULTS[cls];
  if (!base) throw new Error(`Unknown class: ${cls}`);

  const racial = RACIAL_BONUSES[race];
  if (!racial) throw new Error(`Unknown race: ${race}`);

  const hp = base.hp + (racial.hpBonus || 0);
  const mp = base.mp;
  const vision = base.vision + (racial.visionBonus || 0);

  return {
    hp,
    maxHp: hp,
    mp,
    maxMp: mp,
    moveRange: base.moveRange,
    vision,
    attack: 6 + (racial.stats.attack || 0),
    agility: 6 + (racial.stats.agility || 0),
    armor: 6 + (racial.stats.armor || 0),
    intellect: 6 + (racial.stats.intellect || 0),
    wisdom: 6 + (racial.stats.wisdom || 0),
    charisma: 6 + (racial.stats.charisma || 0),
  };
};

module.exports = mongoose.model('Hero', heroSchema);
