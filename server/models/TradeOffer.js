const mongoose = require('mongoose');

const tradeItemSchema = new mongoose.Schema({
  itemIndex: { type: Number, required: true },
  itemId: { type: String },
  name: { type: String },
  rarity: { type: String },
  quantity: { type: Number, default: 1 },
}, { _id: false });

const tradeOfferSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fromHeroId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hero', required: true },
  toHeroId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hero' },
  locationId: { type: String, required: true },
  offerItems: [tradeItemSchema],
  requestItems: [tradeItemSchema],
  goldOffer: { type: Number, default: 0 },
  silverOffer: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled', 'completed'],
    default: 'pending',
  },
  fromConfirmed: { type: Boolean, default: false },
  toConfirmed: { type: Boolean, default: false },
}, { timestamps: true });

tradeOfferSchema.index({ fromUserId: 1, status: 1 });
tradeOfferSchema.index({ toUserId: 1, status: 1 });

module.exports = mongoose.model('TradeOffer', tradeOfferSchema);
