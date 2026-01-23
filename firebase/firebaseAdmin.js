const admin = require("firebase-admin");

const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!jsonEnv) {
  console.error("❌ Missing FIREBASE_SERVICE_ACCOUNT_JSON");
  process.exit(1);
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(jsonEnv);

  // 🔥 THIS LINE FIXES EVERYTHING
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

} catch (err) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  console.error(err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log("✅ Firebase Admin initialized");

module.exports = admin;
