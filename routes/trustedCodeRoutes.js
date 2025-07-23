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

module.exports = router;
