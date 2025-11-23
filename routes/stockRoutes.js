const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const jwt = require('jsonwebtoken'); // Add this line

// Middleware to protect routes (JWT authentication)
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1]; // Extract token from "Bearer <token>"
  if (!token) return res.status(401).json({ error: 'Access denied' });

  try {
    const decoded = jwt.verify(token, '1111'); // Replace with your JWT secret key
    req.user = decoded; // Attach decoded user info to request
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

// Routes
router.get('/stock', authenticateToken, productController.getAllProducts);
router.post('/stock', authenticateToken, productController.createProduct);
router.put('/stock/:id', authenticateToken, productController.updateProduct);
router.delete('/stock/:id', authenticateToken, productController.deleteProduct);

module.exports = router;