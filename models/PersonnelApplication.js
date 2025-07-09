const mongoose = require('mongoose');

const PersonnelApplicationSchema = new mongoose.Schema({
  personnel: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  barbershop: { type: mongoose.Schema.Types.ObjectId, ref: 'Barbershop', required: true },
  bio: { type: String },
  servicesOffered: [{ type: String }],
  photoUrl: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PersonnelApplication', PersonnelApplicationSchema);