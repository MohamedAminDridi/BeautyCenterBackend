const mongoose = require('mongoose');

// Define a sub-schema for daily hours to make it reusable and structured
const dailyHoursSchema = new mongoose.Schema({
  dayOfWeek: {
    type: String,
    required: true,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  },
  isOpen: { type: Boolean, default: true }, // To indicate if the shop is open on this day
  openTime: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):(?:[0-5]?[0-9])$/ }, // HH:MM format
  closeTime: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):(?:[0-5]?[0-9])$/ }, // HH:MM format
  breakStart: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):(?:[0-5]?[0-9])$/ }, // HH:MM format (optional)
  breakEnd: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):(?:[0-5]?[0-9])$/ },   // HH:MM format (optional)
});

const barbershopSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  category: {
    type: String,
    enum: ['barbershop', 'lavage', 'vidange', 'Terrain'],
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
  documents: [{ type: String }], // Array of document URLs
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },

  // New fields for scheduling
  operatingHours: {
    type: [dailyHoursSchema], // Array of daily operating hours
    default: [ // Default to typical barbershop hours, owner can modify
      { dayOfWeek: 'Monday', isOpen: true, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00' },
      { dayOfWeek: 'Tuesday', isOpen: true, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00' },
      { dayOfWeek: 'Wednesday', isOpen: true, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00' },
      { dayOfWeek: 'Thursday', isOpen: true, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00' },
      { dayOfWeek: 'Friday', isOpen: true, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00' },
      { dayOfWeek: 'Saturday', isOpen: true, openTime: '10:00', closeTime: '19:00' }, // No break by default
      { dayOfWeek: 'Sunday', isOpen: false }, // Closed by default
    ]
  },
  slotDuration: { type: Number, default: 30 }, // Duration of a single booking slot in minutes (e.g., 30, 60)
  bufferTime: { type: Number, default: 0 }, // Optional: buffer time between appointments in minutes
});

module.exports = mongoose.model('Barbershop', barbershopSchema);