const express = require("express");
const router = express.Router();
const Reservation = require("../models/Reservation");
const Service = require("../models/Service");
const User = require("../models/User");
const BlockedSlot = require("../models/BlockedSlot");
const authMiddleware = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/role");
const admin = require('../firebase/firebaseAdmin');

// Create a reservation and notify personnel
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { services, date, barbershopId, personnel } = req.body;
    const clientId = req.user.id;

    if (!services || !Array.isArray(services) || services.length === 0) {
      return res.status(400).json({ message: "Missing or invalid service(s)." });
    }

    const startDate = new Date(date);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ message: "Invalid date provided." });
    }

    let finalBarbershopId = barbershopId;
    if (!finalBarbershopId) {
      const firstService = await Service.findById(services[0]);
      if (!firstService || !firstService.barbershop) {
        return res.status(400).json({ message: "Barbershop ID is required or cannot be derived." });
      }
      finalBarbershopId = firstService.barbershop.toString();
    }

    const serviceDocuments = await Service.find({ _id: { $in: services } }).populate("personnel");
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

    // check conflicts
    const conflictingReservation = await Reservation.findOne({
      personnel: personnelId,
      barbershop: finalBarbershopId,
      $or: [
        { date: { $lte: startDate }, endTime: { $gt: startDate } },
        { date: { $lt: endDate }, endTime: { $gte: endDate } },
      ],
      status: "confirmed",
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
      status: "pending",
    });

    const populatedReservation = await Reservation.findById(newReservation._id)
      .populate("service", "name duration price")
      .populate("personnel", "firstName lastName fcmToken")
      .populate("client", "firstName lastName profileImageUrl phone fcmToken");

    // notify personnel via FCM
    const personnelUser = await User.findById(personnelId);
    if (personnelUser?.fcmToken) {
      try {
        const message = {
          token: personnelUser.fcmToken,
          notification: {
            title: "📅 New Reservation Pending",
            body: `New booking for ${serviceDocuments.map(s => s.name).join(", ")} at ${startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          },
          data: { reservationId: newReservation._id.toString() },
          android: { priority: "high" },
        };
        const response = await admin.messaging().send(message);
        console.log(`FCM sent to personnel ${personnelId}:`, response);
      } catch (pushError) {
        console.error(`Failed to send FCM to personnel ${personnelId}:`, pushError);
      }
    } else {
      console.warn(`No valid fcmToken for personnel ${personnelId}`);
    }

    return res.status(201).json(populatedReservation);
  } catch (error) {
    console.error("❌ Server error during reservation:", error);
    return res.status(500).json({ message: "Server error. Could not create reservation.", error: error.message });
  }
});

// Update reservation status and notify client (FCM)
router.patch("/:id/status", authMiddleware, authorizeRoles("personnel"), async (req, res) => {
  try {
    const { status, clientId } = req.body;
    const reservationId = req.params.id;
    const personnelId = req.user.id;

    if (!["confirmed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Must be 'confirmed' or 'cancelled'." });
    }

    const reservation = await Reservation.findById(reservationId)
      .populate("service", "name")
      .populate("client", "firstName lastName fcmToken phone")
      .populate("personnel", "firstName lastName fcmToken");

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found." });
    }

    if (reservation.personnel._id.toString() !== personnelId) {
      return res.status(403).json({ message: "Unauthorized to update this reservation." });
    }

    if (clientId && reservation.client._id.toString() !== clientId) {
      return res.status(400).json({ message: "Client ID does not match reservation." });
    }

    reservation.status = status;
    await reservation.save();

    const client = reservation.client;
    if (!client) {
      console.warn(`No client found for reservation ${reservationId}`);
    } else if (!client.fcmToken) {
      console.warn(`No fcmToken for client ${client._id}`);
    } else {
      const serviceNames = reservation.service.map(s => s.name).join(", ");
      const reservationTime = new Date(reservation.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      try {
        const message = {
          token: client.fcmToken,
          notification: {
            title: status === "confirmed" ? "✅ Booking Confirmed!" : "❌ Booking Cancelled",
            body: status === "confirmed"
              ? `Your booking for ${serviceNames} at ${reservationTime} has been confirmed by ${reservation.personnel.firstName}.`
              : `Unfortunately, your booking for ${serviceNames} at ${reservationTime} has been cancelled.`
          },
          data: { reservationId: reservation._id.toString() },
          android: { priority: 'high' }
        };

        const response = await admin.messaging().send(message);
        console.log(`FCM sent to client ${client._id}:`, response);
      } catch (pushError) {
        console.error(`Failed to send ${status} notification to client ${client._id}:`, pushError);
      }
    }

    return res.status(200).json(reservation);
  } catch (error) {
    console.error("❌ Error updating reservation status:", error.message);
    return res.status(500).json({ message: "Server error. Could not update reservation status.", error: error.message });
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
      .populate("personnel", "firstName lastName phone")
      .sort({ date: 1 });
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
      .sort({ date: -1 });
    res.status(200).json(pastReservations);
  } catch (error) {
    console.error("❌ Error fetching past reservations:", error);
    res.status(500).json({ message: "Failed to fetch past reservations.", error: error.message });
  }
});

// Get reservations for a specific personnel
router.get("/personnel/:id", authMiddleware, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const userRoles = req.user.roles || [];
    const personnelId = req.params.id;
    const barbershopId = req.query.barbershopId;

    const personnel = await User.findById(personnelId);
    if (!personnel) {
      return res.status(404).json({ message: "Personnel not found." });
    }
    if (personnel.role !== 'personnel') {
      return res.status(400).json({ message: "The specified user is not a personnel." });
    }

    if (
      personnelId !== req.user.id &&
      !userRoles.includes("admin") &&
      (!barbershopId || personnel.barbershop?.toString() !== barbershopId)
    ) {
      return res.status(403).json({ message: "Unauthorized access. Personnel must belong to your selected barbershop." });
    }

    const { date, status } = req.query;
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

    if (status) {
      query.status = status;
    }

    const reservations = await Reservation.find(query)
      .populate({
        path: "client",
        select: "firstName lastName profileImageUrl phone pushToken",
        match: { _id: { $exists: true } },
      })
      .populate({
        path: "service",
        select: "name duration price",
        match: { _id: { $exists: true } },
      })
      .select("date endTime client service personnel status")
      .sort({ date: 1 });

    const validReservations = reservations.filter(r => r.client && r.service);
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
      .populate("client", "firstName lastName profileImageUrl phone pushToken")
      .populate("service", "name")
      .populate("personnel", "firstName lastName")
      .sort({ date: 1 });
    res.status(200).json(reservations);
  } catch (err) {
    console.error("❌ Error fetching reservations:", err);
    res.status(500).json({ message: "Failed to fetch reservations.", error: err.message });
  }
});

// Create a new blocked slot - ✅ FIXED
router.post("/block", authMiddleware, async (req, res) => {
  try {
    const { date, time, barbershopId, duration = 30 } = req.body;

    if (!date || !time || !barbershopId) {
      return res.status(400).json({ message: "date, time and barbershopId are required" });
    }

    // ✅ Parse time correctly - create Date in local context
    const [hours, minutes] = time.split(':').map(Number);
    const start = new Date(date);
    start.setHours(hours, minutes, 0, 0);
    
    // Validate
    if (isNaN(start.getTime())) {
      return res.status(400).json({ message: "Invalid date or time format" });
    }

    const end = new Date(start.getTime() + duration * 60 * 1000);

    console.log('🔒 Blocking slot:', {
      requestedTime: time,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      localStart: start.toString()
    });

    // Check for overlapping blocked slots (same personnel)
    const conflict = await BlockedSlot.findOne({
      personnel: req.user.id,
      barbershop: barbershopId,
      $or: [
        { date: { $lt: end }, endTime: { $gt: start } },
      ],
    });

    if (conflict) {
      return res.status(409).json({ message: "Overlaps with an existing blocked slot" });
    }

    const blockedSlot = await BlockedSlot.create({
      date: start,
      endTime: end,
      personnel: req.user.id,
      barbershop: barbershopId,
    });

    console.log('✅ Slot blocked successfully:', blockedSlot);
    res.status(201).json(blockedSlot);
  } catch (err) {
    console.error("Block slot error:", err);
    res.status(500).json({ message: "Failed to create blocked slot", error: err.message });
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

// Delete a blocked slot - ✅ FIXED
router.delete("/block", authMiddleware, async (req, res) => {
  try {
    const { date, time, barbershopId } = req.body;

    if (!date || !time || !barbershopId) {
      return res.status(400).json({ message: "date, time and barbershopId are required" });
    }

    // ✅ Parse time the same way as blocking
    const [hours, minutes] = time.split(':').map(Number);
    const start = new Date(date);
    start.setHours(hours, minutes, 0, 0);
    
    if (isNaN(start.getTime())) {
      return res.status(400).json({ message: "Invalid date or time format" });
    }

    console.log('🔓 Unblocking slot:', {
      requestedTime: time,
      lookingFor: start.toISOString(),
      localTime: start.toString()
    });

    // Find and delete - match on the start time within a 1-minute window to handle milliseconds
    const deleted = await BlockedSlot.findOneAndDelete({
      personnel: req.user.id,
      barbershop: barbershopId,
      date: {
        $gte: new Date(start.getTime() - 30000), // 30 seconds before
        $lte: new Date(start.getTime() + 30000), // 30 seconds after
      }
    });

    if (!deleted) {
      console.log('❌ No slot found to delete');
      return res.status(404).json({ message: "No blocked slot found at this time" });
    }

    console.log('✅ Deleted slot:', deleted);
    res.status(200).json({ message: "Blocked slot removed", deleted });
  } catch (err) {
    console.error("Unblock slot error:", err);
    res.status(500).json({ message: "Failed to remove blocked slot", error: err.message });
  }
});

// Get client history (for personnel or admin)
router.get("/client/:clientId", authMiddleware, authorizeRoles("personnel", "admin"), async (req, res) => {
  try {
    const clientId = req.params.clientId;
    if (!clientId) {
      return res.status(400).json({ message: "Client ID is required." });
    }

    const clientReservations = await Reservation.find({ client: clientId })
      .populate("client", "firstName lastName profileImageUrl phone pushToken")
      .populate("service", "name duration price")
      .populate("personnel", "firstName lastName")
      .sort({ date: 1 });

    if (!clientReservations || clientReservations.length === 0) {
      return res.status(404).json({ message: "No reservations found for this client." });
    }

    res.status(200).json(clientReservations);
  } catch (error) {
    console.error("❌ Error fetching client history:", error);
    res.status(500).json({ message: "Server error while fetching client history.", error: error.message });
  }
});

router.get("/day/:date", authMiddleware, async (req, res) => {
  try {
    const { date } = req.params;
    const { barbershopId, personnelId } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date parameter is required." });
    }

    const startOfDay = new Date(date);
    if (isNaN(startOfDay.getTime())) {
      return res.status(400).json({ message: "Invalid date provided." });
    }
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(startOfDay.getUTCDate() + 1);

    let query = {
      date: { $gte: startOfDay, $lt: endOfDay },
    };

    if (barbershopId) {
      query.barbershop = barbershopId;
    } else {
      console.warn("barbershopId missing in query for /day/:date route. This might return too many results.");
    }

    if (personnelId) {
      query.personnel = personnelId;
    } else if (req.user.role === 'personnel' && !req.user.isAdminBlock) {
      query.personnel = req.user.id;
    }

    const reservations = await Reservation.find(query)
      .populate("client", "firstName lastName profileImageUrl phone pushToken")
      .populate("service", "name duration price")
      .populate("personnel", "firstName lastName profileImageUrl")
      .sort({ date: 1 });

    const validReservations = reservations.filter(r => r.client && r.service);

    res.status(200).json(validReservations);
  } catch (error) {
    console.error("❌ Error fetching reservations for day:", error);
    res.status(500).json({ message: "Server error. Could not fetch reservations for the specified day.", error: error.message });
  }
});

module.exports = router;