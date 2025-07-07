const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const upload = require('../middleware/upload');
const authMiddleware = require('../middleware/auth'); // Add auth middleware

// CREATE service
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { name, category, description, price, duration, personnel, barbershop } = req.body;

    const newService = new Service({
      name,
      category,
      description,
      price,
      duration,
      personnel: personnel ? personnel.split(',') : [],
      barbershop, // Required field from serviceSchema
      imageUrl: req.file ? `/uploads/${req.file.filename}` : '',
    });

    const saved = await newService.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create service', detail: err.message });
  }
});

// READ all services with optional barbershop filter
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { barbershopId } = req.query;
    const query = barbershopId ? { barbershop: barbershopId } : {};
    const services = await Service.find(query).populate('personnel', 'firstName lastName profileImageUrl');
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch services', detail: err.message });
  }
});

// READ single service
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id).populate('personnel', 'firstName lastName');
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch service', detail: err.message });
  }
});

// UPDATE service
router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { name, category, description, price, duration, personnel, barbershop } = req.body;
    const update = {
      name,
      category,
      description,
      price,
      duration,
      personnel: personnel ? personnel.split(',') : [],
      barbershop,
    };

    if (req.file) {
      update.imageUrl = `/uploads/${req.file.filename}`;
    }

    const updated = await Service.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) return res.status(404).json({ error: 'Service not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update service', detail: err.message });
  }
});

// DELETE service
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json({ message: 'Service deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete service', detail: err.message });
  }
});

module.exports = router;