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
    console.log('Received body:', req.body);
    const { services: serviceIds, date } = req.body;
    const clientId = req.user.id;

    if (!serviceIds || !Array.isArray(serviceIds) || serviceIds.length === 0 || !date || isNaN(new Date(date))) {
      console.log('Validation failed:', { serviceIds, date, isValidDate: !isNaN(new Date(date)) });
      return res.status(400).json({ message: 'Missing or invalid service(s) or date.' });
    }

    console.log('Service IDs to find:', serviceIds);
    const services = await Service.find({ _id: { $in: serviceIds } }).populate('personnel');
    console.log('Found services:', services);
    if (services.length !== serviceIds.length) {
      console.log('Mismatch: Expected', serviceIds.length, 'services, found', services.length);
      return res.status(404).json({ message: 'One or more services not found.' });
    }

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

    const conflictingReservation = await Reservation.findOne({
      personnel: personnelId,
      $or: [
        { date: { $lte: startDate }, endTime: { $gt: startDate } },
        { date: { $lt: endDate }, endTime: { $gte: endDate } },
      ],
    });

    if (conflictingReservation) {
      return res.status(409).json({ message: 'This slot is already booked.' });
    }

    console.log('Creating reservation with clientId:', clientId);
    const newReservation = await Reservation.create({
      client: clientId,
      service: serviceIds,
      personnel: personnelId,
      date: startDate,
      endTime: endDate,
    });

    const personnel = await User.findById(personnelId);
    if (personnel?.pushToken && Expo.isExpoPushToken(personnel.pushToken)) {
      await expo.sendPushNotificationsAsync([
        {
          to: personnel.pushToken,
          sound: 'default',
          title: '📅 New Reservation',
          body: `New booking by ${req.user.role === 'client' ? req.user.id : 'Staff'} for ${services.map(s => s.name).join(', ')} at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
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

// ✅ Get upcoming reservations for the authenticated client
router.get('/upcoming', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const upcomingReservations = await Reservation.find({
      client: req.user.id,
      date: { $gte: now },
    })
      .populate('service', 'name')
      .populate('personnel', 'firstName lastName');
    console.log('📅 Upcoming reservations fetched:', upcomingReservations);
    res.status(200).json(upcomingReservations);
  } catch (error) {
    console.error('❌ Error fetching upcoming reservations:', error);
    res.status(500).json({ message: 'Failed to fetch upcoming reservations.' });
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