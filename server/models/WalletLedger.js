const mongoose = require('mongoose');

const walletLedgerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['topup', 'purchase', 'reward', 'admin_grant', 'trade'],
      required: true,
    },
    goldAmount: { type: Number, default: 0 },
    silverAmount: { type: Number, default: 0 },
    reason: { type: String, default: '' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    balanceAfterGold: { type: Number, default: 0 },
    balanceAfterSilver: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WalletLedger', walletLedgerSchema);
