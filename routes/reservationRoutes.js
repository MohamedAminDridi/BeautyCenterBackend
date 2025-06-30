const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Service = require('../models/Service');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const { Expo } = require('expo-server-sdk');
const expo = new Expo();

// ✅ Create a reservation and notify personnel
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { services: serviceIds, date } = req.body; // Accepte un tableau 'services'
    const clientId = req.user._id;

    if (!serviceIds || !Array.isArray(serviceIds) || serviceIds.length === 0 || !date || isNaN(new Date(date))) {
      return res.status(400).json({ message: 'Missing or invalid service(s) or date.' });
    }

    // Vérifie tous les services
    const services = await Service.find({ _id: { $in: serviceIds } }).populate('personnel');
    if (services.length !== serviceIds.length) {
      return res.status(404).json({ message: 'One or more services not found.' });
    }

    // Vérifie que tous les services ont le même personnel
    const personnelIds = services.map(s => Array.isArray(s.personnel) ? s.personnel[0]?._id : s.personnel?._id);
    const uniquePersonnelIds = [...new Set(personnelIds)];
    if (uniquePersonnelIds.length > 1) {
      return res.status(400).json({ message: 'All services must be assigned to the same personnel.' });
    }
    const personnelId = uniquePersonnelIds[0];
    if (!personnelId) {
      return res.status(400).json({ message: 'No personnel assigned to these services.' });
    }

    const startDate = new Date(date);
    const totalDuration = services.reduce((total, service) => total + (service.duration || 30), 0);
    const endDate = new Date(startDate.getTime() + totalDuration * 60000);

    // ✅ Check for overlapping reservations
    const conflictingReservation = await Reservation.findOne({
      personnel: personnelId,
      $or: [
        {
          date: { $lte: startDate },
          endTime: { $gt: startDate },
        },
        {
          date: { $lt: endDate },
          endTime: { $gte: endDate },
        },
      ],
    });

    if (conflictingReservation) {
      return res.status(409).json({ message: 'This slot is already booked.' });
    }

    // ✅ Create reservation
    const newReservation = await Reservation.create({
      client: clientId,
      service: serviceIds, // Stocke le tableau d'IDs
      personnel: personnelId,
      date: startDate,
      endTime: endDate,
    });

    // ✅ Send push notification to assigned personnel
    const personnel = await User.findById(personnelId);
    if (personnel?.pushToken && Expo.isExpoPushToken(personnel.pushToken)) {
      await expo.sendPushNotificationsAsync([
        {
          to: personnel.pushToken,
          sound: 'default',
          title: '📅 New Reservation',
          body: `New booking by ${req.user.firstName} for ${services.map(s => s.name).join(', ')} at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          data: { reservationId: newReservation._id },
        },
      ]);
    }

    res.status(201).json(newReservation);
  } catch (error) {
    console.error('❌ Server error during reservation:', error);
    res.status(500).json({ message: 'Server error. Could not create reservation.' });
  }
});

// ✅ Get reservations for a specific personnel
router.get('/personnel/:id', authMiddleware, async (req, res) => {
  try {
    const reservations = await Reservation.find({ personnel: req.params.id })
      .populate('client')
      .populate('service');

    res.json(reservations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ Get all reservations
router.get('/', authMiddleware, async (req, res) => {
  try {
    const reservations = await Reservation.find()
      .populate('client', 'firstName lastName profileImageUrl')
      .populate('service', 'name')
      .populate('personnel', 'firstName lastName');

    res.status(200).json(reservations);
  } catch (err) {
    console.error('❌ Error fetching reservations:', err);
    res.status(500).json({ message: 'Failed to fetch reservations.' });
  }
});

module.exports = router;
