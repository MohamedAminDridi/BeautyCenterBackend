const express = require("express");
const router = express.Router();
const Reservation = require("../models/Reservation");
const Product = require("../models/Product");
const { authorizeRoles } = require("../middleware/role");

// View reservations of products assigned to them
router.get("/reservations/me", authorizeRoles("personnel"), async (req, res) => {
  const myProducts = await Product.find({ personnel: req.user._id });
  const reservations = await Reservation.find({ product: { $in: myProducts.map(p => p._id) } })
    .populate("client")
    .populate("product");
  res.json(reservations);
});

// Accept/reject reservation
router.patch("/reservations/:id", authorizeRoles("personnel"), async (req, res) => {
  const { status } = req.body;
  const updated = await Reservation.findByIdAndUpdate(req.params.id, { status }, { new: true });
  res.json({ message: `Reservation ${status}`, updated });
});

module.exports = router;
