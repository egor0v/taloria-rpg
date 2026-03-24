const mongoose = require('mongoose');

const scenarioSchema = new mongoose.Schema(
  {
    scenarioId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    mapId: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'nightmare'],
      default: 'medium',
    },
    playerLevel: { type: Number, default: 1 },
    maxPlayers: { type: Number, default: 4 },
    monsterPool: [mongoose.Schema.Types.Mixed],
    bossType: { type: String, default: '' },
    monsterOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },
    traders: [mongoose.Schema.Types.Mixed],
    friendlyNpcs: [mongoose.Schema.Types.Mixed],
    objectives: { type: mongoose.Schema.Types.Mixed, default: {} },
    rewards: { type: mongoose.Schema.Types.Mixed, default: {} },
    zones: { type: mongoose.Schema.Types.Mixed, default: {} },
    briefing: { type: mongoose.Schema.Types.Mixed, default: {} },
    dialogTrees: { type: mongoose.Schema.Types.Mixed, default: {} },
    winCondition: { type: String, default: '' },
    lossCondition: { type: String, default: '' },
    introNarration: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Scenario', scenarioSchema);
