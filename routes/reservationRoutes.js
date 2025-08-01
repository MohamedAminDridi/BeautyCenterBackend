const express = require("express");
const router = express.Router();
const Reservation = require("../models/Reservation");
const Service = require("../models/Service");
const User = require("../models/User");
const BlockedSlot = require("../models/BlockedSlot");
const authMiddleware = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/role");
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
      .populate("personnel", "firstName lastName pushToken")
      .populate("client", "firstName lastName profileImageUrl phone pushToken");

    const personnelUser = await User.findById(personnelId);
    if (personnelUser?.pushToken && Expo.isExpoPushToken(personnelUser.pushToken)) {
      try {
        await expo.sendPushNotificationsAsync([
          {
            to: personnelUser.pushToken,
            sound: "default",
            title: "📅 New Reservation Pending",
            body: `New booking for ${serviceDocuments
              .map((s) => s.name)
              .join(", ")} at ${startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            data: { reservationId: newReservation._id },
          },
        ]);
        console.log(`Notification sent to personnel ${personnelId}: ${personnelUser.pushToken}`);
      } catch (pushError) {
        console.error(`Failed to send notification to personnel ${personnelId}:`, pushError);
      }
    } else {
      console.warn(`No valid pushToken for personnel ${personnelId}`);
    }

    res.status(201).json(populatedReservation);
  } catch (error) {
    console.error("❌ Server error during reservation:", error);
    res.status(500).json({ message: "Server error. Could not create reservation.", error: error.message });
  }
});

// Update reservation status and notify client
router.patch("/:id/status", authMiddleware, authorizeRoles("personnel"), async (req, res) => {
  try {
    const { status, clientId } = req.body;
    const reservationId = req.params.id;
    const personnelId = req.user.id;

    console.log(`Updating reservation ${reservationId} to status ${status} by personnel ${personnelId}`);

    if (!["confirmed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Must be 'confirmed' or 'cancelled'." });
    }

    const reservation = await Reservation.findById(reservationId)
      .populate("service", "name")
      .populate("client", "firstName lastName pushToken phone")
      .populate("personnel", "firstName lastName pushToken");

    if (!reservation) {
      console.warn(`Reservation ${reservationId} not found`);
      return res.status(404).json({ message: "Reservation not found." });
    }

    if (reservation.personnel._id.toString() !== personnelId) {
      console.warn(`Unauthorized: Personnel ${personnelId} does not match reservation personnel ${reservation.personnel._id}`);
      return res.status(403).json({ message: "Unauthorized to update this reservation." });
    }

    if (clientId && reservation.client._id.toString() !== clientId) {
      console.warn(`Client ID mismatch: Provided ${clientId}, expected ${reservation.client._id}`);
      return res.status(400).json({ message: "Client ID does not match reservation." });
    }

    reservation.status = status;
    await reservation.save();

    const client = reservation.client;
    if (!client) {
      console.warn(`No client found for reservation ${reservationId}`);
    } else if (!client.pushToken) {
      console.warn(`No pushToken for client ${client._id} (${client.firstName} ${client.lastName})`);
    } else if (!Expo.isExpoPushToken(client.pushToken)) {
      console.warn(`Invalid pushToken for client ${client._id}: ${client.pushToken}`);
    } else {
      const serviceNames = reservation.service.map(s => s.name).join(", ");
      const reservationTime = new Date(reservation.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      if (status === "confirmed") {
        try {
          const pushResponse = await expo.sendPushNotificationsAsync([{
            to: client.pushToken,
            sound: "default",
            title: "✅ Booking Confirmed!",
            body: `Your booking for ${serviceNames} at ${reservationTime} has been confirmed by ${reservation.personnel.firstName}.`,
            data: { reservationId: reservation._id },
          }]);
          console.log(`Notification sent to client ${client._id}: ${client.pushToken}`, pushResponse);
        } catch (pushError) {
          console.error(`Failed to send confirmed notification to client ${client._id}:`, pushError.message);
        }
      } else if (status === "cancelled") {
        try {
          const pushResponse = await expo.sendPushNotificationsAsync([{
            to: client.pushToken,
            sound: "default",
            title: "❌ Booking Cancelled",
            body: `Unfortunately, your booking for ${serviceNames} at ${reservationTime} has been cancelled.`,
            data: { reservationId: reservation._id },
          }]);
          console.log(`Notification sent to client ${client._id}: ${client.pushToken}`, pushResponse);
        } catch (pushError) {
          console.error(`Failed to send cancelled notification to client ${client._id}:`, pushError.message);
        }
      }
    }

    if (reservation.personnel.pushToken) {
      console.log(`Personnel ${reservation.personnel._id} has pushToken ${reservation.personnel.pushToken}, but no notification sent for status update`);
    } else {
      console.log(`No pushToken for personnel ${reservation.personnel._id}`);
    }

    res.status(200).json(reservation);
  } catch (error) {
    console.error("❌ Error updating reservation status:", error.message);
    res.status(500).json({ message: "Server error. Could not update reservation status.", error: error.message });
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