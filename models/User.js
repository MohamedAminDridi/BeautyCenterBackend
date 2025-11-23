const mongoose = require('mongoose');

// Define a sub-schema for daily hours for personnel (template)
const personnelDailyAvailabilitySchema = new mongoose.Schema({
  dayOfWeek: {
    type: String,
    required: true,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  },
  isAvailable: { type: Boolean, default: true },
  startTime: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/ },
  endTime: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/ },
  breakStart: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/ },
  breakEnd: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/ },
});

// NEW: Define a schema for single-date overrides
const scheduleOverrideSchema = new mongoose.Schema({
    date: { type: String, required: true }, // Stored as "YYYY-MM-DD"
    isAvailable: { type: Boolean, required: true },
    startTime: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):[0-5]?[0-9]$/ },
    endTime: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):[0-5]?[0-9]$/ },
    breakStart: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):[0-5]?[0-9]$/ },
    breakEnd: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):[0-5]?[0-9]$/ },
}, {_id: false}); // No need for a separate _id on subdocuments here


const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'owner', 'personnel', 'client'], default: 'client' },
  profileImageUrl: { type: String },
  isActive: { type: Boolean, default: true },
fcmToken: { type: String, default: null },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  barbershop: { type: mongoose.Schema.Types.ObjectId, ref: 'Barbershop' },
  trustedBarbershops: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Barbershop' }],

  setupComplete: { type: Boolean, default: false },
  personnelAvailability: {
    type: [personnelDailyAvailabilitySchema],
    default: [
      { dayOfWeek: 'Monday', isAvailable: false },
      { dayOfWeek: 'Tuesday', isAvailable: false },
      { dayOfWeek: 'Wednesday', isAvailable: false },
      { dayOfWeek: 'Thursday', isAvailable: false },
      { dayOfWeek: 'Friday', isAvailable: false },
      { dayOfWeek: 'Saturday', isAvailable: false },
      { dayOfWeek: 'Sunday', isAvailable: false },
    ],
    validate: {
      validator: function(v) {
        return this.role !== 'personnel' || (Array.isArray(v) && v.length === 7);
      },
      message: 'Personnel availability must contain 7 days.'
    }
  },

  // NEW: Field to store one-off schedule changes
  scheduleOverrides: {
      type: [scheduleOverrideSchema],
      default: []
  },

}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);