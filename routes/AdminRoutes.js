const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Service = require("../models/Service"); // ✅ Missing import
const Reservation = require("../models/Reservation"); // ✅ Missing import
const { authorizeRoles } = require("../middleware/role");
const  authMiddleware  = require("../middleware/authMiddleware");

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
      .populate('service', 'name')
      .sort({ date: 1 });

    res.json({
      clients: clientsCount,
      personnel: personnelCount,
      services: servicesCount,
      todaysBookings,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Failed to load dashboard data.' });
  }
});

module.exports = router;
