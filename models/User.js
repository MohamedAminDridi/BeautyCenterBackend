const mongoose = require('mongoose');

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
  barbershop: { type: mongoose.Schema.Types.ObjectId, ref: 'Barbershop' }, // For personnel
}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);