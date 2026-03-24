/**
 * Fix hero inventory/equipment/stash images
 * Подтягивает img из GameItem для всех предметов у всех героев
 *
 * Запуск: node scripts/fixHeroImages.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config');
const GameItem = require('../models/GameItem');

(async () => {
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB');

  // Build img lookup: itemId/name → img
  const items = await GameItem.find({ active: true }).select('itemId name img').lean();
  const lookup = {};
  items.forEach(i => {
    if (i.img) {
      lookup[i.itemId] = i.img;
      lookup[i.name] = i.img;
    }
  });
  console.log('Image lookup:', Object.keys(lookup).length, 'entries');

  const db = mongoose.connection.db;
  const heroCol = db.collection('heroes');
  const heroes = await heroCol.find({}).toArray();
  console.log('Heroes to check:', heroes.length);

  let heroesFixed = 0;
  let itemsFixed = 0;

  for (const hero of heroes) {
    let changed = false;

    // Fix inventory items
    for (const item of (hero.inventory || [])) {
      if (item && !item.img) {
        const img = lookup[item.itemId] || lookup[item.name];
        if (img) { item.img = img; changed = true; itemsFixed++; }
      }
    }

    // Fix equipment slots
    for (const [slot, item] of Object.entries(hero.equipment || {})) {
      if (item && item.name && !item.img) {
        const img = lookup[item.itemId] || lookup[item.name];
        if (img) { item.img = img; changed = true; itemsFixed++; }
      }
    }

    // Fix stash items
    for (const item of (hero.stash || [])) {
      if (item && !item.img) {
        const img = lookup[item.itemId] || lookup[item.name];
        if (img) { item.img = img; changed = true; itemsFixed++; }
      }
    }

    if (changed) {
      await heroCol.updateOne(
        { _id: hero._id },
        { $set: { inventory: hero.inventory, equipment: hero.equipment, stash: hero.stash } }
      );
      heroesFixed++;
    }
  }

  console.log('\n✅ Done!');
  console.log('Heroes updated:', heroesFixed, '/', heroes.length);
  console.log('Items fixed:', itemsFixed);

  await mongoose.disconnect();
})();
