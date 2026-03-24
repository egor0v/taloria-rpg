const mongoose = require('mongoose');

const pageViewSchema = new mongoose.Schema({
  visitorId: { type: String, required: true },
  path: { type: String, required: true },
  referrer: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  utmSource: { type: String, default: '' },
  utmMedium: { type: String, default: '' },
  utmCampaign: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, expires: 15552000 }, // 180 days TTL
});

pageViewSchema.index({ createdAt: 1, visitorId: 1 });

module.exports = mongoose.model('PageView', pageViewSchema);
