// routes/favoritesRoutes.js
const express = require('express');
const router = express.Router();
const Favorite = require('../models/Favorite');
const  authMiddleware  = require('../middleware/authMiddleware');

// ✅ Add to favorites
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { service } = req.body;
    const client = req.user._id;

    const existing = await Favorite.findOne({ client, service });
    if (existing) return res.status(400).json({ message: 'Already in favorites' });

    const favorite = new Favorite({ client, service });
    await favorite.save();
    res.status(201).json(favorite);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Get all favorites for the logged-in client
router.get('/', authMiddleware, async (req, res) => {
  try {
    const favorites = await Favorite.find({ client: req.user._id }).populate('service');
    res.json(favorites);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Remove from favorites
router.delete('/:serviceId', authMiddleware, async (req, res) => {
  try {
    const { serviceId } = req.params;
    const deleted = await Favorite.findOneAndDelete({
      client: req.user._id,
      service: serviceId,
    });

    if (!deleted) return res.status(404).json({ message: 'Favorite not found' });

    res.json({ message: 'Removed from favorites' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
