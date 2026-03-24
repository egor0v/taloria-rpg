const mongoose = require('mongoose');

const catalogItemSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    section: {
      type: String,
      enum: ['subscriptions', 'maps', 'addons', 'heroes', 'mint'],
      required: true,
    },
    productType: {
      type: String,
      enum: ['one_time', 'subscription', 'wallet_topup', 'account_upgrade'],
      required: true,
    },

    title: { type: String, required: true },
    description: { type: String },
    longDescription: { type: String },
    priceKopecks: { type: Number, required: true },
    originalPriceKopecks: { type: Number },
    badge: { type: String },
    imageUrl: { type: String },

    // Subscription specifics
    subscriptionTier: { type: String },
    subscriptionPeriodMonths: { type: Number },

    // Wallet topup specifics
    walletGoldAmount: { type: Number },
    walletSilverAmount: { type: Number },

    // Account upgrade specifics
    heroSlotsGrant: { type: Number },
    entitlementKey: { type: String },

    limitPerUser: { type: Number },
    sortOrder: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('CatalogItem', catalogItemSchema);
