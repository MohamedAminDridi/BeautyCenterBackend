const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  personnel: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  endTime: { type: Date, required: true }, // 🟢 NEW: end time of reservation
});

reservationSchema.pre('save', async function (next) {
  if (!this.endTime) {
    const service = await Service.findById(this.service);
    const duration = service?.duration || 30; // Default to 30 minutes if not found
    this.endTime = new Date(this.date.getTime() + duration * 60000);
  }
  next();
});

module.exports = mongoose.model('Reservation', reservationSchema);