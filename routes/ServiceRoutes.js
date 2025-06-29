const express = require('express');
const router = express.Router();
const Service = require('../models/Service');


// CREATE service
router.post('/', async (req, res) => {
  try {
    const { name, category, description, price, duration, personnel, imageUrl } = req.body;

    const newService = new Service({
      name,
      category,
      description,
      price: parseFloat(price),
      duration: parseInt(duration),
      personnel: personnel ? personnel.split(',') : [],
      imageUrl: imageUrl || '', // Use the imageUrl from the request body
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
router.put('/:id', async (req, res) => {
  try {
    const update = {
      name: req.body.name,
      category: req.body.category,
      description: req.body.description,
      price: parseFloat(req.body.price),
      duration: parseInt(req.body.duration),
      personnel: req.body.personnel ? req.body.personnel.split(',') : [],
    };

    if (req.body.imageUrl) {
      update.imageUrl = req.body.imageUrl; // Update with the new imageUrl if provided
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