// src/firebase/firebaseAdmin.js
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Must exist ONLY in your local machine or server — NEVER in GitHub
const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!keyPath) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT_PATH not found in .env");
  process.exit(1);
}

const resolvedPath = path.resolve(keyPath);

if (!fs.existsSync(resolvedPath)) {
  console.error("❌ Firebase key file not found:", resolvedPath);
  process.exit(1);
}

const serviceAccount = JSON.parse(
  fs.readFileSync(resolvedPath, "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log("✅ Firebase Admin initialized.");

module.exports = admin;
