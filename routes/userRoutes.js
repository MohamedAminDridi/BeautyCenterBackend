const express = require('express');
const router = express.Router();
const User = require('../models/User');
const path = require('path');
const multer = require('multer');
const authMiddleware = require('../middleware/authMiddleware');
const cloudinary = require('cloudinary').v2;

// Setup multer for temporary storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage });

// GET users (by role)
router.get('/', async (req, res) => {
  try {
    const { role } = req.query;
    const users = await User.find(role ? { role } : {});
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// GET /me (authenticated user data)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('firstName lastName phone email role barbershop profileImageUrl isActive status setupComplete personnelAvailability scheduleOverrides pushToken');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error in /me endpoint:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// GET user by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error fetching user by ID:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update role
router.put('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!['client', 'personnel', 'owner'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role value' });
  }
  try {
    const user = await User.findByIdAndUpdate(id, { role }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Role updated', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT toggle status
router.put('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;
  try {
    const updatedUser = await User.findByIdAndUpdate(id, { isActive }, { new: true });
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ message: 'Error updating status', error: err.message });
  }
});

// PUT toggle user
router.put('/:id/toggle', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    user.isActive = !user.isActive;
    await user.save();
    res.json({ isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ message: 'Error toggling user status', error: err.message });
  }
});

// PATCH update user
router.patch('/:id', async (req, res) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!updatedUser) return res.status(404).json({ error: 'User not found' });
    res.json(updatedUser);
  } catch (err) {
    console.error('Update user error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE user
router.delete('/:id', async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /me (update authenticated user with image)
router.put('/me', authMiddleware, upload.single('profileImage'), async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: no user ID in token' });
    }
    const updates = req.body;
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path);
      updates.profileImageUrl = result.secure_url;
    }
    const updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true });
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(updatedUser);
  } catch (err) {
    console.error('Update failed:', err.message);
    res.status(500).json({ error: 'Update failed' });
  }
});

// NEW: Update push token for authenticated user
router.put('/me/push-token', authMiddleware, async (req, res) => {
  try {
    const { pushToken } = req.body;
    if (!pushToken) {
      return res.status(400).json({ message: 'Push token is required' });
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { pushToken },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    console.log(`Push token updated for user ${req.user.id}: ${pushToken}`);
    res.json({ message: 'Push token saved' });
  } catch (err) {
    console.error('Failed to save push token:', err);
    res.status(500).json({ message: 'Failed to save push token', error: err.message });
  }
});

// Route to update personnel weekly availability template
router.put('/me/availability', authMiddleware, async (req, res) => {
  const { availability } = req.body;
  if (!Array.isArray(availability) || availability.length !== 7) {
    return res.status(400).json({ message: 'Invalid availability data provided. Must be an array of 7 days.' });
  }
  try {
    const user = await User.findById(req.user.id);
    if (!user) { return res.status(404).json({ message: 'User not found.' }); }
    user.personnelAvailability = availability;
    user.setupComplete = true;
    await user.save();
    res.json({
      message: 'Availability updated successfully.',
      personnelAvailability: user.personnelAvailability,
    });
  } catch (err) {
    console.error('Error updating availability:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation failed', errors: err.errors });
    }
    res.status(500).json({ message: 'Server error while updating availability.' });
  }
});

// Route to add or update a schedule override for a specific date
router.post('/me/schedule-overrides', authMiddleware, async (req, res) => {
  const { overrideData } = req.body;
  if (!overrideData || !overrideData.date) {
    return res.status(400).json({ message: 'Invalid override data provided. Date is required.' });
  }
  try {
    const user = await User.findById(req.user.id);
    if (!user) { return res.status(404).json({ message: 'User not found.' }); }
    const existingOverrideIndex = user.scheduleOverrides.findIndex(ov => ov.date === overrideData.date);
    if (existingOverrideIndex > -1) {
      user.scheduleOverrides[existingOverrideIndex] = overrideData;
    } else {
      user.scheduleOverrides.push(overrideData);
    }
    await user.save();
    res.status(200).json({
      message: 'Schedule override saved successfully.',
      scheduleOverrides: user.scheduleOverrides
    });
  } catch (err) {
    console.error('Error saving schedule override:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation failed', errors: err.errors });
    }
    res.status(500).json({ message: 'Server error while saving override.' });
  }
});

// Get personnel
router.get('/personnel', async (req, res) => {
  try {
    const personnel = await User.find({ role: 'personnel' });
    res.json(personnel);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch personnel' });
  }
});

// DEPRECATED: Use /me/push-token instead
router.put('/:id/push-token', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { pushToken } = req.body;
  try {
    if (id !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to update this user' });
    }
    const user = await User.findByIdAndUpdate(id, { pushToken }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    console.log(`Push token updated for user ${id}: ${pushToken}`);
    res.json({ message: 'Push token saved' });
  } catch (err) {
    console.error('Failed to save push token:', err);
    res.status(500).json({ message: 'Failed to save push token', error: err.message });
  }
});

// Get personnel by barbershop
router.get('/barbershops/:barbershopId/personnel', authMiddleware, async (req, res) => {
  try {
    const personnel = await User.find({
      barbershop: req.params.barbershopId,
      role: 'personnel',
      status: 'approved',
    }).select('_id firstName lastName profileImageUrl');
    res.json(personnel);
  } catch (error) {
    console.error('Error fetching personnel:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// Get pending personnel by barbershop
router.get('/barbershops/:id/pending-personnel', authMiddleware, async (req, res) => {
  try {
    const pendingPersonnel = await User.find({
      barbershop: req.params.id,
      role: 'personnel',
      status: 'pending',
    }).select('_id firstName lastName profileImageUrl status barbershop');
    res.json(pendingPersonnel);
  } catch (error) {
    console.error('Error fetching pending personnel:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// Update user status
router.put('/:id/statusapprove', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    user.status = status;
    const updatedUser = await user.save({ runValidators: true });
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

module.exports = router;