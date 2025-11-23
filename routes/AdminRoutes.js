const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Service = require('../models/Service');
const Reservation = require('../models/Reservation');
const Product = require('../models/Product');
const { authorizeRoles } = require('../middleware/role');
const authMiddleware = require('../middleware/authMiddleware');
const Barbershop = require('../models/barbershop');
const { Expo } = require('expo-server-sdk');
const expo = new Expo();
const admin = require('../firebase/firebaseAdmin'); // path to initializer
// Get all users
router.get('/users', authorizeRoles('admin'), async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// Delete user
router.delete('/users/:id', authorizeRoles('admin'), async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: 'User deleted' });
});

// Change role
router.patch('/users/:id/role', authorizeRoles('admin'), async (req, res) => {
  const { role } = req.body;
  await User.findByIdAndUpdate(req.params.id, { role });
  res.json({ message: 'Role updated' });
});

// Dashboard endpoint
router.get('/dashboard', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  try {
    const clientsCount = await User.countDocuments({ role: 'client' });
    const personnelCount = await User.countDocuments({ role: 'personnel' });
    const servicesCount = await Service.countDocuments();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Set week range: Monday to Sunday
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 (Sunday) to 6 (Saturday)
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust to previous Monday
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Next Sunday
    weekEnd.setHours(23, 59, 59, 999);

    // Set month range: Start of month to end of month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    const todaysBookings = await Reservation.find({
      date: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('client', 'firstName lastName')
      .populate('personnel', 'firstName lastName')
      .populate('service', 'name price')
      .populate('barbershop')
      .sort({ date: 1 });

    const monthlyBookings = await Reservation.find({
      date: { $gte: monthStart, $lte: monthEnd },
    })
      .populate('service', 'price')
      .populate('barbershop');

    const weeklyBookings = await Reservation.find({
      date: { $gte: weekStart, $lte: weekEnd },
    })
      .populate('service', 'price')
      .populate('barbershop');

    console.log('Todays Bookings with Population:', todaysBookings);
    console.log('Weekly Bookings with Population:', weeklyBookings);
    console.log('Monthly Bookings with Population:', monthlyBookings);

    const barbershopStats = await Barbershop.find().lean();
    const barbershopData = await Promise.all(barbershopStats.map(async (barbershop) => {
      const todayRevenue = todaysBookings
        .filter(r => r.barbershop?._id.toString() === barbershop._id.toString())
        .reduce((total, booking) => {
          const servicePrices = booking.service.map(service => parseFloat(service?.price) || 0);
          console.log(`Today - Booking ${booking._id}: Service Prices: ${servicePrices}, Date: ${booking.date}`);
          return total + servicePrices.reduce((sum, price) => sum + price, 0);
        }, 0);

      const weekRevenue = weeklyBookings
        .filter(r => r.barbershop?._id.toString() === barbershop._id.toString())
        .reduce((total, booking) => {
          const servicePrices = booking.service.map(service => parseFloat(service?.price) || 0);
          console.log(`Week - Booking ${booking._id}: Service Prices: ${servicePrices}, Date: ${booking.date}`);
          return total + servicePrices.reduce((sum, price) => sum + price, 0);
        }, 0);

      const monthRevenue = monthlyBookings
        .filter(r => r.barbershop?._id.toString() === barbershop._id.toString())
        .reduce((total, booking) => {
          const servicePrices = booking.service.map(service => parseFloat(service?.price) || 0);
          console.log(`Month - Booking ${booking._id}: Service Prices: ${servicePrices}, Date: ${booking.date}`);
          return total + servicePrices.reduce((sum, price) => sum + price, 0);
        }, 0);

      const commission = monthRevenue * 0.1;

      console.log(`Barbershop: ${barbershop.name}, Today: ${todayRevenue}, Week: ${weekRevenue}, Month: ${monthRevenue}, Commission: ${commission}`);
      return {
        _id: barbershop._id,
        name: barbershop.name,
        revenueDay: todayRevenue,
        revenueWeek: weekRevenue,
        revenueMonth: monthRevenue,
        commission,
      };
    }));

    const revenueToday = todaysBookings.reduce((total, booking) => {
      const servicePrices = booking.service.map(service => parseFloat(service?.price) || 0);
      return total + servicePrices.reduce((sum, price) => sum + price, 0);
    }, 0);

    const revenueThisMonth = monthlyBookings.reduce((total, booking) => {
      const servicePrices = booking.service.map(service => parseFloat(service?.price) || 0);
      return total + servicePrices.reduce((sum, price) => sum + price, 0);
    }, 0);

    const oneMonthAgo = new Date(todayStart);
    oneMonthAgo.setDate(todayStart.getDate() - 30);

    const bookingTrends = await Reservation.aggregate([
      { $match: { date: { $gte: oneMonthAgo, $lte: monthEnd }, service: { $exists: true, $ne: null } } },
      { $group: { _id: "$service", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "services",
          localField: "_id",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      { $unwind: "$serviceDetails" },
      { $project: { _id: 0, name: "$serviceDetails.name", count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    const lowStockItems = await Product.aggregate([
      { $match: { $expr: { $lte: ["$quantity", "$alertThreshold"] } } },
      { $project: { _id: 1, name: 1, quantity: 1 } },
    ]);

    res.json({
      clients: clientsCount,
      personnel: personnelCount,
      services: servicesCount,
      todaysBookings,
      revenueToday,
      revenueThisMonth,
      barbershopStats: barbershopData,
      bookingTrends: { labels: bookingTrends.map(trend => trend.name), data: bookingTrends.map(trend => trend.count) },
      lowStockItems,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Failed to load dashboard data.', error: err.message });
  }
});

// Rest of the routes remain unchanged...
// ... (other routes like approve-owner, approve-barbershop, etc.)

// Rest of the routes remain unchanged...
router.patch('/approve-owner/:userId', async (req, res) => {
  await User.findByIdAndUpdate(req.params.userId, { status: 'approved' });
  res.json({ message: 'Owner approved' });
});

router.patch('/approve-barbershop/:barbershopId', async (req, res) => {
  await Barbershop.findByIdAndUpdate(req.params.barbershopId, { status: 'approved' });
  res.json({ message: 'Barbershop approved' });
});

router.get('/pending-approvals', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  try {
    const pendingOwners = await User.find({ role: 'owner', status: 'pending' })
      .select('firstName lastName phone email');
    const pendingShops = await Barbershop.find({ status: 'pending' })
      .populate('owner', 'firstName lastName phone');
    res.json({ pendingOwners, pendingShops });
  } catch (error) {
    console.error('Pending approvals error:', error);
    res.status(500).json({ message: 'Error fetching pending approvals' });
  }
});

router.patch('/reject-owner/:userId', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  await User.findByIdAndUpdate(req.params.userId, { status: 'rejected' });
  res.json({ message: 'Owner rejected' });
});

router.patch('/reject-barbershop/:barbershopId', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  await Barbershop.findByIdAndUpdate(req.params.barbershopId, { status: 'rejected' });
  res.json({ message: 'Barbershop rejected' });
});

// Send notification to users
// send notifications
router.post('/send-notification', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  try {
    const { message, target } = req.body;
    if (!message) return res.status(400).json({ message: 'Message is required' });

    let query = {};
    if (target !== 'all') query.role = target;

    const users = await User.find(query).select('fcmToken');
    const tokens = users.map(u => u.fcmToken).filter(Boolean);

    if (tokens.length === 0) return res.status(400).json({ message: 'No FCM tokens found' });

    // FCM accepts up to 500 tokens per sendMulticast call. Batch if needed.
    const BATCH_SIZE = 400;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const payload = {
        tokens: batch,
        notification: {
          title: 'Admin Notification',
          body: message,
        },
        android: { priority: 'high' },
      };
      const response = await admin.messaging().sendMulticast(payload);
      successCount += response.successCount;
      failureCount += response.failureCount;

      // Optionally clean invalid tokens:
      response.responses.forEach((r, idx) => {
        if (!r.success) {
          console.warn('Failed token:', batch[idx], r.error);
          // optionally remove token from DB here if r.error indicates unregistered/invalid
        }
      });
    }

    res.json({ message: 'Notification sent', success: successCount, failure: failureCount });
  } catch (error) {
    console.error('FCM Notification error:', error);
    res.status(500).json({ message: 'Failed to send notification', error: error.message });
  }
});
// Add barbershops route
router.get('/barbershops', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  try {
    const barbershops = await Barbershop.find()
      .populate('owner', 'firstName lastName phone')
      .lean();
    res.json(barbershops);
  } catch (error) {
    console.error('Error fetching barbershops:', error);
    res.status(500).json({ message: 'Error fetching barbershops' });
  }
});

// Add services route
router.get('/services', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  try {
    const services = await Service.find().lean();
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ message: 'Error fetching services' });
  }
});

// Add or update users route
router.get('/usersview', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  try {
    const users = await User.find().lean();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});
module.exports = router;