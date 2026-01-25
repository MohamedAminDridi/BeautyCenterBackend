const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

// ────────────────────────────────────────────────
// POST /services - Create new service
// ────────────────────────────────────────────────
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    console.log('POST /services - Request body:', req.body);
    console.log('POST /services - File:', req.file ? 'present' : 'missing');

    const {
      name,
      category,
      description,
      price,
      duration,
      loyaltyPoints,
      personnel,
      barbershop,
    } = req.body;

    // Required fields validation
    if (!name) return res.status(400).json({ error: 'Service name is required' });
    if (!category) return res.status(400).json({ error: 'Service category is required' });
    if (!price) return res.status(400).json({ error: 'Service price is required' });
    if (!duration) return res.status(400).json({ error: 'Service duration is required' });
    if (!barbershop) return res.status(400).json({ error: 'Barbershop ID is required' });

    // loyaltyPoints is now REQUIRED and validated
    if (loyaltyPoints === undefined || loyaltyPoints === '' || loyaltyPoints === null) {
      return res.status(400).json({ error: 'Loyalty points are required' });
    }

    const parsedLoyalty = parseInt(loyaltyPoints, 10);
    if (isNaN(parsedLoyalty) || parsedLoyalty < 0) {
      return res.status(400).json({ error: 'Loyalty points must be a valid non-negative number' });
    }

    // Parse personnel array safely
    let personnelArray = [];
    if (personnel && personnel.trim()) {
      try {
        personnelArray = JSON.parse(personnel);
        if (!Array.isArray(personnelArray)) {
          return res.status(400).json({ error: 'Personnel must be an array of IDs' });
        }
      } catch (err) {
        return res.status(400).json({ error: 'Invalid personnel format - expected JSON array' });
      }
    }

    // Validate personnel IDs (only approved personnel from same barbershop)
    if (personnelArray.length > 0) {
      const validPersonnel = await User.find({
        _id: { $in: personnelArray },
        barbershop,
        role: 'personnel',
        status: 'approved',
      }).select('_id');

      const validIds = validPersonnel.map(p => p._id.toString());
      const invalidIds = personnelArray.filter(id => !validIds.includes(id));

      if (invalidIds.length > 0) {
        return res.status(400).json({
          error: `Invalid or unauthorized personnel IDs: ${invalidIds.join(', ')}`,
        });
      }
    }

    // Handle image upload
    let imageUrl = '';
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { resource_type: 'image' },
          (error, result) => (error ? reject(error) : resolve(result))
        ).end(req.file.buffer);
      });
      imageUrl = result.secure_url;
    }

    // Create service with loyaltyPoints included
    const newService = new Service({
      name,
      category,
      description,
      price: parseFloat(price),
      duration: parseInt(duration),
      loyaltyPoints: parsedLoyalty,           // ← FIXED: now always saved
      personnel: personnelArray,
      imageUrl,
      barbershop,
    });

    const saved = await newService.save();

    console.log('🛒 Service created successfully:', {
      _id: saved._id,
      name: saved.name,
      loyaltyPoints: saved.loyaltyPoints,
      barbershop: saved.barbershop,
    });

    res.status(201).json(saved);
  } catch (err) {
    console.error('❌ Failed to create service:', err.stack || err.message);
    res.status(500).json({ error: 'Failed to create service', detail: err.message });
  }
});

// ────────────────────────────────────────────────
// PUT /services/:id - Update service
// ────────────────────────────────────────────────
router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    console.log('PUT /services/:id - Body:', req.body);
    console.log('PUT /services/:id - File:', req.file ? 'present' : 'missing');

    const {
      name,
      category,
      description,
      price,
      duration,
      loyaltyPoints,
      personnel,
      imageUrl,
      barbershop,
    } = req.body;

    if (!barbershop) {
      return res.status(400).json({ error: 'Barbershop ID is required' });
    }

    // loyaltyPoints validation (optional on edit – keeps old value if missing)
    let parsedLoyalty;
    if (loyaltyPoints !== undefined && loyaltyPoints !== '') {
      parsedLoyalty = parseInt(loyaltyPoints, 10);
      if (isNaN(parsedLoyalty) || parsedLoyalty < 0) {
        return res.status(400).json({ error: 'Loyalty points must be a valid non-negative number' });
      }
    }

    // Parse personnel
    let personnelArray = [];
    if (personnel && personnel.trim()) {
      try {
        personnelArray = JSON.parse(personnel);
        if (!Array.isArray(personnelArray)) {
          return res.status(400).json({ error: 'Personnel must be an array of IDs' });
        }
      } catch (err) {
        return res.status(400).json({ error: 'Invalid personnel format' });
      }
    }

    // Validate personnel IDs
    if (personnelArray.length > 0) {
      const validPersonnel = await User.find({
        _id: { $in: personnelArray },
        barbershop,
        role: 'personnel',
        status: 'approved',
      }).select('_id');

      const validIds = validPersonnel.map(p => p._id.toString());
      const invalidIds = personnelArray.filter(id => !validIds.includes(id));

      if (invalidIds.length > 0) {
        return res.status(400).json({ error: `Invalid personnel IDs: ${invalidIds.join(', ')}` });
      }
    }

    // Build update object
    const update = {
      name,
      category,
      description,
      price: parseFloat(price),
      duration: parseInt(duration),
      personnel: personnelArray,
      barbershop,
    };

    // Only update loyaltyPoints if provided and valid
    if (parsedLoyalty !== undefined) {
      update.loyaltyPoints = parsedLoyalty;
    }

    // Image handling
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { resource_type: 'image' },
          (error, result) => (error ? reject(error) : resolve(result))
        ).end(req.file.buffer);
      });
      update.imageUrl = result.secure_url;
    } else if (imageUrl) {
      update.imageUrl = imageUrl;
    }

    const updated = await Service.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).populate('barbershop', 'name');

    if (!updated) {
      return res.status(404).json({ error: 'Service not found' });
    }

    console.log('🛒 Service updated:', {
      _id: updated._id,
      name: updated.name,
      loyaltyPoints: updated.loyaltyPoints,
    });

    res.json(updated);
  } catch (err) {
    console.error('❌ Failed to update service:', err.stack || err.message);
    res.status(500).json({ error: 'Failed to update service', detail: err.message });
  }
});

// ────────────────────────────────────────────────
// Other routes (unchanged but improved logging)
// ────────────────────────────────────────────────

router.get('/', authMiddleware, async (req, res) => {
  try {
    const services = await Service.find()
      .populate('personnel', 'firstName lastName profileImageUrl', { role: 'personnel' })
      .populate('barbershop', 'name')
      .lean();

    console.log(`Fetched ${services.length} services`);
    res.json(services);
  } catch (err) {
    console.error('GET /services error:', err);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('personnel', 'firstName lastName', { role: 'personnel' })
      .populate('barbershop', 'name')
      .lean();

    if (!service) return res.status(404).json({ error: 'Service not found' });

    res.json(service);
  } catch (err) {
    console.error('GET /services/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await Service.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Service not found' });

    console.log('🛒 Service deleted:', req.params.id);
    res.json({ message: 'Service deleted' });
  } catch (err) {
    console.error('DELETE /services/:id error:', err);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

router.get('/barbershops/:id/services', authMiddleware, async (req, res) => {
  try {
    const services = await Service.find({ barbershop: req.params.id })
      .select('_id name description price duration loyaltyPoints imageUrl personnel')
      .populate('personnel', 'firstName lastName', { role: 'personnel' })
      .lean();

    res.json(services);
  } catch (err) {
    console.error('GET /barbershops/:id/services error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/barbershops/:barbershopId/personnel', authMiddleware, async (req, res) => {
  try {
    const personnel = await User.find({
      barbershop: req.params.barbershopId,
      role: 'personnel',
      status: 'approved',
    }).select('_id firstName lastName profileImageUrl');

    res.json(personnel);
  } catch (err) {
    console.error('GET personnel error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;