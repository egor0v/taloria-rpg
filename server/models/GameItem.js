const mongoose = require('mongoose');

const gameItemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['weapon', 'armor', 'helmet', 'boots', 'pants', 'shield', 'ring', 'amulet', 'potion', 'scroll', 'tool', 'food', 'junk', 'quest', 'jewelry'],
      required: true,
    },
    slot: {
      type: String,
      enum: ['weapon', 'shield', 'helmet', 'armor', 'boots', 'pants', 'ring', 'amulet', 'none'],
      default: 'none',
    },
    rarity: {
      type: String,
      enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
      default: 'common',
    },
    description: { type: String, default: '' },
    damage: {
      die: { type: String, default: '' },
      bonus: { type: Number, default: 0 },
    },
    range: { type: Number, default: 1 },
    weight: { type: Number, default: 1 },
    stats: { type: mongoose.Schema.Types.Mixed, default: {} },
    stackable: { type: Boolean, default: false },
    maxStack: { type: Number, default: 1 },
    usable: { type: Boolean, default: false },
    effect: { type: mongoose.Schema.Types.Mixed, default: {} },
    price: { type: Number, default: 0 },
    sellPrice: { type: Number, default: 0 },
    shopLocation: { type: String, default: '' },
    img: { type: String, default: '' },
    // Craft fields
    isCraftable: { type: Boolean, default: false },
    craftLimit: { type: Number, default: 0 },     // 0 = безлимитный, >0 = макс. кол-во крафтов
    craftCount: { type: Number, default: 0 },      // сколько уже скрафчено (глобально)
    craftIngredients: [{
      itemId: { type: String, default: '' },
      name: { type: String, default: '' },
      quantity: { type: Number, default: 1 },
    }],
    craftLocation: { type: String, default: '' },
    characteristics: { type: String, default: '' },
    advantages: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GameItem', gameItemSchema);
