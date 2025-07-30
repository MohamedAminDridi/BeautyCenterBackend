const express = require('express');
const jwt = require('jsonwebtoken');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const cloudinary = require('../utlis/cloudinary'); // Make sure this path is correct

const router = express.Router();

// 1. CONFIGURE CLOUDINARY STORAGE
// This setup uses a dynamic public_id to ensure unique filenames.
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'profile_images', // Specify a folder in Cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png'],
    public_id: (req, file) => {
      // Create a unique public_id. Here we use the user's ID and the current timestamp.
      // req.user is available because authenticateToken runs first.
      const userId = req.user ? req.user.id : 'unknown';
      return `${userId}-${Date.now()}`;
    },
  },
});

const upload = multer({ storage: storage });


// 2. DEFINE AUTHENTICATION MIDDLEWARE2
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token.' });
    }
    req.user = user; // Attach user payload to the request object
    next();
  });
};


// 3. CREATE THE UPLOAD ENDPOINT
// This is the missing piece.
router.post(
  '/',
  authenticateToken,          // First, verify the user is logged in
  upload.single('image'),     // Second, handle the upload. 'image' must match the field name in your FormData.
  (req, res) => {             // Third, this function runs AFTER the upload is complete
    
    // After multer-storage-cloudinary runs, the file info is in req.file
    if (!req.file) {
      return res.status(400).json({ message: 'File upload failed. Please try again.' });
    }

    // The upload was successful, send back the URL and public ID from Cloudinary
    res.status(200).json({
      message: 'File uploaded successfully!',
      imageUrl: req.file.path, // This is the final URL from Cloudinary
      publicId: req.file.filename, // This is the public_id
    });
  }
);

module.exports = router;