const express = require("express");
const router = express.Router();
const Reservation = require("../models/Reservation");
const Service = require("../models/Service");
const User = require("../models/User");
const BlockedSlot = require("../models/BlockedSlot");
const authMiddleware = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/role");
const admin = require('../firebase/firebaseAdmin');
const Loyalty = require('../models/Loyalty');
const mongoose = require('mongoose');

// ============================================
// HELPER FUNCTIONS FOR BACKGROUND TASKS
// ============================================

// ✅ Background function for loyalty points
async function awardLoyaltyPoints(reservation) {
  try {
    const validServices = (reservation.service || []).filter(
      s => s && s._id && s.name && typeof s.loyaltyPoints === 'number'
    );

    if (validServices.length === 0) {
      return;
    }

    const totalLoyaltyPoints = validServices.reduce((total, service) => {
      return total + (service.loyaltyPoints || 0);
    }, 0);

    if (totalLoyaltyPoints <= 0) {
      return;
    }

    const serviceNames = validServices.map(s => s.name).join(", ");
    
    // ✅ Atomic operation with timeout
    await Loyalty.findOneAndUpdate(
      { userId: reservation.client._id },
      {
        $inc: { points: totalLoyaltyPoints },
        $push: {
          history: {
            description: `Confirmed booking: ${serviceNames}`,
            points: totalLoyaltyPoints,
            date: new Date(),
          }
        }
      },
      { 
        new: true, 
        upsert: true,
        setDefaultsOnInsert: true,
        maxTimeMS: 5000
      }
    );

    console.log('🎉 Loyalty points awarded:', totalLoyaltyPoints);
  } catch (error) {
    console.error('❌ Loyalty error:', error.message);
  }
}

// ✅ Background function for FCM
async function sendFCMNotification(reservation, status) {
  try {
    const client = reservation.client;
    
    if (!client || !client.fcmToken) {
      return;
    }

    const validServices = (reservation.service || []).filter(s => s && s.name);
    const serviceNames = validServices.length > 0 
      ? validServices.map(s => s.name).join(", ")
      : "your service";
    
    const reservationTime = new Date(reservation.date).toLocaleTimeString([], { 
      hour: "2-digit", 
      minute: "2-digit" 
    });

    const message = {
      token: client.fcmToken,
      notification: {
        title: status === "confirmed" ? "✅ Booking Confirmed!" : "❌ Booking Cancelled",
        body: status === "confirmed"
          ? `Your booking for ${serviceNames} at ${reservationTime} has been confirmed by ${reservation.personnel.firstName}.`
          : `Unfortunately, your booking for ${serviceNames} at ${reservationTime} has been cancelled.`
      },
      data: { 
        reservationId: reservation._id.toString(),
        status: status,
        type: 'reservation_update'
      },
      android: { 
        priority: 'high',
        ttl: 3600
      }
    };

    await admin.messaging().send(message);
    console.log(`✅ FCM sent to client ${client._id}`);
  } catch (error) {
    console.error('❌ FCM error:', error.message);
    
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      try {
        await User.findByIdAndUpdate(
          reservation.client._id,
          { $unset: { fcmToken: "" } },
          { maxTimeMS: 3000 }
        );
      } catch (clearError) {
        console.error('Failed to clear token:', clearError.message);
      }
    }
  }
}

// ============================================
// ROUTES
// ============================================

// Create a reservation and notify personnel
router.post("/", authMiddleware, async (req, res) => {
  req.setTimeout(20000);
  res.setTimeout(20000);

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
      const firstService = await Service.findById(services[0]).maxTimeMS(3000);
      if (!firstService || !firstService.barbershop) {
        return res.status(400).json({ message: "Barbershop ID is required or cannot be derived." });
      }
      finalBarbershopId = firstService.barbershop.toString();
    }

    const serviceDocuments = await Service.find({ _id: { $in: services } })
      .populate("personnel")
      .maxTimeMS(5000);
      
    if (serviceDocuments.length !== services.length) {
      return res.status(404).json({ message: "One or more services not found." });
    }

    const barbershopIds = serviceDocuments.map((s) => s.barbershop.toString());
    if (new Set(barbershopIds).size > 1 || !barbershopIds.includes(finalBarbershopId)) {
      return res.status(400).json({ message: "All services must belong to the selected barbershop." });
    }

    let personnelId = personnel;
    if (personnelId) {
      const personnelUser = await User.findById(personnelId).maxTimeMS(3000);
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

    // Check conflicts
    const conflictingReservation = await Reservation.findOne({
      personnel: personnelId,
      barbershop: finalBarbershopId,
      $or: [
        { date: { $lte: startDate }, endTime: { $gt: startDate } },
        { date: { $lt: endDate }, endTime: { $gte: endDate } },
      ],
      status: "confirmed",
    }).maxTimeMS(5000);

    const conflictingBlockedSlot = await BlockedSlot.findOne({
      personnel: personnelId,
      $or: [
        { date: { $lte: startDate }, endTime: { $gt: startDate } },
        { date: { $lt: endDate }, endTime: { $gte: endDate } },
      ],
    }).maxTimeMS(5000);

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
      .populate("client", "firstName lastName profileImageUrl phone fcmToken")
      .maxTimeMS(5000);

    // Send response immediately
    res.status(201).json(populatedReservation);

    // Notify personnel in background
    setImmediate(async () => {
      try {
        const personnelUser = await User.findById(personnelId).maxTimeMS(3000);
        if (personnelUser?.fcmToken) {
          const message = {
            token: personnelUser.fcmToken,
            notification: {
              title: "📅 New Reservation Pending",
              body: `New booking for ${serviceDocuments.map(s => s.name).join(", ")} at ${startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            },
            data: { reservationId: newReservation._id.toString() },
            android: { priority: "high" },
          };
          await admin.messaging().send(message);
          console.log(`FCM sent to personnel ${personnelId}`);
        }
      } catch (pushError) {
        console.error(`Failed to send FCM to personnel:`, pushError.message);
      }
    });

  } catch (error) {
    console.error("❌ Server error during reservation:", error);
    return res.status(500).json({ message: "Server error. Could not create reservation.", error: error.message });
  }
});

// ✅ OPTIMIZED: Update reservation status
router.patch("/:id/status", authMiddleware, authorizeRoles("personnel"), async (req, res) => {
  req.setTimeout(15000);
  res.setTimeout(15000);

  try {
    const { status, clientId } = req.body;
    const reservationId = req.params.id;
    const personnelId = req.user.id;

    if (!status || !["confirmed", "cancelled"].includes(status)) {
      return res.status(400).json({ 
        message: "Invalid status. Must be 'confirmed' or 'cancelled'." 
      });
    }

    if (!mongoose.Types.ObjectId.isValid(reservationId)) {
      return res.status(400).json({ message: "Invalid reservation ID format." });
    }

    // ✅ Use lean() for faster query + add timeout
    const reservation = await Reservation.findById(reservationId)
      .populate("service", "name loyaltyPoints")
      .populate("client", "firstName lastName fcmToken phone")
      .populate("personnel", "firstName lastName fcmToken")
      .lean()
      .maxTimeMS(5000);

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found." });
    }

    if (reservation.personnel._id.toString() !== personnelId) {
      return res.status(403).json({ 
        message: "Unauthorized to update this reservation." 
      });
    }

    if (clientId && reservation.client._id.toString() !== clientId) {
      return res.status(400).json({ 
        message: "Client ID does not match reservation." 
      });
    }

    const wasNotConfirmed = reservation.status !== 'confirmed';
    const isNowConfirmed = status === 'confirmed';
    const shouldAwardPoints = wasNotConfirmed && isNowConfirmed && !reservation.blocked;

    // ✅ Atomic update operation
    const updatedReservation = await Reservation.findByIdAndUpdate(
      reservationId,
      { status: status },
      { new: true, runValidators: true }
    ).populate("service", "name loyaltyPoints")
     .populate("client", "firstName lastName fcmToken phone")
     .populate("personnel", "firstName lastName fcmToken")
     .maxTimeMS(5000);

    if (!updatedReservation) {
      return res.status(404).json({ message: "Failed to update reservation." });
    }

    // ✅ CRITICAL: Send response IMMEDIATELY
    res.status(200).json(updatedReservation);

    // ✅ Background tasks using setImmediate
    if (shouldAwardPoints) {
      setImmediate(async () => {
        try {
          await awardLoyaltyPoints(reservation);
        } catch (err) {
          console.error('❌ Background loyalty error:', err.message);
        }
      });
    }

    setImmediate(async () => {
      try {
        await sendFCMNotification(updatedReservation, status);
      } catch (err) {
        console.error('❌ Background FCM error:', err.message);
      }
    });

  } catch (error) {
    console.error("❌ Error updating reservation status:", error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: "Invalid ID format.", 
        error: error.message 
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: "Validation error.", 
        error: error.message 
      });
    }

    return res.status(500).json({ 
      message: "Server error. Could not update reservation status.", 
      error: error.message 
    });
  }
});

// Get upcoming reservations for the authenticated client
router.get("/upcoming", authMiddleware, async (req, res) => {
  req.setTimeout(15000);
  res.setTimeout(15000);

  try {
    const now = new Date();
    const upcomingReservations = await Reservation.find({
      client: req.user.id,
      date: { $gte: now },
    })
      .populate("client", "firstName lastName profileImageUrl phone")
      .populate("service", "name imageUrl")
      .populate("personnel", "firstName lastName phone")
      .sort({ date: 1 })
      .maxTimeMS(8000);

    res.status(200).json(upcomingReservations);
  } catch (error) {
    console.error("❌ Error fetching upcoming reservations:", error);
    res.status(500).json({ message: "Failed to fetch upcoming reservations.", error: error.message });
  }
});

// Get past reservations for the authenticated client
router.get("/past", authMiddleware, async (req, res) => {
  req.setTimeout(15000);
  res.setTimeout(15000);

  try {
    const now = new Date();
    const pastReservations = await Reservation.find({
      client: req.user.id,
      date: { $lt: now },
    })
      .populate("client", "firstName lastName profileImageUrl phone")
      .populate("service", "name imageUrl")
      .populate("personnel", "firstName lastName")
      .sort({ date: -1 })
      .maxTimeMS(8000);

    res.status(200).json(pastReservations);
  } catch (error) {
    console.error("❌ Error fetching past reservations:", error);
    res.status(500).json({ message: "Failed to fetch past reservations.", error: error.message });
  }
});

// Get reservations for a specific personnel
router.get("/personnel/:id", authMiddleware, async (req, res) => {
  req.setTimeout(15000);
  res.setTimeout(15000);

  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const userRoles = req.user.roles || [];
    const personnelId = req.params.id;
    const barbershopId = req.query.barbershopId;

    const personnel = await User.findById(personnelId).maxTimeMS(3000);
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
      .sort({ date: 1 })
      .maxTimeMS(8000);

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
  req.setTimeout(15000);
  res.setTimeout(15000);

  try {
    const reservations = await Reservation.find()
      .populate("client", "firstName lastName profileImageUrl phone pushToken")
      .populate("service", "name")
      .populate("personnel", "firstName lastName")
      .sort({ date: 1 })
      .maxTimeMS(8000);

    res.status(200).json(reservations);
  } catch (err) {
    console.error("❌ Error fetching reservations:", err);
    res.status(500).json({ message: "Failed to fetch reservations.", error: err.message });
  }
});

// Create a new blocked slot
router.post("/block", authMiddleware, async (req, res) => {
  req.setTimeout(10000);
  res.setTimeout(10000);

  try {
    const { date, time, barbershopId, duration = 30 } = req.body;

    if (!date || !time || !barbershopId) {
      return res.status(400).json({ message: "date, time and barbershopId are required" });
    }

    const [hours, minutes] = time.split(':').map(Number);
    const start = new Date(date + 'T00:00:00.000Z');
    start.setUTCHours(hours, minutes, 0, 0);
    
    if (isNaN(start.getTime())) {
      return res.status(400).json({ message: "Invalid date or time format" });
    }

    const end = new Date(start.getTime() + duration * 60 * 1000);

    const conflict = await BlockedSlot.findOne({
      personnel: req.user.id,
      barbershop: barbershopId,
      $or: [
        { date: { $lt: end }, endTime: { $gt: start } },
      ],
    }).maxTimeMS(3000);

    if (conflict) {
      return res.status(409).json({ message: "Overlaps with an existing blocked slot" });
    }

    const blockedSlot = await BlockedSlot.create({
      date: start,
      endTime: end,
      personnel: req.user.id,
      barbershop: barbershopId,
    });

    res.status(201).json(blockedSlot);
  } catch (err) {
    console.error("❌ Block slot error:", err);
    res.status(500).json({ message: "Failed to create blocked slot", error: err.message });
  }
});

// Get blocked slots for a specific day and barbershop
router.get("/blocked/day", authMiddleware, async (req, res) => {
  req.setTimeout(10000);
  res.setTimeout(10000);

  try {
    const { date, barbershopId } = req.query;
    if (!date || !barbershopId) {
      return res.status(400).json({ message: "Date and barbershop ID query parameters are required." });
    }
    
    const startDate = new Date(date + 'T00:00:00.000Z');
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ message: "Invalid date provided." });
    }
    
    const endDate = new Date(date + 'T23:59:59.999Z');

    const blockedSlots = await BlockedSlot.find({
      barbershop: barbershopId,
      personnel: req.user.id,
      date: { $gte: startDate, $lte: endDate },
    }).select("date endTime personnel").maxTimeMS(5000);

    res.status(200).json(blockedSlots);
  } catch (error) {
    console.error("❌ Error fetching blocked slots:", error);
    res.status(500).json({ message: "Server error. Could not fetch blocked slots.", error: error.message });
  }
});

// Delete a blocked slot
router.delete("/block", authMiddleware, async (req, res) => {
  req.setTimeout(10000);
  res.setTimeout(10000);

  try {
    const { date, time, barbershopId } = req.body;

    if (!date || !time || !barbershopId) {
      return res.status(400).json({ message: "date, time and barbershopId are required" });
    }

    const [hours, minutes] = time.split(':').map(Number);
    const start = new Date(date + 'T00:00:00.000Z');
    start.setUTCHours(hours, minutes, 0, 0);
    
    if (isNaN(start.getTime())) {
      return res.status(400).json({ message: "Invalid date or time format" });
    }

    const deleted = await BlockedSlot.findOneAndDelete({
      personnel: req.user.id,
      barbershop: barbershopId,
      date: {
        $gte: new Date(start.getTime() - 30000),
        $lte: new Date(start.getTime() + 30000),
      }
    }).maxTimeMS(3000);

    if (!deleted) {
      return res.status(404).json({ message: "No blocked slot found at this time" });
    }

    res.status(200).json({ message: "Blocked slot removed", deleted });
  } catch (err) {
    console.error("❌ Unblock slot error:", err);
    res.status(500).json({ message: "Failed to remove blocked slot", error: err.message });
  }
});

// Get client history (for personnel or admin)
router.get("/client/:clientId", authMiddleware, authorizeRoles("personnel", "admin"), async (req, res) => {
  req.setTimeout(15000);
  res.setTimeout(15000);

  try {
    const clientId = req.params.clientId;
    if (!clientId) {
      return res.status(400).json({ message: "Client ID is required." });
    }

    const clientReservations = await Reservation.find({ client: clientId })
      .populate("client", "firstName lastName profileImageUrl phone pushToken")
      .populate("service", "name duration price")
      .populate("personnel", "firstName lastName")
      .sort({ date: 1 })
      .maxTimeMS(8000);

    if (!clientReservations || clientReservations.length === 0) {
      return res.status(404).json({ message: "No reservations found for this client." });
    }

    res.status(200).json(clientReservations);
  } catch (error) {
    console.error("❌ Error fetching client history:", error);
    res.status(500).json({ message: "Server error while fetching client history.", error: error.message });
  }
});

// DELETE - Cancel/Delete a reservation (client only)
router.delete("/:id", authMiddleware, async (req, res) => {
  req.setTimeout(15000);
  res.setTimeout(15000);

  try {
    const reservationId = req.params.id;
    const userId = req.user.id;

    const reservation = await Reservation.findById(reservationId)
      .populate("service", "name")
      .populate("personnel", "firstName lastName fcmToken")
      .maxTimeMS(5000);

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found." });
    }

    if (reservation.client.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized to cancel this reservation." });
    }

    if (new Date(reservation.date) < new Date()) {
      return res.status(400).json({ message: "Cannot cancel past reservations." });
    }

    if (reservation.status === 'cancelled') {
      return res.status(400).json({ message: "This reservation is already cancelled." });
    }

    reservation.status = 'cancelled';
    await reservation.save();

    // Send response immediately
    res.status(200).json({ 
      message: "Reservation cancelled successfully.",
      reservation 
    });

    // Notify personnel in background
    setImmediate(async () => {
      try {
        const personnel = reservation.personnel;
        if (personnel?.fcmToken) {
          const serviceNames = reservation.service.map(s => s.name).join(", ");
          const reservationTime = new Date(reservation.date).toLocaleTimeString([], { 
            hour: "2-digit", 
            minute: "2-digit" 
          });

          const message = {
            token: personnel.fcmToken,
            notification: {
              title: "❌ Reservation Cancelled",
              body: `A client cancelled their booking for ${serviceNames} at ${reservationTime}.`
            },
            data: { 
              reservationId: reservation._id.toString(),
              type: 'cancellation'
            },
            android: { priority: 'high' }
          };

          await admin.messaging().send(message);
          console.log(`FCM sent to personnel about cancellation`);
        }
      } catch (pushError) {
        console.error(`Failed to send cancellation notification:`, pushError.message);
      }
    });
  } catch (error) {
    console.error("❌ Error cancelling reservation:", error);
    res.status(500).json({ message: "Failed to cancel reservation.", error: error.message });
  }
});

// Get reservations for a specific day
router.get("/day/:date", authMiddleware, async (req, res) => {
  req.setTimeout(15000);
  res.setTimeout(15000);

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
      .sort({ date: 1 })
      .maxTimeMS(8000);

    const validReservations = reservations.filter(r => r.client && r.service);

    res.status(200).json(validReservations);
  } catch (error) {
    console.error("❌ Error fetching reservations for day:", error);
    res.status(500).json({ message: "Server error. Could not fetch reservations for the specified day.", error: error.message });
  }
});

module.exports = router;