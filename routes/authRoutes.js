const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload'); // your multer setup

const { registerUser, loginUser } = require('../controllers/authController');
const { registerOwner } = require('../controllers/ownerController');
const { registerPersonnel } = require('../controllers/personnelController');  // <--- Add this import

router.post('/login', loginUser);
router.post('/register', upload.single('profileImage'), registerUser);
router.post('/register-owner', registerOwner);
router.post('/register-personnel', registerPersonnel);  // This will now work

module.exports = router;
