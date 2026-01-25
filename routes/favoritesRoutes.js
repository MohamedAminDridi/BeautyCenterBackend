// routes/favorites.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Favorite = require('../models/Favorite');
const authMiddleware = require('../middleware/authMiddleware');

// Make sure these models are imported (or ensure they are loaded earlier in your app)
const Barbershop = mongoose.model('Barbershop');
const Service = mongoose.model('Service');
const User = mongoose.model('User'); // or Personnel if you have a separate model

// ✅ Add to favorites (shop / service / personnel)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { type, itemId } = req.body;
    const client = req.user.id;

    if (!['shop', 'service', 'personnel'].includes(type)) {
      return res.status(400).json({ message: 'Invalid favorite type' });
    }

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: 'Invalid item ID' });
    }

    // Check if already favorited
    const existing = await Favorite.findOne({ client, type, item: itemId });
    if (existing) {
      return res.status(400).json({ message: 'Already in favorites' });
    }

    const favorite = new Favorite({
      client,
      type,
      item: itemId,
    });

    await favorite.save();

    // Manually populate the item
    let populatedItem = null;
    try {
      if (type === 'shop') {
        populatedItem = await Barbershop.findById(itemId).select('name logoUrl location address');
      } else if (type === 'service') {
        populatedItem = await Service.findById(itemId).select('name imageUrl duration price');
      } else if (type === 'personnel') {
        populatedItem = await User.findById(itemId).select('firstName lastName profileImageUrl role specialty');
      }
    } catch (populateErr) {
      console.warn(`Populate failed for ${type} ${itemId}:`, populateErr.message);
    }

    res.status(201).json({
      ...favorite.toObject(),
      item: populatedItem || { _id: itemId, name: 'Item (details unavailable)' },
    });
  } catch (err) {
    console.error('POST /favorites error:', err.stack || err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Get all favorites (grouped by type) – fixed population
router.get('/', authMiddleware, async (req, res) => {
  try {
    const client = req.user.id;

    // Get raw favorites
    const rawFavorites = await Favorite.find({ client }).sort({ createdAt: -1 });

    // Manually populate each favorite
    const populated = await Promise.all(
      rawFavorites.map(async (fav) => {
        let populatedItem = null;

        try {
          if (fav.type === 'shop') {
            populatedItem = await Barbershop.findById(fav.item).select(
              'name logoUrl location address'
            );
          } else if (fav.type === 'service') {
            populatedItem = await Service.findById(fav.item).select(
              'name imageUrl duration price'
            );
          } else if (fav.type === 'personnel') {
            populatedItem = await User.findById(fav.item).select(
              'firstName lastName profileImageUrl role specialty'
            );
          }
        } catch (populateErr) {
          console.warn(`Populate failed for ${fav.type} ${fav.item}:`, populateErr.message);
        }

        return {
          ...fav.toObject(),
          item: populatedItem || { _id: fav.item, name: 'Item (details unavailable)' },
        };
      })
    );

    // Group for frontend
    const grouped = {
      shops: populated.filter(f => f.type === 'shop'),
      services: populated.filter(f => f.type === 'service'),
      personnel: populated.filter(f => f.type === 'personnel'),
    };

    res.json(grouped);
  } catch (err) {
    console.error('GET /favorites error:', err.stack || err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Remove from favorites
router.delete('/:type/:itemId', authMiddleware, async (req, res) => {
  try {
    const { type, itemId } = req.params;
    const client = req.user.id;

    if (!['shop', 'service', 'personnel'].includes(type)) {
      return res.status(400).json({ message: 'Invalid type' });
    }

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: 'Invalid item ID' });
    }

    const deleted = await Favorite.findOneAndDelete({
      client,
      type,
      item: itemId,
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Favorite not found' });
    }

    res.json({ message: 'Removed from favorites', deleted });
  } catch (err) {
    console.error('DELETE /favorites error:', err.stack || err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;