const mongoose = require('mongoose');

const monsterTemplateSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    label: { type: String, default: '' },
    hp: { type: Number, required: true },
    armor: { type: Number, default: 0 },
    attack: { type: Number, default: 1 },
    agility: { type: Number, default: 0 },
    moveRange: { type: Number, default: 2 },
    vision: { type: Number, default: 4 },
    attackRange: { type: Number, default: 1 },
    damageDie: { type: String, default: 'd6' },
    xpReward: { type: Number, default: 10 },
    goldMin: { type: Number, default: 0 },
    goldMax: { type: Number, default: 5 },
    aiType: {
      type: String,
      enum: ['aggressive', 'defensive', 'support', 'coward', 'boss'],
      default: 'aggressive',
    },
    abilities: [mongoose.Schema.Types.Mixed],
    canTalk: { type: Boolean, default: false },
    img: { type: String, default: '' },
    tokenImg: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MonsterTemplate', monsterTemplateSchema);
