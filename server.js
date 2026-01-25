const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// ✅ CRITICAL: Configure CORS properly
app.use(cors({
  origin: '*', // For development - restrict in production
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' })); // ✅ Increase JSON payload limit
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ CRITICAL: Set request timeouts
app.use((req, res, next) => {
  req.setTimeout(30000); // 30 seconds
  res.setTimeout(30000);
  next();
});

// ✅ Rate limiting (install: npm install express-rate-limit)
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// ✅ Health check endpoint
app.get('/health', (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  res.json({
    status: mongoState === 1 ? 'healthy' : 'unhealthy',
    mongodb: states[mongoState],
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
    },
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/product', require('./routes/stockRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/services', require('./routes/ServiceRoutes'));
app.use('/api/favorites', require('./routes/favoritesRoutes'));
app.use('/api/reservations', require('./routes/reservationRoutes'));
app.use('/api/admin', require('./routes/AdminRoutes'));
app.use('/api/loyalty', require('./routes/loyaltyRoutes'));
app.use('/api/owner', require('./routes/ownerRoutes'));
app.use('/api/barbershops', require('./routes/barbershopRoutes'));
app.use('/api/personnel', require('./routes/personnelRoutes'));
app.use('/api/trustedCode', require('./routes/trustedCodeRoutes'));
app.use('/api/notifications', require('./routes/notifications'));

// ✅ Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ✅ MongoDB connection with OPTIMIZED settings
mongoose.connect(process.env.MONGO_URI, {
  // ✅ CRITICAL: Increase connection pool
  maxPoolSize: 50, // Default is 10
  minPoolSize: 10,
  
  // ✅ Connection timeouts
  serverSelectionTimeoutMS: 10000, // 10 seconds
  socketTimeoutMS: 45000, // 45 seconds
  
  // ✅ Connection management
  maxIdleTimeMS: 30000, // Close idle connections after 30s
  
  // ✅ Retry logic
  retryWrites: true,
  retryReads: true,
  
  // ✅ Compression for better performance
  compressors: 'zlib',
})
  .then(() => {
    console.log('✅ MongoDB connected with optimized pool');
    console.log('📊 Pool size: 50 max, 10 min');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ✅ MongoDB connection monitoring
mongoose.connection.on('connected', () => {
  console.log('📊 Mongoose connected to DB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ Mongoose disconnected');
});

// ✅ Graceful shutdown
process.on('SIGINT', async () => {
  console.log('⚠️ SIGINT received, closing MongoDB connection...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM received, closing MongoDB connection...');
  await mongoose.connection.close();
  process.exit(0);
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

// ✅ CRITICAL: Configure server for better concurrent connections
server.keepAliveTimeout = 65000; // 65 seconds
server.headersTimeout = 66000; // Must be > keepAliveTimeout
server.timeout = 120000; // 2 minutes overall timeout
server.maxHeadersCount = 2000; // Increase max headers

// ✅ Monitor memory usage
setInterval(() => {
  const used = process.memoryUsage();
  console.log('💾 Memory:', {
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heap: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
  });
}, 300000); // Every 5 minutes