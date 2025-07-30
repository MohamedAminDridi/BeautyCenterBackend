const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const User = require('../models/User'); // Use User model instead of Personnel
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);

    const { name, category, description, price, duration, loyaltyPoints, personnel, barbershop } = req.body;

    // Validation
    if (!name) return res.status(400).json({ error: 'Service name is required' });
    if (!category) return res.status(400).json({ error: 'Service category is required' });
    if (!description) return res.status(400).json({ error: 'Service description is required' });
    if (!price) return res.status(400).json({ error: 'Service price is required' });
    if (!duration) return res.status(400).json({ error: 'Service duration is required' });
    if (!barbershop) return res.status(400).json({ error: 'Barbershop ID is required' });
    if (loyaltyPoints === undefined || loyaltyPoints === '') return res.status(400).json({ error: 'Loyalty points are required' });

    // Parse personnel as JSON array
    let personnelArray = [];
    if (personnel && personnel.trim()) {
      try {
        personnelArray = JSON.parse(personnel);
        if (!Array.isArray(personnelArray)) {
          return res.status(400).json({ error: 'Personnel must be an array of IDs' });
        }
      } catch (err) {
        return res.status(400).json({ error: 'Invalid personnel format, expected JSON array' });
      }
    }

    // Validate personnel IDs
    if (personnelArray.length > 0) {
      const validPersonnel = await User.find({ 
        _id: { $in: personnelArray },
        barbershop: barbershop,
        role: 'personnel',
        status: 'approved' // Ensure only approved personnel
      }).select('_id');
      const validIds = validPersonnel.map(p => p._id.toString());
      const invalidIds = personnelArray.filter(id => !validIds.includes(id));
      if (invalidIds.length > 0) {
        return res.status(400).json({ error: `Invalid personnel IDs: ${invalidIds.join(', ')}` });
      }
    }

    // Handle image upload
    let imageUrl = '';
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }).end(req.file.buffer);
      });
      imageUrl = result.secure_url;
    }

    // Create new service
    const newService = new Service({
      name,
      category,
      description,
      price: parseFloat(price),
      duration: parseInt(duration),
      loyaltyPoints: parseInt(loyaltyPoints),
      personnel: personnelArray,
      imageUrl,
      barbershop,
    });

    const saved = await newService.save();
    console.log('🛒 Service created:', { _id: saved._id, name, barbershop });
    res.status(201).json(saved);
  } catch (err) {
    console.error('❌ Failed to create service:', err.message);
    res.status(500).json({ error: 'Failed to create service', detail: err.message });
  }
});

// Other routes (updated to use User instead of Personnel)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const services = await Service.find()
      .populate('personnel', 'firstName lastName profileImageUrl', { role: 'personnel' })
      .populate('barbershop', 'name');
    console.log('🛒 Services fetched:', services.map(s => ({ _id: s._id, name: s.name, barbershop: s.barbershop?.name })));
    res.json(services);
  } catch (err) {
    console.error('❌ Failed to fetch services:', err.message);
    res.status(500).json({ error: 'Failed to fetch services', detail: err.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('personnel', 'firstName lastName', { role: 'personnel' })
      .populate('barbershop', 'name');
    if (!service) {
      console.log(`❌ Service not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Service not found' });
    }
    console.log('🛒 Service fetched:', { _id: service._id, name: service.name, barbershop: service.barbershop?.name });
    res.json(service);
  } catch (err) {
    console.error('❌ Failed to fetch service:', err.message);
    res.status(500).json({ error: 'Failed to fetch service', detail: err.message });
  }
});

router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    console.log('PUT /api/services/:id called');
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    const { name, category, description, price, duration, loyaltyPoints, personnel, imageUrl, barbershop } = req.body;

    if (!barbershop) {
      console.log('Missing barbershop ID');
      return res.status(400).json({ error: 'Barbershop ID is required' });
    }
    if (loyaltyPoints === undefined || loyaltyPoints === '') {
      return res.status(400).json({ error: 'Loyalty points are required' });
    }

    let personnelArray = [];
    if (personnel && personnel.trim()) {
      try {
        personnelArray = JSON.parse(personnel);
        if (!Array.isArray(personnelArray)) {
          return res.status(400).json({ error: 'Personnel must be an array of IDs' });
        }
      } catch (err) {
        return res.status(400).json({ error: 'Invalid personnel format, expected JSON array' });
      }
    }

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

    const update = {
      name,
      category,
      description,
      price: parseFloat(price),
      duration: parseInt(duration),
      loyaltyPoints: parseInt(loyaltyPoints),
      personnel: personnelArray,
      barbershop,
    };

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }).end(req.file.buffer);
      });
      update.imageUrl = result.secure_url;
    } else if (imageUrl) {
      update.imageUrl = imageUrl;
    }

    const updated = await Service.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
      .populate('barbershop', 'name');
    if (!updated) {
      console.log(`Service not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Service not found' });
    }
    console.log('Service updated:', { _id: updated._id, name: updated.name });
    res.json(updated);
  } catch (err) {
    console.error('Failed to update service:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to update service', detail: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await Service.findByIdAndDelete(req.params.id);
    if (!deleted) {
      console.log(`❌ Service not found for deletion: ${req.params.id}`);
      return res.status(404).json({ error: 'Service not found' });
    }
    console.log('🛒 Service deleted:', { _id: req.params.id });
    res.json({ message: 'Service deleted' });
  } catch (err) {
    console.error('❌ Failed to delete service:', err.message);
    res.status(500).json({ error: 'Failed to delete service', detail: err.message });
  }
});

router.get('/barbershops/:id/services', authMiddleware, async (req, res) => {
  try {
    const services = await Service.find({ barbershop: req.params.id })
      .select('_id name description price duration loyaltyPoints imageUrl personnel')
      .populate('personnel', 'firstName lastName', { role: 'personnel' })
      .lean();
    console.log(`Returning services for barbershop ${req.params.id}:`, services);
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});
router.get('/barbershops/:barbershopId/personnel', authMiddleware, async (req, res) => {
  try {
    const personnel = await User.find({
      barbershop: req.params.barbershopId,
      role: 'personnel',
      status: 'approved',
    }).select('_id firstName lastName profileImageUrl');
    console.log(`Returning personnel for barbershop ${req.params.barbershopId}:`, personnel);
    res.json(personnel);
  } catch (error) {
    console.error('Error fetching personnel:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

module.exports = router;