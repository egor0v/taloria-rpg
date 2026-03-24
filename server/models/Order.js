const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    catalogItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogItem' },

    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },

    amountKopecks: { type: Number, required: true },
    tbankPaymentId: { type: String },
    tbankOrderId: { type: String, unique: true, sparse: true },

    productSnapshot: { type: mongoose.Schema.Types.Mixed },

    paidAt: { type: Date },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// tbankOrderId already has unique:true index

module.exports = mongoose.model('Order', orderSchema);
