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

    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - 7);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    // Fetch bookings with appropriate time ranges
    const todaysBookings = await Reservation.find({
      date: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('client', 'firstName lastName')
      .populate('personnel', 'firstName lastName')
      .populate('service', 'name price')
      .populate('barbershop')
      .sort({ date: 1 });

    const monthlyBookings = await Reservation.find({
      date: { $gte: monthStart, $lte: todayEnd },
    })
      .populate('service', 'price')
      .populate('barbershop');

    const weeklyBookings = await Reservation.find({
      date: { $gte: weekStart, $lte: todayEnd },
    })
      .populate('service', 'price')
      .populate('barbershop');

    console.log('Todays Bookings with Population:', todaysBookings);
    console.log('Weekly Bookings with Population:', weeklyBookings);
    console.log('Monthly Bookings with Population:', monthlyBookings);

    // Calculate revenue and commission for each barbershop
    const barbershopStats = await Barbershop.find().lean();
    const barbershopData = await Promise.all(barbershopStats.map(async (barbershop) => {
      // Today revenue (only July 12 bookings)
      const todayRevenue = todaysBookings
        .filter(r => r.barbershop?._id.toString() === barbershop._id.toString())
        .reduce((total, booking) => {
          const servicePrices = booking.service.map(service => parseFloat(service?.price) || 0);
          console.log(`Today - Booking ${booking._id}: Service Prices: ${servicePrices}`);
          return total + servicePrices.reduce((sum, price) => sum + price, 0);
        }, 0);

      // Week revenue (July 5 to July 12 bookings)
      const weekRevenue = weeklyBookings
        .filter(r => r.barbershop?._id.toString() === barbershop._id.toString())
        .reduce((total, booking) => {
          const servicePrices = booking.service.map(service => parseFloat(service?.price) || 0);
          console.log(`Week - Booking ${booking._id}: Service Prices: ${servicePrices}`);
          return total + servicePrices.reduce((sum, price) => sum + price, 0);
        }, 0);

      // Month revenue (July 1 to July 12 bookings)
      const monthRevenue = monthlyBookings
        .filter(r => r.barbershop?._id.toString() === barbershop._id.toString())
        .reduce((total, booking) => {
          const servicePrices = booking.service.map(service => parseFloat(service?.price) || 0);
          console.log(`Month - Booking ${booking._id}: Service Prices: ${servicePrices}`);
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

    // Calculate booking trends for most booked services (past 30 days)
    const oneMonthAgo = new Date(todayStart);
    oneMonthAgo.setDate(todayStart.getDate() - 30);

    const bookingTrends = await Reservation.aggregate([
      { $match: { date: { $gte: oneMonthAgo, $lte: todayEnd }, service: { $exists: true, $ne: null } } },
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

    // Calculate low stock items using aggregation
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
router.post('/send-notification', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  try {
    const { message, target } = req.body;
    if (!message) return res.status(400).json({ message: 'Message is required' });

    let query = {};
    if (target !== 'all') query.role = target;

    const users = await User.find(query).select('pushToken');
    const pushTokens = users
      .filter(user => user.pushToken && Expo.isExpoPushToken(user.pushToken))
      .map(user => user.pushToken);

    if (pushTokens.length === 0) return res.status(400).json({ message: 'No valid push tokens found' });

    const chunks = expo.chunkPushNotifications(pushTokens.map(token => ({
      to: token,
      sound: 'default',
      title: 'Admin Notification',
      body: message,
      data: { type: 'admin' },
    })));

    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }

    res.json({ message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Notification error:', error);
    res.status(500).json({ message: 'Failed to send notification' });
  }
});

module.exports = router;