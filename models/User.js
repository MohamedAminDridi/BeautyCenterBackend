const mongoose = require('mongoose');

// Define a sub-schema for daily hours for personnel (similar to barbershop but tied to user)
const personnelDailyAvailabilitySchema = new mongoose.Schema({
  dayOfWeek: {
    type: String,
    required: true,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  },
  isAvailable: { type: Boolean, default: true }, // To indicate if personnel is available on this day
  startTime: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):(?:[0-5]?[0-9])$/ }, // HH:MM format
  endTime: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):(?:[0-5]?[0-9])$/ },   // HH:MM format
  breakStart: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):(?:[0-5]?[0-9])$/ }, // HH:MM format (optional)
  breakEnd: { type: String, match: /^(?:2[0-3]|[01]?[0-9]):(?:[0-5]?[0-9])$/ },   // HH:MM format (optional)
});

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'owner', 'personnel', 'client'], default: 'client' },
  profileImageUrl: { type: String },
  isActive: { type: Boolean, default: true },
  pushToken: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' }, // Default to approved for clients
  barbershop: { type: mongoose.Schema.Types.ObjectId, ref: 'Barbershop' }, // For personnel and owner

  // NEW FIELD: Flag to track if initial setup (hours/availability) is complete
  setupComplete: { type: Boolean, default: false },

  // NEW FIELD: Personnel's individual availability (only relevant for 'personnel' role)
  // This defines WHEN they are *personally* available within the barbershop's operating hours
  personnelAvailability: {
    type: [personnelDailyAvailabilitySchema],
    default: [
      { dayOfWeek: 'Monday', isAvailable: false }, // Default to unavailable, personnel sets their schedule
      { dayOfWeek: 'Tuesday', isAvailable: false },
      { dayOfWeek: 'Wednesday', isAvailable: false },
      { dayOfWeek: 'Thursday', isAvailable: false },
      { dayOfWeek: 'Friday', isAvailable: false },
      { dayOfWeek: 'Saturday', isAvailable: false },
      { dayOfWeek: 'Sunday', isAvailable: false },
    ],
    // Only apply this field if the role is 'personnel'
    validate: {
      validator: function(v) {
        return this.role !== 'personnel' || (Array.isArray(v) && v.length === 7);
      },
      message: 'Personnel availability must contain 7 days.'
    }
  },
}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);