const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  marque: { type: String, required: true }, // Brand
  category: { type: String, required: true },
  quantity: { type: Number, required: true }, // Quantity available
  unit: { type: String, required: true }, // e.g., kg, units
  price: { type: Number, required: true },
  supplier: { type: String, required: true },
  alertThreshold: { type: Number, required: true }, // Low stock alert level
  description: { type: String, required: true },
  imageUrl: { type: String, required: false },
  available: { type: Boolean, default: false }, // Stock availability
  personnel: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Assigned personnel (optional)
});

module.exports = mongoose.model('Product', ProductSchema);