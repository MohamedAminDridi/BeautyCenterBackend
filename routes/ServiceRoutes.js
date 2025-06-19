const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const upload = require('../middleware/upload'); // Multer middleware

// CREATE service
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { name, category, description, price, duration, personnel } = req.body;

    const newService = new Service({
      name,
      category,
      description,
      price,
      duration,
      personnel: personnel ? personnel.split(',') : [],
      imageUrl: req.file ? `/uploads/${req.file.filename}` : '',
    });

    const saved = await newService.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create service', detail: err.message });
  }
});

// READ all services
router.get('/', async (req, res) => {
  try {
    const services = await Service.find().populate('personnel', 'firstName lastName profileImageUrl');
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// READ single service
router.get('/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id).populate('personnel', 'firstName lastName');
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

// UPDATE service
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const update = {
      name: req.body.name,
      category: req.body.category,
      description: req.body.description,
      price: req.body.price,
      duration: req.body.duration,
      personnel: req.body.personnel ? req.body.personnel.split(',') : [],
    };

    if (req.file) {
      update.imageUrl = `/uploads/${req.file.filename}`;
    }

    const updated = await Service.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// DELETE service
router.delete('/:id', async (req, res) => {
  try {
    await Service.findByIdAndDelete(req.params.id);
    res.json({ message: 'Service deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

module.exports = router;
