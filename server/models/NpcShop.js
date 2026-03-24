const mongoose = require('mongoose');

const soldItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  name: { type: String },
  rarity: { type: String, default: 'common' },
  qty: { type: Number, default: 1 },
  price: { type: Number, default: 0 },
  soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  soldAt: { type: Date, default: Date.now },
}, { _id: false });

const npcShopSchema = new mongoose.Schema({
  locationId: { type: String, required: true, unique: true },
  npcName: { type: String, required: true },
  npcType: { type: String, required: true },
  npcImg: { type: String, default: '' },
  goldBalance: { type: Number, default: 10 },
  silverBalance: { type: Number, default: 1000 },
  baseItems: [{ type: String }], // itemId references
  soldToNpcItems: [soldItemSchema],
  thematicTypes: [{ type: String }], // item types with +20% sell bonus
  greeting: { type: String, default: 'Добро пожаловать!' },
}, { timestamps: true });

module.exports = mongoose.model('NpcShop', npcShopSchema);
