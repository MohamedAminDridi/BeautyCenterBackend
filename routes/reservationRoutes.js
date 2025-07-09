const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Service = require('../models/Service');
const User = require('../models/User');
const BlockedSlot = require('../models/BlockedSlot');
const authMiddleware = require('../middleware/authMiddleware');
const { Expo } = require('expo-server-sdk');
const expo = new Expo();

// ✅ Create a reservation and notify personnel
router.post('/', authMiddleware, async (req, res) => {
  try {
    console.log('Received body:', req.body);
    const { services: serviceIds, date, barbershopId } = req.body; // Added barbershopId
    const clientId = req.user.id;

    if (!serviceIds || !Array.isArray(serviceIds) || serviceIds.length === 0 || !date || isNaN(new Date(date)) || !barbershopId) {
      console.log('Validation failed:', { serviceIds, date, barbershopId, isValidDate: !isNaN(new Date(date)) });
      return res.status(400).json({ message: 'Missing or invalid service(s), date, or barbershop ID.' });
    }

    const services = await Service.find({ _id: { $in: serviceIds } }).populate('personnel');
    console.log('Found services:', services);
    if (services.length !== serviceIds.length) {
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

    // Check for conflicts with both reservations and blocked slots
    const conflictingReservation = await Reservation.findOne({
      personnel: personnelId,
      barbershop: barbershopId,
      $or: [
        { date: { $lte: startDate }, endTime: { $gt: startDate } },
        { date: { $lt: endDate }, endTime: { $gte: endDate } },
      ],
    });
    const conflictingBlockedSlot = await BlockedSlot.findOne({
      personnel: personnelId,
      $or: [
        { date: { $lte: startDate }, endTime: { $gt: startDate } },
        { date: { $lt: endDate }, endTime: { $gte: endDate } },
      ],
    });

    if (conflictingReservation || conflictingBlockedSlot) {
      return res.status(409).json({ message: 'This slot is already booked or blocked.' });
    }

    const newReservation = await Reservation.create({
      client: clientId,
      service: serviceIds,
      personnel: personnelId,
      barbershop: barbershopId, // Added barbershop field
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
    res.status(500).json({ message: 'Server error. Could not create reservation.', error: error.message });
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

// ✅ Get past reservations for the authenticated client
router.get('/past', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const pastReservations = await Reservation.find({
      client: req.user.id,
      date: { $lt: now },
    })
      .populate('service', 'name')
      .populate('personnel', 'firstName lastName');
    console.log('📅 Past reservations fetched:', pastReservations);
    res.status(200).json(pastReservations);
  } catch (error) {
    console.error('❌ Error fetching past reservations:', error);
    res.status(500).json({ message: 'Failed to fetch past reservations.' });
  }
});

// ✅ Get reservations for a specific personnel
router.get('/personnel/:id', authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    let query = { personnel: req.params.id };
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }
    const reservations = await Reservation.find(query)
      .populate('client', 'firstName lastName profileImageUrl')
      .populate('service', 'name duration')
      .select('date endTime client service personnel');
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

// ✅ Create a new blocked slot
router.post('/block', authMiddleware, async (req, res) => {
  try {
    const { date, time, isMonthly } = req.body;
    const startDate = new Date(date);
    const [hours, minutes] = time.split(':').map(Number);
    startDate.setHours(hours, minutes, 0, 0);
    const endDate = new Date(startDate.getTime() + 30 * 60000);

    const isAdmin = req.user.role === 'admin';
    const blockedSlot = new BlockedSlot({
      date: startDate,
      endTime: endDate,
      personnel: isAdmin ? null : req.user.id,
      isAdminBlock: isAdmin,
      isMonthly,
    });

    await blockedSlot.save();
    res.status(201).json({ message: 'Slot blocked successfully', blockedSlot });
  } catch (error) {
    console.error('Error blocking slot:', error);
    res.status(500).json({ message: 'Server error. Could not block slot.', error: error.message });
  }
});

// ✅ Get blocked slots for a specific day
router.get('/blocked/day', authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || isNaN(new Date(date))) {
      return res.status(400).json({ message: 'Invalid date provided.' });
    }
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);

    const blockedSlots = await BlockedSlot.find({
      date: { $gte: startDate, $lte: endDate },
    }).select('date endTime personnel isAdminBlock');

    res.status(200).json(blockedSlots);
  } catch (error) {
    console.error('Error fetching blocked slots:', error);
    res.status(500).json({ message: 'Server error. Could not fetch blocked slots.', error: error.message });
  }
});

// ✅ Delete a blocked slot
router.delete('/block', authMiddleware, async (req, res) => {
  try {
    const { date, time } = req.body;
    const startDate = new Date(date);
    const [hours, minutes] = time.split(':').map(Number);
    startDate.setHours(hours, minutes, 0, 0);

    const blockedSlot = await BlockedSlot.findOneAndDelete({
      date: startDate,
      personnel: req.user.role === 'admin' ? null : req.user.id,
    });

    if (!blockedSlot) {
      return res.status(404).json({ message: 'Blocked slot not found or unauthorized.' });
    }

    res.status(200).json({ message: 'Slot unblocked successfully' });
  } catch (error) {
    console.error('Error unblocking slot:', error);
    res.status(500).json({ message: 'Server error. Could not unblock slot.', error: error.message });
  }
});

module.exports = router;