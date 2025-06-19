const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload'); // path to multer setup

const { registerUser, loginUser } = require('../controllers/authController');
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, 'uploads/'),
//   filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
// });
// const upload = multer({ storage });
router.post('/login', loginUser);
router.post('/register', upload.single('profileImage'), registerUser);

module.exports = router;
