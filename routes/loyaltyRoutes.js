// routes/loyalty.js
const express = require('express');
const router = express.Router();
const Loyalty = require('../models/Loyalty');
const Reward = require('../models/Reward');
const authMiddleware = require('../middleware/authMiddleware');

// ────────────────────────────────────────────────
// GET /loyalty/me - Get loyalty data for logged-in user
// ────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    console.log('📊 Fetching loyalty for user:', req.user.id);

    // Find or create loyalty record
    let loyalty = await Loyalty.findOne({ userId: req.user.id });
    
    if (!loyalty) {
      console.log('✨ Creating new loyalty record for user:', req.user.id);
      loyalty = await Loyalty.create({ 
        userId: req.user.id,
        points: 0,
        history: []
      });
    }

    // Get all active rewards
    const rewards = await Reward.find({ isActive: true });

    console.log('✅ Loyalty data found:', {
      userId: req.user.id,
      points: loyalty.points,
      historyCount: loyalty.history.length,
      rewardsCount: rewards.length
    });

    res.json({
      points: loyalty.points,
      history: loyalty.history,
      rewards,
    });
  } catch (err) {
    console.error('❌ Loyalty fetch error:', err.message);
    res.status(500).json({ message: 'Failed to fetch loyalty info' });
  }
});

// ────────────────────────────────────────────────
// POST /loyalty/add - Add points manually (admin use)
// ────────────────────────────────────────────────
router.post('/add', authMiddleware, async (req, res) => {
  try {
    const { userId, points, description } = req.body;

    if (!userId || !points || !description) {
      return res.status(400).json({ 
        message: 'userId, points, and description are required' 
      });
    }

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
        },
      },
      { new: true, upsert: true }
    );

    console.log('✅ Points added:', {
      userId,
      points,
      newTotal: loyalty.points
    });

    res.json(loyalty);
  } catch (err) {
    console.error('❌ Add points error:', err.message);
    res.status(500).json({ message: 'Could not add points' });
  }
});

// ────────────────────────────────────────────────
// POST /loyalty/claim - Claim a reward (deduct points)
// ────────────────────────────────────────────────
router.post('/claim', authMiddleware, async (req, res) => {
  try {
    const { rewardId } = req.body;

    if (!rewardId) {
      return res.status(400).json({ message: 'rewardId is required' });
    }

    const reward = await Reward.findById(rewardId);
    if (!reward) {
      return res.status(404).json({ message: 'Reward not found' });
    }

    if (!reward.isActive) {
      return res.status(400).json({ message: 'This reward is no longer available' });
    }

    const loyalty = await Loyalty.findOne({ userId: req.user.id });
    if (!loyalty || loyalty.points < reward.requiredPoints) {
      return res.status(400).json({ message: 'Not enough points' });
    }

    // Deduct points
    loyalty.points -= reward.requiredPoints;
    loyalty.history.push({
      description: `Claimed reward: ${reward.title}`,
      points: -reward.requiredPoints,
      date: new Date(),
    });

    await loyalty.save();

    console.log('🎁 Reward claimed:', {
      userId: req.user.id,
      rewardTitle: reward.title,
      pointsDeducted: reward.requiredPoints,
      remainingPoints: loyalty.points
    });

    res.json({
      message: 'Reward claimed!',
      points: loyalty.points,
      history: loyalty.history,
    });
  } catch (err) {
    console.error('❌ Claim error:', err.message);
    res.status(500).json({ message: 'Failed to claim reward' });
  }
});

// ────────────────────────────────────────────────
// Helper function to award points (called from reservations)
// ────────────────────────────────────────────────
async function awardLoyaltyPoints(userId, points, description) {
  try {
    if (!userId || !points || points <= 0) {
      console.warn('⚠️ Invalid loyalty award attempt:', { userId, points });
      return null;
    }

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
        },
      },
      { new: true, upsert: true }
    );

    console.log('✅ Loyalty points awarded:', {
      userId,
      points,
      newTotal: loyalty.points,
      description
    });

    return loyalty;
  } catch (err) {
    console.error('❌ Failed to award loyalty points:', err.message);
    return null;
  }
}

// Export the helper function
router.awardLoyaltyPoints = awardLoyaltyPoints;

module.exports = router;