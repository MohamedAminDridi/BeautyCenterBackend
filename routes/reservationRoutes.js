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
// ✅ Create a reservation and notify personnel
router.post('/', authMiddleware, async (req, res) => {
  try {
    // Log the raw received body for debugging
    console.log('Raw received body:', req.body);
    
    // Fix the destructuring - get services directly, not as serviceIds
    const { services, date, barbershopId, personnel } = req.body;
    console.log('Destructured services:', services);
    console.log('Destructured personnel:', personnel);

    const clientId = req.user.id;

    // Validate inputs
    if (!services || !Array.isArray(services) || services.length === 0) {
      console.log('Validation failed - services:', services);
      return res.status(400).json({ message: 'Missing or invalid service(s).' });
    }
    
    const startDate = new Date(date);
    if (isNaN(startDate.getTime())) {
      console.log('Invalid date:', date);
      return res.status(400).json({ message: 'Invalid date provided.' });
    }
    
    let finalBarbershopId = barbershopId;
    if (!finalBarbershopId) {
      console.log('Missing barbershopId, attempting to derive from services');
      const firstService = await Service.findById(services[0]);
      if (!firstService || !firstService.barbershop) {
        return res.status(400).json({ message: 'Barbershop ID is required or cannot be derived.' });
      }
      finalBarbershopId = firstService.barbershop.toString();
    }

    // Fetch and validate services
    const serviceDocuments = await Service.find({ _id: { $in: services } }).populate('personnel');
    console.log('Found services:', serviceDocuments);
    
    if (serviceDocuments.length !== services.length) {
      return res.status(404).json({ message: 'One or more services not found.' });
    }

    // Ensure all services belong to the same barbershop
    const barbershopIds = serviceDocuments.map(s => s.barbershop.toString());
    if (new Set(barbershopIds).size > 1 || !barbershopIds.includes(finalBarbershopId)) {
      return res.status(400).json({ message: 'All services must belong to the selected barbershop.' });
    }

    // Determine personnel ID
    let personnelId = personnel;
    
    if (!personnelId) {
      // Try to get personnel from services
      const personnelIds = serviceDocuments.map(s => {
        if (Array.isArray(s.personnel) && s.personnel.length > 0) {
          return s.personnel[0]._id;
        }
        return s.personnel?._id;
      }).filter(id => id);
      
      const uniquePersonnelIds = [...new Set(personnelIds.map(id => id.toString()))];
      
      if (uniquePersonnelIds.length > 1) {
        return res.status(400).json({ message: 'All services must be assigned to the same personnel.' });
      }
      
      personnelId = uniquePersonnelIds[0];
    }
    
    if (!personnelId) {
      return res.status(400).json({ message: 'Personnel is required for booking.' });
    }

    // Calculate end time based on total duration
    const totalDuration = serviceDocuments.reduce((total, service) => total + (service.duration || 30), 0);
    const endDate = new Date(startDate.getTime() + totalDuration * 60000);

    // Check for conflicts with both reservations and blocked slots
    const conflictingReservation = await Reservation.findOne({
      personnel: personnelId,
      barbershop: finalBarbershopId,
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

    // Create the new reservation
    const newReservation = await Reservation.create({
      client: clientId,
      service: services, // Store the array of service IDs
      personnel: personnelId,
      barbershop: finalBarbershopId,
      date: startDate,
      endTime: endDate,
    });

    // Populate the created reservation for response
    const populatedReservation = await Reservation.findById(newReservation._id)
      .populate('service', 'name duration price')
      .populate('personnel', 'firstName lastName')
      .populate('client', 'firstName lastName');

    // Notify personnel via push notification
    const personnelUser = await User.findById(personnelId);
    if (personnelUser?.pushToken && Expo.isExpoPushToken(personnelUser.pushToken)) {
      await expo.sendPushNotificationsAsync([
        {
          to: personnelUser.pushToken,
          sound: 'default',
          title: '📅 New Reservation',
          body: `New booking for ${serviceDocuments.map(s => s.name).join(', ')} at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          data: { reservationId: newReservation._id },
        },
      ]);
    }

    res.status(201).json(populatedReservation);
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
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ message: 'Invalid date provided.' });
      }
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
    const { date, time, isMonthly, barbershopId } = req.body;
    if (!barbershopId) {
      return res.status(400).json({ message: 'Barbershop ID is required.' });
    }
    const startDate = new Date(date);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date provided.' });
    }
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
      barbershop: barbershopId,
    });

    await blockedSlot.save();
    res.status(201).json({ message: 'Slot blocked successfully', blockedSlot });
  } catch (error) {
    console.error('Error blocking slot:', error);
    res.status(500).json({ message: 'Server error. Could not block slot.', error: error.message });
  }
});

// ✅ Get blocked slots for a specific day and barbershop
router.get('/blocked/day', authMiddleware, async (req, res) => {
  try {
    const { date, barbershopId } = req.query;
    if (!date || !barbershopId) {
      return res.status(400).json({ message: 'Date and barbershop ID query parameters are required.' });
    }
    const startDate = new Date(date);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date provided.' });
    }
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);

    const blockedSlots = await BlockedSlot.find({
      barbershop: barbershopId,
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
    const { date, time, barbershopId } = req.body;
    if (!barbershopId) {
      return res.status(400).json({ message: 'Barbershop ID is required.' });
    }
    const startDate = new Date(date);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date provided.' });
    }
    const [hours, minutes] = time.split(':').map(Number);
    startDate.setHours(hours, minutes, 0, 0);

    const blockedSlot = await BlockedSlot.findOneAndDelete({
      date: startDate,
      personnel: req.user.role === 'admin' ? null : req.user.id,
      barbershop: barbershopId,
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