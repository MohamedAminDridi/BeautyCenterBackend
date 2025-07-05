const mongoose = require('mongoose');

const blockedSlotSchema = new mongoose.Schema({
  date: { type: Date, required: true }, // Start date and time of the blocked slot
  endTime: { type: Date, required: true }, // End date and time of the blocked slot
  personnel: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Admin or personnel blocking the slot
  isMonthly: { type: Boolean, default: false }, // Flag for monthly blocking
}, {
  timestamps: true, // Adds createdAt and updatedAt fields
});

module.exports = mongoose.model('BlockedSlot', blockedSlotSchema);