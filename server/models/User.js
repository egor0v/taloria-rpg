const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    telegramId: {
      type: String,
      unique: true,
      sparse: true,
    },
    passwordHash: { type: String },
    displayName: { type: String, trim: true },
    avatarUrl: { type: String },

    walletGold: { type: Number, default: 0 },
    walletSilver: { type: Number, default: 0 },
    heroSlots: { type: Number, default: 2 },

    activeSubscriptionTier: {
      type: String,
      enum: ['none', 'stranger', 'seeker', 'legend'],
      default: 'none',
    },
    subscriptionExpiresAt: { type: Date },

    isAdmin: { type: Boolean, default: false },

    entitlements: [{ type: String }],

    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Indexes already defined via unique:true in schema

module.exports = mongoose.model('User', userSchema);
