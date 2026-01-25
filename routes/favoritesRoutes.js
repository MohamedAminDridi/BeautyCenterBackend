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
// routes/favorites.js (GET route only – replace the existing one)

router.get('/', authMiddleware, async (req, res) => {
  try {
    const client = req.user.id;

    // First get raw favorites without populate
    const rawFavorites = await Favorite.find({ client }).sort({ createdAt: -1 });

    // Manually populate each one
    const populated = await Promise.all(
      rawFavorites.map(async (fav) => {
        let Model;
        if (fav.type === 'shop') Model = mongoose.model('Barbershop');
        else if (fav.type === 'service') Model = mongoose.model('Service');
        else if (fav.type === 'personnel') Model = mongoose.model('User'); // or Personnel if you have separate model

        if (!Model) return fav.toObject(); // fallback

        const item = await Model.findById(fav.item).select(
          'name logoUrl imageUrl firstName lastName role location address specialty'
        );

        return {
          ...fav.toObject(),
          item,
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
    console.error('GET /favorites error:', err);
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