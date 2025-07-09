const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Service = require("../models/Service");
const Reservation = require("../models/Reservation");
const Product = require("../models/Product"); // Added for low stock items
const { authorizeRoles } = require("../middleware/role");
const authMiddleware = require("../middleware/authMiddleware");
const Barbershop = require('../models/barbershop');

// Get all users
router.get("/users", authorizeRoles("admin"), async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// Delete user
router.delete("/users/:id", authorizeRoles("admin"), async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "User deleted" });
});

// Change role
router.patch("/users/:id/role", authorizeRoles("admin"), async (req, res) => {
  const { role } = req.body;
  await User.findByIdAndUpdate(req.params.id, { role });
  res.json({ message: "Role updated" });
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

    const todaysBookings = await Reservation.find({
      date: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('client', 'firstName lastName')
      .populate('personnel', 'firstName lastName')
      .populate('service', 'name price')
      .sort({ date: 1 });

    // Calculate revenue for this month
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0, 23, 59, 59, 999);

    const monthlyBookings = await Reservation.find({
      date: { $gte: monthStart, $lte: monthEnd },
    })
      .populate('service', 'price');

    const revenueThisMonth = monthlyBookings.reduce((total, booking) => {
      return total + (parseFloat(booking.service?.price) || 0);
    }, 0);

    // Calculate booking trends for most booked services (past 30 days)
    const oneMonthAgo = new Date(todayStart);
    oneMonthAgo.setDate(todayStart.getDate() - 30);

    const bookingTrends = await Reservation.aggregate([
      {
        $match: {
          date: { $gte: oneMonthAgo, $lte: todayEnd },
          service: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$service",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "services",
          localField: "_id",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      {
        $unwind: "$serviceDetails",
      },
      {
        $project: {
          _id: 0,
          name: "$serviceDetails.name",
          count: 1,
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 5,
      },
    ]);

    // Calculate low stock items using aggregation
    const lowStockItems = await Product.aggregate([
      {
        $match: {
          $expr: { $lte: ["$quantity", "$alertThreshold"] },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          quantity: 1,
        },
      },
    ]);

    res.json({
      clients: clientsCount,
      personnel: personnelCount,
      services: servicesCount,
      todaysBookings,
      revenueThisMonth,
      bookingTrends: { labels: bookingTrends.map(trend => trend.name), data: bookingTrends.map(trend => trend.count) },
      lowStockItems,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Failed to load dashboard data.' });
  }
});
router.patch('/approve-owner/:userId', async (req, res) => {
  await User.findByIdAndUpdate(req.params.userId, { status: 'approved' });
  res.json({ message: 'Owner approved' });
});

router.patch('/approve-barbershop/:barbershopId', async (req, res) => {
  await Barbershop.findByIdAndUpdate(req.params.barbershopId, { status: 'approved' });
  res.json({ message: 'Barbershop approved' });
});
// GET /admin/pending-approvals
router.get('/pending-approvals',
  authMiddleware,
  authorizeRoles('admin'),
  async (req, res) => {
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
router.patch('/reject-owner/:userId',
  authMiddleware,
  authorizeRoles('admin'),
  async (req, res) => {
    await User.findByIdAndUpdate(req.params.userId, { status: 'rejected' });
    res.json({ message: 'Owner rejected' });
});
router.patch('/reject-barbershop/:barbershopId',
  authMiddleware,
  authorizeRoles('admin'),
  async (req, res) => {
    await Barbershop.findByIdAndUpdate(req.params.barbershopId, { status: 'rejected' });
    res.json({ message: 'Barbershop rejected' });
});

module.exports = router;
