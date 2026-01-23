const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload'); // your multer setup
const authMiddleware = require('../middleware/authMiddleware'); // your multer setup

const { registerUser, loginUser, getCurrentUser, approveBarbershop, approvePersonnel } = require('../controllers/authController');
const { registerOwner } = require('../controllers/ownerController');
const { registerPersonnel } = require('../controllers/personnelController');  // <--- Add this import

router.post('/login', loginUser);
router.post('/register', registerUser);
router.post('/register-owner', registerOwner);
router.post('/register-personnel', registerPersonnel);  // This will now work
router.get('/me', authMiddleware, getCurrentUser); // Add this line
router.post('/approve-barbershop', authMiddleware, approveBarbershop);
router.post('/approve-personnel', authMiddleware, approvePersonnel);

module.exports = router;
