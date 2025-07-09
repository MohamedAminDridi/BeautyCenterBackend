const express = require('express');
const router = express.Router();
const Barbershop = require('../models/barbershop');
const Service = require('../models/service');
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
      .select('_id name description location.coordinates location.address logoUrl category services status')
      .lean();
    console.log('Returning public barbershops:', barbershops.map(shop => ({
      _id: shop._id,
      name: shop.name,
      logoUrl: shop.logoUrl,
      coordinates: shop.location?.coordinates,
      services: shop.services,
      status: shop.status
    })));
    res.json(barbershops);
  } catch (error) {
    console.error('Error fetching public barbershops:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// Get barbershop details by ID
router.get('/:id', async (req, res) => {
  try {
    const barbershop = await Barbershop.findById(req.params.id)
      .select('_id name description location category logoUrl services status')
      .lean();
    if (!barbershop) {
      return res.status(404).json({ message: 'Barbershop not found' });
    }
    res.json(barbershop);
  } catch (error) {
    console.error('Error fetching barbershop details:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// Get services by barbershop ID
router.get('/services/barbershop/:id', authMiddleware, async (req, res) => {
  try {
    const services = await Service.find({ barbershop: req.params.id })
      .select('_id name description price duration loyaltyPoints imageUrl')
      .lean();
    console.log(`Returning services for barbershop ${req.params.id}:`, services);
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

module.exports = router;