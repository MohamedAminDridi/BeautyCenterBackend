const express = require("express");
const router = express.Router();
const Reservation = require("../models/Reservation");
const Product = require("../models/Product");
const { authorizeRoles } = require("../middleware/role");

// View reservations of products assigned to the authenticated personnel
router.get("/reservations/me", authorizeRoles("personnel"), async (req, res) => {
  try {
    const myProducts = await Product.find({ personnel: req.user._id });
    if (!myProducts || myProducts.length === 0) {
      return res.status(404).json({ message: "No products assigned to this personnel." });
    }
    const reservations = await Reservation.find({ product: { $in: myProducts.map(p => p._id) } })
      .populate("client", "firstName lastName profileImageUrl phone")
      .populate("product", "name price")
      .sort({ date: 1 }); // Sort by date ascending
    res.json(reservations);
  } catch (error) {
    console.error("Error fetching reservations:", error);
    res.status(500).json({ message: "Server error while fetching reservations.", error: error.message });
  }
});

// Accept or reject a reservation
router.patch("/reservations/:id", authorizeRoles("personnel"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!["confirmed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value. Use 'accepted' or 'rejected'." });
    }
    const myProducts = await Product.find({ personnel: req.user._id });
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation || !myProducts.some(p => p._id.equals(reservation.product))) {
      return res.status(404).json({ message: "Reservation not found or unauthorized." });
    }
    const updated = await Reservation.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).populate("client", "firstName lastName").populate("product", "name price");
    res.json({ message: `Reservation ${status}`, updated });
  } catch (error) {
    console.error("Error updating reservation:", error);
    res.status(500).json({ message: "Server error while updating reservation.", error: error.message });
  }
});

module.exports = router;