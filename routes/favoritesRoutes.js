// routes/favorites.js
const express = require('express');
const router = express.Router();
const Favorite = require('../models/Favorite');
const authMiddleware = require('../middleware/authMiddleware');

// ✅ Add to favorites (shop, service, or personnel)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { type, itemId } = req.body; // type: 'shop' | 'service' | 'personnel'
    const client = req.user.id; // assuming your authMiddleware sets req.user.id

    if (!['shop', 'service', 'personnel'].includes(type)) {
      return res.status(400).json({ message: 'Invalid favorite type' });
    }

    if (!itemId) {
      return res.status(400).json({ message: 'Item ID is required' });
    }

    console.log(`Adding favorite - Client: ${client}, Type: ${type}, Item: ${itemId}`);

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

    // Populate the item for response
    const populated = await Favorite.findById(favorite._id).populate('item');

    res.status(201).json(populated);
  } catch (err) {
    console.error('Error adding favorite:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Get all favorites for the logged-in client (grouped by type)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const client = req.user.id;

    const favorites = await Favorite.find({ client })
      .populate({
        path: 'item',
        select: 'name logoUrl imageUrl firstName lastName role location address', // adjust fields as needed
      })
      .sort({ createdAt: -1 });

    // Group them for easier frontend use
    const grouped = {
      shops: favorites.filter(f => f.type === 'shop'),
      services: favorites.filter(f => f.type === 'service'),
      personnel: favorites.filter(f => f.type === 'personnel'),
    };

    res.json(grouped);
  } catch (err) {
    console.error('Error fetching favorites:', err);
    res.status(500).json({ message: 'Server error' });
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
    console.error('Error removing favorite:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;