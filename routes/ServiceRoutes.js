const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const authMiddleware = require('../middleware/authMiddleware');

// CREATE service
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, category, description, price, duration, personnel, imageUrl, barbershop } = req.body;

    if (!barbershop) {
      return res.status(400).json({ error: 'Barbershop ID is required' });
    }

    const newService = new Service({
      name,
      category,
      description,
      price: parseFloat(price),
      duration: parseInt(duration),
      personnel: personnel ? personnel.split(',').map(id => id.trim()) : [],
      imageUrl: imageUrl || '',
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
    const { name, category, description, price, duration, personnel, imageUrl, barbershop } = req.body;

    if (!barbershop) {
      return res.status(400).json({ error: 'Barbershop ID is required' });
    }

    const update = {
      name,
      category,
      description,
      price: parseFloat(price),
      duration: parseInt(duration),
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