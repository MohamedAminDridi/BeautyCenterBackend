// routes/trustedCodeRoutes.js
const express = require('express');
const router = express.Router();
const TrustedCode = require('../models/TrustedCode');
const Barbershop = require('../models/barbershop');
const generateQrCode = require('../utlis/generateQrCode');
const auth = require('../middleware/authMiddleware');

// Create a trusted code for a shop
router.post('/generate', auth, async (req, res) => {
  try {
    const { barbershopId, code } = req.body;

    // Check if already exists
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

    if (!user.trustedBarbershops.includes(barbershopId)) {
      user.trustedBarbershops.push(barbershopId);
      await user.save();
    }

    res.status(200).json({ message: 'User marked as trusted for this shop' });
  } catch (err) {
    res.status(500).json({ message: 'Error validating code', error: err.message });
  }
});
router.post('/redeem', async (req, res) => {
  const { code, userId } = req.body;

  try {
    const trusted = await TrustedCode.findOne({ code, isActive: true });
    if (!trusted) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Store trusted barbershop in user document
    user.trustedBarbershops = user.trustedBarbershops || [];
    if (!user.trustedBarbershops.includes(trusted.barbershop.toString())) {
      user.trustedBarbershops.push(trusted.barbershop);
    }

    await user.save();

    return res.json({ message: 'You are now a trusted client!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
module.exports = router;
