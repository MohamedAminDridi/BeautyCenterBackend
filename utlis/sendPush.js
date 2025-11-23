// utils/sendPush.js
const admin = require('../firebase/firebaseAdmin');

async function sendPushNotification(fcmToken, title, body, data = {}) {
  const message = {
    token: fcmToken,
    notification: { title, body },
    android: { priority: "high" },
    data,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("Push sent:", response);
    return { ok: true, response };
  } catch (error) {
    console.error("Push error:", error);
    return { ok: false, error };
  }
}

module.exports = sendPushNotification;
