const mongoose = require('mongoose');

const aiNarrationSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameSession', required: true, index: true },
  text: { type: String, required: true },
  eventType: { type: String },
  context: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AiNarration', aiNarrationSchema);
