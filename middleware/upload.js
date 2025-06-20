const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../utlis/cloudinary'); // adjust path if needed

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'users',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    public_id: (req, file) => Date.now() + '-profile',
  },
});

const upload = multer({ storage });

module.exports = upload;
