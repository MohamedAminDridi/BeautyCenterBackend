const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(403).json({ message: "Access denied: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  // Vérifier si JWT_SECRET est défini
  if (!process.env.JWT_SECRET) {
    console.error("❌ Configuration Error: JWT_SECRET is not defined in environment variables");
    return res.status(500).json({ message: "Server configuration error" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.id) {
      return res.status(401).json({ message: "Unauthorized: No user ID in token" });
    }

    req.user = {
      id: decoded.id,
      role: decoded.role || 'client', // Default to client if not provided
    };

    console.log("🔐 Authenticated user:", req.user);
    next();
  } catch (error) {
    console.error("❌ JWT Error:", error.name, error.message, error.stack);
    let errorMessage = "Invalid or expired token";
    if (error.name === "JsonWebTokenError") {
      errorMessage = "Invalid token signature";
    } else if (error.name === "TokenExpiredError") {
      errorMessage = "Token has expired";
    }
    res.status(401).json({ message: errorMessage });
  }
};

module.exports = authMiddleware;