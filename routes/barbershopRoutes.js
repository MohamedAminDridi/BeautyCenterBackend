const express = require('express');
const router = express.Router();
const Barbershop = require('../models/barbershop');
const Service = require('../models/Service');
const Reservation = require('../models/Reservation');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

// Helper to validate and parse date
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date; // Return null if invalid
};

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

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

// Get personnel by barbershop ID
router.get('/:id/personnel', authMiddleware, async (req, res) => {
  try {
    const personnel = await User.find({
      barbershop: req.params.id,
      role: 'personnel',
      status: 'approved',
    }).select('_id firstName lastName profileImageUrl status barbershop');
    // console.log(`Returning personnel for barbershop ${req.params.id}:`, personnel);
    res.json(personnel);
  } catch (error) {
    console.error('Error fetching personnel:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// Get services by barbershop ID
router.get('/:id/services', authMiddleware, async (req, res) => {
  try {
    const services = await Service.find({ barbershop: req.params.id })
      .select('_id name description price duration loyaltyPoints imageUrl')
      .lean();
    // console.log(`Returning services for barbershop ${req.params.id}:`, services);
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// Get past reservations for a specific barbershop
router.get('/:id/reservations/past', authMiddleware, async (req, res) => {
  try {
    const now = new Date(); // Current time in server timezone (e.g., UTC)
    const cetOffset = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    const cetNow = new Date(now.getTime() + cetOffset); // Adjust to CET (05:51 PM CET)

    // Fetch all reservations and filter invalid dates client-side
    const reservations = await Reservation.find({ barbershop: req.params.id })
      .populate('service', 'name price')
      .populate('personnel', 'firstName lastName')
      .populate('client', 'firstName lastName');

    const pastReservations = reservations
      .map(res => ({ ...res._doc, date: parseDate(res.date) })) // Parse and validate date
      .filter(res => res.date && res.date < cetNow); // Filter out invalid or future dates

    // console.log(`📅 Past reservations fetched for barbershop ${req.params.id}:`, pastReservations);
    res.status(200).json(pastReservations);
  } catch (error) {
    console.error('❌ Error fetching past reservations:', error);
    res.status(500).json({ message: 'Failed to fetch past reservations.', detail: error.message });
  }
});

// Get upcoming reservations for a specific barbershop
router.get('/:id/reservations/upcoming', authMiddleware, async (req, res) => {
  try {
    const now = new Date(); // Current time in server timezone (e.g., UTC)
    const cetOffset = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    const cetNow = new Date(now.getTime() + cetOffset); // Adjust to CET (05:51 PM CET)

    // Fetch all reservations and filter invalid dates client-side
    const reservations = await Reservation.find({ barbershop: req.params.id })
      .populate('service', 'name price')
      .populate('personnel', 'firstName lastName')
      .populate('client', 'firstName lastName');

    const upcomingReservations = reservations
      .map(res => ({ ...res._doc, date: parseDate(res.date) })) // Parse and validate date
      .filter(res => res.date && res.date >= cetNow); // Filter out invalid or past dates

    // console.log(`📅 Upcoming reservations fetched for barbershop ${req.params.id}:`, upcomingReservations);
    res.status(200).json(upcomingReservations);
  } catch (error) {
    console.error('❌ Error fetching upcoming reservations:', error);
    res.status(500).json({ message: 'Failed to fetch upcoming reservations.', detail: error.message });
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

    const processedBarbershops = barbershops.map(shop => {
      let coordinates = shop.location?.coordinates;
      if (Array.isArray(coordinates) && coordinates.length === 2) {
        coordinates = { latitude: coordinates[1], longitude: coordinates[0] }; // Convert [lon, lat] to { latitude, longitude }
      } else if (coordinates && typeof coordinates === 'object' && coordinates.latitude && coordinates.longitude) {
        coordinates = { latitude: coordinates.latitude, longitude: coordinates.longitude };
      } else {
        coordinates = null;
      }

      return {
        ...shop,
        location: {
          ...shop.location,
          coordinates,
        },
      };
    }).filter(shop => shop.location.coordinates !== null);

    // console.log('Returning public barbershops:', processedBarbershops.map(shop => ({
    //   _id: shop._id,
    //   name: shop.name,
    //   logoUrl: shop.logoUrl,
    //   coordinates: shop.location?.coordinates,
    //   services: shop.services,
    //   status: shop.status,
    // })));
    res.json(processedBarbershops);
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

// Get services by barbershop ID (alternative route)
router.get('/services/barbershop/:id', async (req, res) => {
  try {
    const services = await Service.find({ barbershop: req.params.id })
      .select('_id name description price duration loyaltyPoints imageUrl')
      .lean();
    // console.log(`Returning services for barbershop ${req.params.id}:`, services);
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// Update a service by ID
router.put('/services/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, description, price, duration, loyaltyPoints, personnel } = req.body;
    const image = req.file; // Assuming multer or similar middleware for image handling

    const updatedService = await Service.findByIdAndUpdate(
      id,
      {
        name,
        category,
        description,
        price,
        duration,
        loyaltyPoints,
        personnel: personnel ? JSON.parse(personnel) : undefined,
        imageUrl: image ? `/uploads/${image.filename}` : undefined,barbershop
      },
      { new: true, runValidators: true }
    ).select('_id name description price duration loyaltyPoints imageUrl');

    if (!updatedService) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // console.log(`Service updated: ${id}`, updatedService);
    res.status(200).json(updatedService);
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// Update barbershop logo
router.put('/:id/logo', authMiddleware, upload.single('logo'), async (req, res) => {
  try {
    const { id } = req.params;
    const barbershop = await Barbershop.findById(id);
    if (!barbershop) {
      return res.status(404).json({ message: 'Barbershop not found' });
    }

    barbershop.logoUrl = req.file ? `/uploads/${req.file.filename}` : barbershop.logoUrl;
    await barbershop.save();

    res.status(200).json({ message: 'Logo updated', logoUrl: barbershop.logoUrl });
  } catch (error) {
    console.error('Error updating logo:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

module.exports = router;