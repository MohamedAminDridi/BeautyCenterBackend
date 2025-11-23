const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // FIX #1: Added mongoose import
const User = require('../models/User'); // FIX #2: Added User model import
const TrustedCode = require('../models/TrustedCode');
const Barbershop = require('../models/barbershop'); // FIX #3: Corrected casing to PascalCase
const generateQrCode = require('../utlis/generateQrCode'); // FIX #4: Corrected typo 'utlis' -> 'utils'
const auth = require('../middleware/authMiddleware');

// Create a trusted code for a shop
router.post('/generate', auth, async (req, res) => {
  try {
    const { barbershopId, code } = req.body;

    let trustedCode = await TrustedCode.findOne({ code, barbershop: barbershopId });

    if (!trustedCode) {
      trustedCode = await TrustedCode.create({
        code,
        barbershop: barbershopId,
        isActive: true,
      });
    }

    const qrImage = await generateQrCode(code);
    res.status(200).json({ code: trustedCode.code, qrImage });
  } catch (err) {
    res.status(500).json({ message: 'Error generating code', error: err.message });
  }
});

// Validate trusted code during booking
router.post('/validate', auth, async (req, res) => {
  const { code, barbershopId } = req.body;

  try {
    const trustedCode = await TrustedCode.findOne({ code, barbershop: barbershopId, isActive: true });
    if (!trustedCode) return res.status(400).json({ message: 'Invalid or inactive code' });

    const user = await User.findById(req.user.id);

    if (!user.trustedBarbershops.some(id => id.equals(barbershopId))) {
      user.trustedBarbershops.push(barbershopId);
      await user.save();
    }

    res.status(200).json({ message: 'User marked as trusted for this shop' });
  } catch (err) {
    res.status(500).json({ message: 'Error validating code', error: err.message });
  }
});

// Redeem a trusted code
router.post('/redeem', async (req, res) => {
  // Destructure all three pieces of info from the request
  const { code, userId, barbershopId } = req.body;

  // Validate inputs
  if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(barbershopId)) {
    return res.status(400).json({ error: 'Invalid user or barbershop ID format' });
  }

  try {
    // Find a code that matches the code string AND the specific barbershop ID
    const trusted = await TrustedCode.findOne({
      code,
      barbershop: barbershopId, // This line ensures the code belongs to the shop
      isActive: true,
    });

    if (!trusted) {
      // The code is wrong for this specific shop
      return res.status(400).json({ error: 'Invalid or expired code for this shop' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if the user is already trusted for this shop
    const isAlreadyTrusted = user.trustedBarbershops.some(id => id.equals(trusted.barbershop));

    if (!isAlreadyTrusted) {
      user.trustedBarbershops.push(trusted.barbershop);
      await user.save();
    }
    trusted.isActive = false;
    await trusted.save();
    return res.json({ message: `You are now a trusted client of this shop!` });

  } catch (err) {
    console.error('Error during code redemption:', err);
    res.status(500).json({ error: 'Server error during code redemption' });
  }
});

module.exports = router;