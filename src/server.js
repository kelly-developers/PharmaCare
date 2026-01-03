require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./middleware/errorHandler');
const { initializeDatabase } = require('./scripts/initDatabase');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const medicineRoutes = require('./routes/medicines');
const supplierRoutes = require('./routes/suppliers');
const stockRoutes = require('./routes/stock');
const saleRoutes = require('./routes/sales');
const expenseRoutes = require('./routes/expenses');
const prescriptionRoutes = require('./routes/prescriptions');
const purchaseOrderRoutes = require('./routes/purchaseOrders');
const employeeRoutes = require('./routes/employees');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true,
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/reports', reportRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Initialize database (create tables, admin user, etc.)
    await initializeDatabase();
    
    // Start the server
    app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('╔══════════════════════════════════════════════════════════╗');
      console.log('║                                                          ║');
      console.log('║   🏥 PharmaCare Backend Server                           ║');
      console.log(`║   🚀 Running on port ${PORT}                                ║`);
      console.log('║   📍 Environment: ' + (process.env.NODE_ENV || 'development').padEnd(29) + '    ║');
      console.log('║                                                          ║');
      console.log('╚══════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('Endpoints:');
      console.log(`  Health Check: /health`);
      console.log(`  API Health:   /api/health`);
      console.log(`  Auth:         /api/auth/*`);
      console.log(`  Users:        /api/users/*`);
      console.log(`  Categories:   /api/categories/*`);
      console.log(`  Medicines:    /api/medicines/*`);
      console.log(`  Suppliers:    /api/suppliers/*`);
      console.log(`  Stock:        /api/stock/*`);
      console.log(`  Sales:        /api/sales/*`);
      console.log(`  Expenses:     /api/expenses/*`);
      console.log(`  Prescriptions:/api/prescriptions/*`);
      console.log(`  PO:           /api/purchase-orders/*`);
      console.log(`  Employees:    /api/employees/*`);
      console.log(`  Reports:      /api/reports/*`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
