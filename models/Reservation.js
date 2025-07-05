const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: function() { return !this.blocked; } },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: function() { return !this.blocked; } },
  personnel: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  endTime: { type: Date, required: true }, // End time of reservation
  blocked: { type: Boolean, default: false },
});

reservationSchema.pre('save', async function (next) {
  if (!this.endTime) {
    // Only calculate endTime if service exists (for non-blocked reservations)
    if (!this.blocked && this.service) {
      const service = await Service.findById(this.service);
      const duration = service?.duration || 30; // Default to 30 minutes if not found
      this.endTime = new Date(this.date.getTime() + duration * 60000);
    } else {
      // For blocked slots, set a default 30-minute duration
      this.endTime = new Date(this.date.getTime() + 30 * 60000);
    }
  }
  next();
});

module.exports = mongoose.model('Reservation', reservationSchema);