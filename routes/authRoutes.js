const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload'); // path to multer setup
const { registerOwner } = require('../controllers/ownerController'); // 👈 New controller

const { registerUser, loginUser } = require('../controllers/authController');
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, 'uploads/'),
//   filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
// });
// const upload = multer({ storage });
router.post('/login', loginUser);
router.post('/register', upload.single('profileImage'), registerUser);
router.post('/register-owner', registerOwner);
router.post('/register-personnel', registerPersonnel);

module.exports = router;
