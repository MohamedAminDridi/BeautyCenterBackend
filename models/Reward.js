const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
  title: String,
  description: String,
  requiredPoints: Number,
}, { timestamps: true });

module.exports = mongoose.model('Reward', rewardSchema);
