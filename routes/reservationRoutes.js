const express = require("express");
const router = express.Router();
const Reservation = require("../models/Reservation");
const Service = require("../models/Service");
const User = require("../models/User");
const BlockedSlot = require("../models/BlockedSlot");
const authMiddleware = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/role"); // Import authorizeRoles
const { Expo } = require("expo-server-sdk");
const expo = new Expo();

// Create a reservation and notify personnel
router.post("/", authMiddleware, async (req, res) => {
  try {
    console.log("Raw received body:", req.body);
    const { services, date, barbershopId, personnel } = req.body;
    console.log("Destructured services:", services, "personnel:", personnel);
    const clientId = req.user.id;

    if (!services || !Array.isArray(services) || services.length === 0) {
      console.log("Validation failed - services:", services);
      return res.status(400).json({ message: "Missing or invalid service(s)." });
    }

    const startDate = new Date(date);
    if (isNaN(startDate.getTime())) {
      console.log("Invalid date:", date);
      return res.status(400).json({ message: "Invalid date provided." });
    }

    let finalBarbershopId = barbershopId;
    if (!finalBarbershopId) {
      console.log("Missing barbershopId, attempting to derive from services");
      const firstService = await Service.findById(services[0]);
      if (!firstService || !firstService.barbershop) {
        return res.status(400).json({ message: "Barbershop ID is required or cannot be derived." });
      }
      finalBarbershopId = firstService.barbershop.toString();
    }

    const serviceDocuments = await Service.find({ _id: { $in: services } }).populate("personnel");
    console.log("Found services:", serviceDocuments);
    if (serviceDocuments.length !== services.length) {
      return res.status(404).json({ message: "One or more services not found." });
    }

    const barbershopIds = serviceDocuments.map((s) => s.barbershop.toString());
    if (new Set(barbershopIds).size > 1 || !barbershopIds.includes(finalBarbershopId)) {
      return res.status(400).json({ message: "All services must belong to the selected barbershop." });
    }

    let personnelId = personnel;
    if (personnelId) {
      const personnelUser = await User.findById(personnelId);
      if (!personnelUser) return res.status(400).json({ message: "Invalid personnel ID." });
      personnelId = personnelUser._id;
    } else {
      const personnelIds = serviceDocuments
        .map((s) => (Array.isArray(s.personnel) && s.personnel.length > 0 ? s.personnel[0]._id : s.personnel?._id))
        .filter((id) => id);
      const uniquePersonnelIds = [...new Set(personnelIds.map((id) => id.toString()))];
      if (uniquePersonnelIds.length > 1) {
        return res.status(400).json({ message: "All services must be assigned to the same personnel." });
      }
      personnelId = uniquePersonnelIds[0];
    }

    if (!personnelId) {
      return res.status(400).json({ message: "Personnel is required for booking." });
    }

    const totalDuration = serviceDocuments.reduce((total, service) => total + (service.duration || 30), 0);
    const endDate = new Date(startDate.getTime() + totalDuration * 60000);

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
      return res.status(409).json({ message: "This slot is already booked or blocked." });
    }

    const newReservation = await Reservation.create({
      client: clientId,
      service: services,
      personnel: personnelId,
      barbershop: finalBarbershopId,
      date: startDate,
      endTime: endDate,
    });

    const populatedReservation = await Reservation.findById(newReservation._id)
      .populate("service", "name duration price")
      .populate("personnel", "firstName lastName")
      .populate("client", "firstName lastName profileImageUrl phone");

    const personnelUser = await User.findById(personnelId);
    if (personnelUser?.pushToken && Expo.isExpoPushToken(personnelUser.pushToken)) {
      try {
        await expo.sendPushNotificationsAsync([
          {
            to: personnelUser.pushToken,
            sound: "default",
            title: "📅 New Reservation",
            body: `New booking for ${serviceDocuments
              .map((s) => s.name)
              .join(", ")} at ${startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            data: { reservationId: newReservation._id },
          },
        ]);
      } catch (pushError) {
        console.error("Push notification failed:", pushError);
      }
    }

    res.status(201).json(populatedReservation);
  } catch (error) {
    console.error("❌ Server error during reservation:", error);
    res.status(500).json({ message: "Server error. Could not create reservation.", error: error.message });
  }
});

// Get upcoming reservations for the authenticated client
router.get("/upcoming", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const upcomingReservations = await Reservation.find({
      client: req.user.id,
      date: { $gte: now },
    })
      .populate("client", "firstName lastName profileImageUrl phone")
      .populate("service", "name")
      .populate("personnel", "firstName lastName")
      .sort({ date: 1 }); // Sort by date ascending
    console.log("📅 Upcoming reservations fetched:", upcomingReservations);
    res.status(200).json(upcomingReservations);
  } catch (error) {
    console.error("❌ Error fetching upcoming reservations:", error);
    res.status(500).json({ message: "Failed to fetch upcoming reservations.", error: error.message });
  }
});

// Get past reservations for the authenticated client
router.get("/past", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const pastReservations = await Reservation.find({
      client: req.user.id,
      date: { $lt: now },
    })
      .populate("client", "firstName lastName profileImageUrl phone")
      .populate("service", "name")
      .populate("personnel", "firstName lastName")
      .sort({ date: -1 }); // Sort by date descending
    console.log("📅 Past reservations fetched:", pastReservations);
    res.status(200).json(pastReservations);
  } catch (error) {
    console.error("❌ Error fetching past reservations:", error);
    res.status(500).json({ message: "Failed to fetch past reservations.", error: error.message });
  }
});

// Get reservations for a specific personnel
const Personnel = require('../models/Personnel'); // Add this at the top
const Reservation = require('../models/Reservation'); // Ensure this is also imported

router.get("/personnel/:id", authMiddleware, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const userRoles = req.user.roles || [];
    const personnelId = req.params.id;
    const barbershopId = req.query.barbershopId;

    console.log('Authenticated User:', req.user.id, 'Roles:', userRoles, 'Requested Personnel:', personnelId, 'Barbershop ID:', barbershopId);

    const personnel = await Personnel.findById(personnelId);
    if (!personnel) {
      return res.status(404).json({ message: "Personnel not found." });
    }

    if (
      personnelId !== req.user.id &&
      !userRoles.includes("admin") &&
      (!barbershopId || personnel.barbershop.toString() !== barbershopId)
    ) {
      return res.status(403).json({ message: "Unauthorized access. Personnel must belong to your selected barbershop." });
    }

    const { date } = req.query;
    let query = { personnel: personnelId };

    if (date) {
      const startDate = new Date(date);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ message: "Invalid date provided." });
      }
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }

    console.log("Querying reservations with:", query);

    const reservations = await Reservation.find(query)
      .populate({
        path: "client",
        select: "firstName lastName profileImageUrl phone",
        match: { _id: { $exists: true } },
      })
      .populate({
        path: "service",
        select: "name duration",
        match: { _id: { $exists: true } },
      })
      .select("date endTime client service personnel")
      .sort({ date: 1 });

    const validReservations = reservations.filter(r => r.client && r.service);
    console.log("Fetched reservations:", validReservations);

    res.json(validReservations);
  } catch (err) {
    console.error("❌ Error fetching personnel reservations:", err);
    res.status(500).json({
      message: "Server error while fetching reservations.",
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
});

// Get all reservations (admin only)
router.get("/", authMiddleware, authorizeRoles("admin"), async (req, res) => {
  try {
    const reservations = await Reservation.find()
      .populate("client", "firstName lastName profileImageUrl phone")
      .populate("service", "name")
      .populate("personnel", "firstName lastName")
      .sort({ date: 1 }); // Sort by date ascending
    res.status(200).json(reservations);
  } catch (err) {
    console.error("❌ Error fetching reservations:", err);
    res.status(500).json({ message: "Failed to fetch reservations.", error: err.message });
  }
});

// Create a new blocked slot
router.post("/block", authMiddleware, async (req, res) => {
  try {
    const { date, time, barbershopId } = req.body;
    if (!barbershopId) {
      return res.status(400).json({ message: "Barbershop ID is required." });
    }
    const startDate = new Date(date);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ message: "Invalid date provided." });
    }
    const [hours, minutes] = time.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return res.status(400).json({ message: "Invalid time format. Use HH:MM." });
    }
    startDate.setHours(hours, minutes, 0, 0);
    const endDate = new Date(startDate.getTime() + 30 * 60000);

    const blockedSlot = new BlockedSlot({
      date: startDate,
      endTime: endDate,
      personnel: req.user.id,
      barbershop: barbershopId,
    });

    await blockedSlot.save();
    res.status(201).json({ message: "Slot blocked successfully", blockedSlot });
  } catch (error) {
    console.error("Error blocking slot:", error);
    res.status(500).json({ message: "Server error. Could not block slot.", error: error.message });
  }
});

// Get blocked slots for a specific day and barbershop
router.get("/blocked/day", authMiddleware, async (req, res) => {
  try {
    const { date, barbershopId } = req.query;
    if (!date || !barbershopId) {
      return res.status(400).json({ message: "Date and barbershop ID query parameters are required." });
    }
    const startDate = new Date(date);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ message: "Invalid date provided." });
    }
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);

    const blockedSlots = await BlockedSlot.find({
      barbershop: barbershopId,
      personnel: req.user.id,
      date: { $gte: startDate, $lte: endDate },
    }).select("date endTime personnel");

    res.status(200).json(blockedSlots);
  } catch (error) {
    console.error("Error fetching blocked slots:", error);
    res.status(500).json({ message: "Server error. Could not fetch blocked slots.", error: error.message });
  }
});

// Delete a blocked slot
router.delete("/block", authMiddleware, async (req, res) => {
  try {
    const { date, time, barbershopId } = req.body;
    if (!barbershopId) {
      return res.status(400).json({ message: "Barbershop ID is required." });
    }
    const startDate = new Date(date);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ message: "Invalid date provided." });
    }
    const [hours, minutes] = time.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return res.status(400).json({ message: "Invalid time format. Use HH:MM." });
    }
    startDate.setHours(hours, minutes, 0, 0);

    const blockedSlot = await BlockedSlot.findOneAndDelete({
      date: startDate,
      personnel: req.user.id,
      barbershop: barbershopId,
    });

    if (!blockedSlot) {
      return res.status(404).json({ message: "Blocked slot not found or unauthorized." });
    }

    res.status(200).json({ message: "Slot unblocked successfully" });
  } catch (error) {
    console.error("Error unblocking slot:", error);
    res.status(500).json({ message: "Server error. Could not unblock slot.", error: error.message });
  }
});

// Get client history (for personnel or admin)
router.get("/client/:clientId", authMiddleware, authorizeRoles("personnel", "admin"), async (req, res) => {
  try {
    const clientId = req.params.clientId;
    if (!clientId) {
      return res.status(400).json({ message: "Client ID is required." });
    }

    // Fetch all reservations for the client
    const now = new Date();
    const clientReservations = await Reservation.find({ client: clientId })
      .populate("client", "firstName lastName profileImageUrl phone")
      .populate("service", "name duration price")
      .populate("personnel", "firstName lastName")
      .sort({ date: 1 }); // Sort by date ascending

    if (!clientReservations || clientReservations.length === 0) {
      return res.status(404).json({ message: "No reservations found for this client." });
    }

    res.status(200).json(clientReservations);
  } catch (error) {
    console.error("❌ Error fetching client history:", error);
    res.status(500).json({ message: "Server error while fetching client history.", error: error.message });
  }
});

module.exports = router;