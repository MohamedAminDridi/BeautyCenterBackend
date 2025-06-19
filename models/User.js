const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: false },
  lastName:  { type: String, required: false },
  phone:     { type: String, required: true, unique: true },
  email:     { type: String },
  password:  { type: String, required: true },
  role:      { type: String, enum: ['admin', 'client', 'personnel'], default: 'client' },
  profileImageUrl: { type: String },
  isActive: { type: Boolean, default: true },
  pushToken: { type: String },

}, {
  timestamps: true // ✅ This should be outside the fields object
});

module.exports = mongoose.model('User', UserSchema);
