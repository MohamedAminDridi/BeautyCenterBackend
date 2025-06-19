const express = require('express');
const router = express.Router();
const User = require('../models/User');
const path = require('path');
const multer = require('multer');
const authMiddleware = require('../middleware/authMiddleware');

// Setup multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage });

// ========== Routes ==========

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

// PUT update role
router.put('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!['client', 'personnel'].includes(role)) {
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

router.put('/:id/toggle', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    user.isActive = !user.isActive;
    await user.save();
    res.json({ isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ message: "Error toggling user status", error: err.message });
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
//Update
router.put('/me', authMiddleware, upload.single('profileImage'), async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId; // 🔥 SAFELY extract user ID

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: no user ID in token' });
    }

    const updates = req.body;

    if (req.file) {
      updates.profileImageUrl = `/uploads/${req.file.filename}`;
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

router.get('/personnel', async (req, res) => {
  try {
    const personnel = await User.find({ role: 'personnel' });
    res.json(personnel);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch personnel' });
  }
});
router.put('/:id/push-token', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { pushToken } = req.body;

  try {
    const user = await User.findByIdAndUpdate(id, { pushToken });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'Push token saved' });
  } catch (err) {
    console.error('Failed to save push token:', err);
    res.status(500).json({ error: 'Failed to save push token' });
  }
});

module.exports = router;
