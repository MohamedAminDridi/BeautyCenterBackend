const express = require('express');
const router = express.Router();
const Loyalty = require('../models/Loyalty');
const Reward = require('../models/Reward');
const  authMiddleware  = require('../middleware/authMiddleware');

// 🧠 Get loyalty data for logged-in user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    let loyalty = await Loyalty.findOne({ userId: req.user.id });
    if (!loyalty) {
      loyalty = await Loyalty.create({ userId: req.user.id });
    }

    const rewards = await Reward.find();
    res.json({
      points: loyalty.points,
      history: loyalty.history,
      rewards,
    });
  } catch (err) {
    console.error('Loyalty fetch error:', err.message);
    res.status(500).json({ message: 'Failed to fetch loyalty info' });
  }
});

// ➕ Add points manually (admin use or service action hook)
router.post('/add', authMiddleware, async (req, res) => {
  try {
    const { userId, points, description } = req.body;

    const loyalty = await Loyalty.findOneAndUpdate(
      { userId },
      {
        $inc: { points },
        $push: {
          history: {
            description,
            points,
            date: new Date(),
          },
        }
      },
      { new: true, upsert: true }
    );

    res.json(loyalty);
  } catch (err) {
    console.error('Add points error:', err.message);
    res.status(500).json({ message: 'Could not add points' });
  }
});

// 🎯 Claim a reward (deduct points)
router.post('/claim', authMiddleware, async (req, res) => {
  try {
    const { rewardId } = req.body;

    const reward = await Reward.findById(rewardId);
    if (!reward) return res.status(404).json({ message: 'Reward not found' });

    const loyalty = await Loyalty.findOne({ userId: req.user.id });
    if (!loyalty || loyalty.points < reward.requiredPoints) {
      return res.status(400).json({ message: 'Not enough points' });
    }

    loyalty.points -= reward.requiredPoints;
    loyalty.history.push({
      description: `Claimed reward: ${reward.title}`,
      points: -reward.requiredPoints,
      date: new Date()
    });

    await loyalty.save();

    res.json({ message: 'Reward claimed!', points: loyalty.points, history: loyalty.history });
  } catch (err) {
    console.error('Claim error:', err.message);
    res.status(500).json({ message: 'Failed to claim reward' });
  }
});

module.exports = router;
