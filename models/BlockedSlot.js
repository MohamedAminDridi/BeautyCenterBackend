const mongoose = require('mongoose');

const BlockedSlotSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  endTime: { type: Date, required: true },
  personnel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  isAdminBlock: { type: Boolean, default: false },
  isMonthly: { type: Boolean, default: false },
  barbershop: { type: mongoose.Schema.Types.ObjectId, ref: 'Barbershop', required: true }, // Added barbershop field
});

module.exports = mongoose.model('BlockedSlot', BlockedSlotSchema);