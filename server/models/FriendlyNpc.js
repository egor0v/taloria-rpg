const mongoose = require('mongoose');

const friendlyNpcSchema = new mongoose.Schema(
  {
    npcId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    label: { type: String, default: '🧝' },
    role: {
      type: String,
      enum: ['trader', 'quest', 'guide', 'guard', 'healer', 'blacksmith', 'alchemist', 'herbalist', 'scribe', 'jeweler', 'tailor', 'innkeeper', 'priest', 'wanderer', 'other'],
      default: 'other',
    },
    // Location — city lobby where NPC is based (null = scenario-only NPC)
    locationId: { type: String, default: '' },

    // Stats
    hp: { type: Number, default: 50 },
    armor: { type: Number, default: 0 },
    attack: { type: Number, default: 0 },
    agility: { type: Number, default: 0 },
    moveRange: { type: Number, default: 0 },
    vision: { type: Number, default: 5 },

    // Behaviour
    canTalk: { type: Boolean, default: true },
    isTrader: { type: Boolean, default: false },
    isQuestNpc: { type: Boolean, default: false },

    // Dialogue / greeting
    greeting: { type: String, default: '' },
    dialog: { type: String, default: '' },
    dialogTree: { type: mongoose.Schema.Types.Mixed, default: null },

    // Shop items (for traders) — array of itemId strings
    shopItems: [{ type: String }],
    thematicTypes: [{ type: String }],

    // Images
    img: { type: String, default: '' },        // Full portrait for hover/popup
    tokenImg: { type: String, default: '' },   // Small icon for map token

    // Description
    description: { type: String, default: '' },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FriendlyNpc', friendlyNpcSchema);
