const express = require("express");
const router = express.Router();
const Reservation = require("../models/Reservation");
const Product = require("../models/Product");
const { authorizeRoles } = require("../middleware/role");

// View reservations of products assigned to personnel
router.get("/reservations/me", authorizeRoles("personnel"), async (req, res) => {
  try {
    const myProducts = await Product.find({ personnel: req.user._id });
    const reservations = await Reservation.find({ product: { $in: myProducts.map(p => p._id) } })
      .populate("client")
      .populate("product");
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ message: "Error fetching reservations", error });
  }
});

// Accept/reject reservation
router.patch("/reservations/:id", authorizeRoles("personnel"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!["confirmed", "pending", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }
    const updated = await Reservation.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("client").populate("product");
    if (!updated) {
      return res.status(404).json({ message: "Reservation not found" });
    }
    res.json({ message: `Reservation ${status}`, updated });
  } catch (error) {
    res.status(500).json({ message: "Error updating reservation", error });
  }
});

// Fetch reservations for a specific personnel by date
router.get("/reservations/personnel/:personnelId", authorizeRoles("personnel"), async (req, res) => {
  try {
    const { personnelId } = req.params;
    const { date, barbershopId } = req.query;
    if (!barbershopId) {
      return res.status(400).json({ message: "Barbershop ID is required" });
    }
    let query = { personnel: personnelId, barbershopId };
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }
    const reservations = await Reservation.find(query)
      .populate("client")
      .populate("product");
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ message: "Error fetching personnel reservations", error });
  }
});

// Fetch blocked slots for a specific date
router.get("/reservations/blocked/day", authorizeRoles("personnel"), async (req, res) => {
  try {
    const { date, barbershopId } = req.query;
    if (!barbershopId) {
      return res.status(400).json({ message: "Barbershop ID is required" });
    }
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const blockedSlots = await Reservation.find({
      barbershopId,
      personnel: req.user._id,
      status: "blocked",
      date: { $gte: start, $lte: end },
    }).select("date");
    res.json(blockedSlots);
  } catch (error) {
    res.status(500).json({ message: "Error fetching blocked slots", error });
  }
});

// Block a time slot
router.post("/reservations/block", authorizeRoles("personnel"), async (req, res) => {
  try {
    const { date, time, barbershopId, personnel } = req.body;
    if (!barbershopId || !personnel) {
      return res.status(400).json({ message: "Barbershop ID and personnel are required" });
    }
    const [hours, minutes] = time.split(":").map(Number);
    const slotDate = new Date(date);
    slotDate.setUTCHours(hours, minutes, 0, 0);
    const existingReservation = await Reservation.findOne({
      barbershopId,
      personnel,
      date: {
        $gte: new Date(slotDate.getTime() - 15 * 60 * 1000), // 15 min buffer
        $lte: new Date(slotDate.getTime() + 15 * 60 * 1000),
      },
    });
    if (existingReservation) {
      return res.status(400).json({ message: "Slot is already reserved or blocked" });
    }
    const reservation = new Reservation({
      date: slotDate,
      status: "blocked",
      barbershopId,
      personnel,
      product: null, // No product for blocked slots
      client: null,
    });
    await reservation.save();
    res.json({ message: "Slot blocked successfully", reservation });
  } catch (error) {
    res.status(500).json({ message: "Error blocking slot", error });
  }
});

// Unblock a time slot
router.delete("/reservations/block", authorizeRoles("personnel"), async (req, res) => {
  try {
    const { date, time, barbershopId, personnel } = req.body;
    if (!barbershopId || !personnel) {
      return res.status(400).json({ message: "Barbershop ID and personnel are required" });
    }
    const [hours, minutes] = time.split(":").map(Number);
    const slotDate = new Date(date);
    slotDate.setUTCHours(hours, minutes, 0, 0);
    const deleted = await Reservation.findOneAndDelete({
      barbershopId,
      personnel,
      status: "blocked",
      date: {
        $gte: new Date(slotDate.getTime() - 15 * 60 * 1000),
        $lte: new Date(slotDate.getTime() + 15 * 60 * 1000),
      },
    });
    if (!deleted) {
      return res.status(404).json({ message: "Blocked slot not found" });
    }
    res.json({ message: "Slot unblocked successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error unblocking slot", error });
  }
});

// Fetch client history
router.get("/reservations/client/:clientId", authorizeRoles("personnel"), async (req, res) => {
  try {
    const { clientId } = req.params;
    const history = await Reservation.find({ client: clientId, status: { $ne: "cancelled" } })
      .populate("product")
      .sort({ date: -1 });
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: "Error fetching client history", error });
  }
});

module.exports = router;
