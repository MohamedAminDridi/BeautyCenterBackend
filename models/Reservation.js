const mongoose = require('mongoose');
const reservationSchema = new mongoose.Schema({
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  personnel: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  endTime: { type: Date, required: true }, // 🟢 NEW: end time of reservation

});
module.exports = mongoose.model('Reservation', reservationSchema);
