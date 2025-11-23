const mongoose = require('mongoose');

const trustedCodeSchema = new mongoose.Schema({
  code: { type: String, required: true },
  barbershop: { type: mongoose.Schema.Types.ObjectId, ref: 'Barbershop', required: true },
  isActive: { type: Boolean, default: true }
});

trustedCodeSchema.index({ code: 1, barbershop: 1 }, { unique: true });

module.exports = mongoose.model('TrustedCode', trustedCodeSchema);
