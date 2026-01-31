const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || process.env.APPLICATION_SECURITY_JWT_SECRET_KEY || 'your-secret-key';

// Verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'No token provided' 
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if token is access token (not refresh or reset token)
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token type' 
      });
    }

    // Get user from database
    const [users] = await query(
      'SELECT id, username, email, role, active, business_id FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const user = users[0];

    if (!user.active) {
      return res.status(401).json({ 
        success: false, 
        error: 'User account is deactivated' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Token expired' 
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token' 
      });
    }
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication failed' 
    });
  }
};

// Role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        error: `Access denied. Required roles: ${roles.join(', ')}` 
      });
    }

    next();
  };
};

// Admin-only middleware
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Not authenticated' 
    });
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ 
      success: false, 
      error: 'Admin access required' 
    });
  }

  next();
};

// Staff middleware (Admin, Manager, Pharmacist)
const isStaff = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Not authenticated' 
    });
  }

  const staffRoles = ['ADMIN', 'MANAGER', 'PHARMACIST'];
  if (!staffRoles.includes(req.user.role)) {
    return res.status(403).json({ 
      success: false, 
      error: 'Staff access required' 
    });
  }

  next();
};

// Super Admin middleware - checks environment-based super admin
const isSuperAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Not authenticated' 
    });
  }

  // Check if user is the super admin (from env vars)
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  
  if (!superAdminEmail) {
    return res.status(403).json({ 
      success: false, 
      error: 'Super admin not configured' 
    });
  }

  if (req.user.email !== superAdminEmail) {
    return res.status(403).json({ 
      success: false, 
      error: 'Super admin access required' 
    });
  }

  next();
};

// Tenant middleware - sets search path based on user's business
const setTenantContext = async (req, res, next) => {
  try {
    if (!req.user || !req.user.business_id) {
      return next(); // No tenant context needed
    }

    // Get business schema
    const [businesses] = await query(
      'SELECT schema_name, status FROM businesses WHERE id = $1',
      [req.user.business_id]
    );

    if (businesses.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'BUSINESS_NOT_FOUND',
        message: 'Associated business not found'
      });
    }

    const business = businesses[0];

    if (business.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'BUSINESS_SUSPENDED',
        message: 'This business account has been suspended'
      });
    }

    if (business.status === 'inactive') {
      return res.status(403).json({
        success: false,
        error: 'BUSINESS_INACTIVE',
        message: 'This business account is inactive'
      });
    }

    // Store tenant info in request
    req.tenant = {
      businessId: req.user.business_id,
      schemaName: business.schema_name
    };

    next();
  } catch (error) {
    console.error('Tenant context error:', error);
    next(error);
  }
};

module.exports = { 
  authenticate, 
  authorize, 
  isAdmin, 
  isStaff,
  isSuperAdmin,
  setTenantContext
};