// models/Favorite.js
const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['shop', 'service', 'personnel'],
    required: true,
  },
  item: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'type', // Dynamic ref based on type
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Dynamic refPath setup (optional but clean)
favoriteSchema.path('item').ref(function () {
  return this.type === 'shop' ? 'Barbershop' :
         this.type === 'service' ? 'Service' :
         this.type === 'personnel' ? 'Personnel' : null;
});

module.exports = mongoose.model('Favorite', favoriteSchema);