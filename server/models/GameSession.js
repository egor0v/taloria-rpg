const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    heroId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hero' },
    displayName: { type: String },
    connected: { type: Boolean, default: false },
    ready: { type: Boolean, default: false },
    role: { type: String, enum: ['host', 'player'], default: 'player' },
  },
  { _id: false }
);

const gameSessionSchema = new mongoose.Schema(
  {
    scenarioId: { type: String },
    mapId: { type: String },
    inviteCode: { type: String, unique: true, required: true },
    hostUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    players: [playerSchema],

    status: {
      type: String,
      enum: ['lobby', 'playing', 'paused', 'completed', 'abandoned'],
      default: 'lobby',
    },

    gameState: { type: mongoose.Schema.Types.Mixed, default: {} },
    maxPlayers: { type: Number, default: 4 },
  },
  {
    timestamps: true,
  }
);

// inviteCode already has unique:true index
gameSessionSchema.index({ hostUserId: 1 });
gameSessionSchema.index({ status: 1 });

module.exports = mongoose.model('GameSession', gameSessionSchema);
