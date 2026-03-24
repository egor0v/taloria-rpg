const mongoose = require('mongoose');

const gameMapSchema = new mongoose.Schema(
  {
    mapId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    maxPlayers: { type: Number, default: 4 },

    mapData: { type: [[mongoose.Schema.Types.Mixed]], default: [] },
    roadMap: { type: [[mongoose.Schema.Types.Mixed]], default: [] },

    bgImage: { type: String },
    active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('GameMap', gameMapSchema);
