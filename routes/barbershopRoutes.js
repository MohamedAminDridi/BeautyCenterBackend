const express = require('express');
const router = express.Router();
const Barbershop = require('../models/barbershop');
const authMiddleware = require('../middleware/authMiddleware');

// Get unique barbershop categories
router.get('/categories', authMiddleware, async (req, res) => {
  try {
    const categories = await Barbershop.distinct('category');
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// Get barbershops by category
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const query = category ? { category, status: 'approved' } : { status: 'approved' };
    const barbershops = await Barbershop.find(query)
      .select('_id name description location logoUrl');
    res.json(barbershops);
  } catch (error) {
    console.error('Error fetching barbershops:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// Get public barbershops for map
router.get('/public', async (req, res) => {
  try {
    const barbershops = await Barbershop.find({ status: 'approved' })
      .select('_id name description location.coordinates logoUrl')
      .lean();
    console.log('Returning public barbershops:', barbershops.map(shop => ({
      _id: shop._id,
      name: shop.name,
      logoUrl: shop.logoUrl,
      coordinates: shop.location?.coordinates,
    }))); // Debug
    res.json(barbershops);
  } catch (error) {
    console.error('Error fetching public barbershops:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

module.exports = router;