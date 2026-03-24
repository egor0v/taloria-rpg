const mongoose = require('mongoose');

const abilityTemplateSchema = new mongoose.Schema(
  {
    abilityId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['class_ability', 'skill', 'spell', 'focus', 'passive'],
      required: true,
    },
    cls: {
      type: String,
      enum: ['warrior', 'mage', 'priest', 'bard', 'any'],
      default: 'any',
    },
    branch: { type: String, default: '' },
    unlockLevel: { type: Number, default: 1 },
    manaCost: { type: Number, default: 0 },
    cooldown: { type: Number, default: 0 },
    description: { type: String, default: '' },
    effect: { type: mongoose.Schema.Types.Mixed, default: {} },
    difficulty: { type: Number, min: 1, max: 6, default: 1 },
    pattern: { type: String, default: '' },
    range: { type: Number, default: 1 },
    aoe: { type: mongoose.Schema.Types.Mixed, default: null },
    img: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AbilityTemplate', abilityTemplateSchema);
