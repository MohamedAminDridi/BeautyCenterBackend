const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Reservation = require("../models/Reservation");
const { authorizeRoles } = require("../middleware/role");

// View available products
router.get("/products", authorizeRoles("client"), async (req, res) => {
  const products = await Product.find({ available: true });
  res.json(products);
});

// Make reservation
router.post("/reservations", authorizeRoles("client"), async (req, res) => {
  const { productId, date } = req.body;
  const reservation = await new Reservation({
    client: req.user._id,
    product: productId,
    date
  }).save();
  res.json({ message: "Reservation made", reservation });
});

module.exports = router;
