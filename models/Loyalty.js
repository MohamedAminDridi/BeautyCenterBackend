const mongoose = require('mongoose');

const loyaltySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  points: { type: Number, default: 0 },
  history: [
    {
      description: String,
      points: Number,
      date: { type: Date, default: Date.now },
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Loyalty', loyaltySchema);
