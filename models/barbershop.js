const mongoose = require('mongoose');

const barbershopSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  category: {
    type: String,
    enum: ['barbershop', 'lavage', 'vidange', 'home', 'delivery'],
    required: true
  },
  location: {
    address: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  logoUrl: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Barbershop', barbershopSchema);