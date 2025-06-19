const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// Middleware to protect routes (assuming JWT authentication)
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1]; // Extract token from "Bearer <token>"
  if (!token) return res.status(401).json({ error: 'Access denied' });
  // Verify token (implement your JWT verification logic here)
  // Example: jwt.verify(token, 'your-secret-key');
  next();
};

// Routes
router.get('/stock', authenticateToken, productController.getAllProducts);
router.post('/stock', authenticateToken, productController.createProduct);
router.put('/stock/:id', authenticateToken, productController.updateProduct);
router.delete('/stock/:id', authenticateToken, productController.deleteProduct);

module.exports = router;