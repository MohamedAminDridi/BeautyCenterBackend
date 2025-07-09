const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const authMiddleware = require('../middleware/authMiddleware');

// Import multer for file uploads
const multer = require('multer');

// Configure multer storage (e.g., to memory or disk)
const storage = multer.memoryStorage(); // or multer.diskStorage() if you prefer disk storage
const upload = multer({ storage: storage });

// Assuming cloudinary is configured elsewhere
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (if not already done in another file)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// CREATE service
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    console.log('Request body:', req.body); // Debug log
    console.log('Request file:', req.file); // Debug log
    
    const { name, category, description, price, duration, loyaltyPoints, personnel, barbershop } = req.body;

    // More detailed validation with better error messages
    if (!name) return res.status(400).json({ error: 'Service name is required' });
    if (!category) return res.status(400).json({ error: 'Service category is required' });
    if (!description) return res.status(400).json({ error: 'Service description is required' });
    if (!price) return res.status(400).json({ error: 'Service price is required' });
    if (!duration) return res.status(400).json({ error: 'Service duration is required' });
    if (!barbershop) return res.status(400).json({ error: 'Barbershop ID is required' });
    if (loyaltyPoints === undefined || loyaltyPoints === '') return res.status(400).json({ error: 'Loyalty points are required' });

    let imageUrl = '';
    if (req.file) {
      try {
        // For memory storage, use req.file.buffer
        const result = await cloudinary.uploader.upload_stream(
          { resource_type: 'image' },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              throw error;
            }
            return result;
          }
        );
        
        // If using memory storage, you need to handle the buffer differently
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { resource_type: 'image' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(req.file.buffer);
        });
        
        imageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Image upload failed:', uploadError);
        return res.status(500).json({ error: 'Image upload failed', detail: uploadError.message });
      }
    }

    // Parse personnel string to array if it exists
    let personnelArray = [];
    if (personnel && personnel.trim()) {
      personnelArray = personnel.split(',').map(id => id.trim()).filter(id => id);
    }

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
    console.error('Full error:', err);
    res.status(500).json({ error: 'Failed to create service', detail: err.message });
  }
});

// READ all services
router.get('/', authMiddleware, async (req, res) => {
  try {
    const services = await Service.find()
      .populate('personnel', 'firstName lastName profileImageUrl')
      .populate('barbershop', 'name');
    console.log('🛒 Services fetched:', services.map(s => ({ _id: s._id, name: s.name, barbershop: s.barbershop?.name })));
    res.json(services);
  } catch (err) {
    console.error('❌ Failed to fetch services:', err.message);
    res.status(500).json({ error: 'Failed to fetch services', detail: err.message });
  }
});

// READ single service
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('personnel', 'firstName lastName')
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

// UPDATE service
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, category, description, price, duration, loyaltyPoints, personnel, imageUrl, barbershop } = req.body;

    if (!barbershop) {
      return res.status(400).json({ error: 'Barbershop ID is required' });
    }
    if (loyaltyPoints === undefined) {
      return res.status(400).json({ error: 'Loyalty points are required' });
    }

    const update = {
      name,
      category,
      description,
      price: parseFloat(price),
      duration: parseInt(duration),
      loyaltyPoints: parseInt(loyaltyPoints),
      personnel: personnel ? personnel.split(',').map(id => id.trim()) : [],
      barbershop,
    };

    if (imageUrl) {
      update.imageUrl = imageUrl;
    }

    const updated = await Service.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('barbershop', 'name');
    if (!updated) {
      console.log(`❌ Service not found for update: ${req.params.id}`);
      return res.status(404).json({ error: 'Service not found' });
    }
    console.log('🛒 Service updated:', { _id: updated._id, name: updated.name, barbershop: updated.barbershop?.name });
    res.json(updated);
  } catch (err) {
    console.error('❌ Failed to update service:', err.message);
    res.status(500).json({ error: 'Failed to update service', detail: err.message });
  }
});

// DELETE service
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

module.exports = router;
