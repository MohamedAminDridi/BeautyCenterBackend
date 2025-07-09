const express = require('express');
const router = express.Router();
const Barbershop = require('../models/barbershop');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/role');

// 🏢 Create a barbershop (owner only)
router.post('/barbershops', authMiddleware, authorizeRoles('owner'), async (req, res) => {
  try {
    const { name, description, category, location, phone } = req.body;
    const logoUrl = req.body.logoUrl || null;

    const newShop = new Barbershop({
      name,
      description,
      category,
      location,
      logoUrl,
      phone,
      owner: req.user._id,
      status: 'pending'
    });

    await newShop.save();
    res.status(201).json({ message: 'Barbershop submitted for approval', barbershop: newShop });
  } catch (err) {
    console.error('Error creating barbershop:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 👥 Approve personnel registration (by owner)
router.patch('/approve-personnel/:personnelId', authMiddleware, authorizeRoles('owner'), async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.personnelId, { status: 'approved' });
    res.json({ message: 'Personnel approved' });
  } catch (err) {
    console.error('Error approving personnel:', err);
    res.status(500).json({ message: 'Failed to approve personnel' });
  }
});

router.patch('/reject-personnel/:personnelId', authMiddleware, authorizeRoles('owner'), async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.personnelId, { status: 'rejected' });
    res.json({ message: 'Personnel rejected' });
  } catch (err) {
    console.error('Error rejecting personnel:', err);
    res.status(500).json({ message: 'Failed to reject personnel' });
  }
});

// 📋 View pending personnel under this owner
router.get('/pending-personnel', authMiddleware, authorizeRoles('owner'), async (req, res) => {
  try {
    // Get all shops owned by this owner
    const shops = await Barbershop.find({ owner: req.user._id }).select('_id');
    const shopIds = shops.map(shop => shop._id);

    const pendingPersonnel = await User.find({
      role: 'personnel',
      status: 'pending',
      barbershop: { $in: shopIds }
    });

    res.json(pendingPersonnel);
  } catch (err) {
    console.error('Error fetching pending personnel:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
