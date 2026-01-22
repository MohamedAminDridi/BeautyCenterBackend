const admin = require("firebase-admin");

/**
 * On Render, Heroku, Vercel, Railway...
 * You MUST provide FIREBASE_SERVICE_ACCOUNT_JSON
 * as a SINGLE ENVIRONMENT VARIABLE containing the JSON string.
 */

const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!jsonEnv) {
  console.error("❌ Missing FIREBASE_SERVICE_ACCOUNT_JSON in environment");
  process.exit(1);
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(jsonEnv.trim());
} catch (err) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  console.error(err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log("✅ Firebase Admin initialized with ENV JSON");

module.exports = admin;
