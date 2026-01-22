const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

// Get the path from .env
const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);

// Load the JSON file
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
