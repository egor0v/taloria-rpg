const mongoose = require('mongoose');

const craftRecipeSchema = new mongoose.Schema({
  recipeId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  location: { type: String, default: '' },
  locationId: { type: String, default: '' },
  ingredients: [{
    name: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    itemId: { type: String, default: '' },
    hint: { type: String, default: '' },
  }],
  result: {
    itemId: { type: String, default: '' },
    name: { type: String, default: '' },
    type: { type: String, default: 'tool' },
    slot: { type: String, default: 'none' },
    rarity: { type: String, default: 'legendary' },
    description: { type: String, default: '' },
    characteristics: { type: String, default: '' },
    advantages: { type: String, default: '' },
    damage: { type: mongoose.Schema.Types.Mixed },
    stats: { type: mongoose.Schema.Types.Mixed },
    effect: { type: mongoose.Schema.Types.Mixed },
    img: { type: String, default: '' },
  },
  level: { type: Number, default: 1 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('CraftRecipe', craftRecipeSchema);
