// routes/notifications.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/save-fcm-token', authMiddleware, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ message: 'fcmToken is required' });

    await User.findByIdAndUpdate(req.user.id, { fcmToken }, { new: true });
    console.log(`Saved fcmToken for user ${req.user.id}: ${fcmToken}`);
    return res.json({ message: 'Token saved' });
  } catch (err) {
    console.error('save-fcm-token error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
