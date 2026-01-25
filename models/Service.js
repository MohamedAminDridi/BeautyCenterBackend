const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  price: {
    type: Number,
    required: true,
  },
  imageUrl: {
    type: String,
  },
  duration: {
    type: Number, // Duration in minutes
    required: true,
  },
  loyaltyPoints: {
    type: Number,
    default: 0,
    min: 0,
  },
  personnel: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  barbershop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Barbershop',
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);