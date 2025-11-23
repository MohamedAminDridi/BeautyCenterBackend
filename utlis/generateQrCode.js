// utils/generateQrCode.js
const QRCode = require('qrcode');

const generateQrCode = async (code) => {
  return await QRCode.toDataURL(code); // returns base64 image
};

module.exports = generateQrCode;
