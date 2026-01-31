const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || process.env.APPLICATION_SECURITY_JWT_SECRET_KEY || 'your-secret-key';

/**
 * Verify JWT token and attach user to request
 */
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

/**
 * Role-based authorization
 * Usage: authorize('ADMIN', 'MANAGER')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    // Super Admin has access to everything
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
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

/**
 * Admin-only middleware (Business Admin or Super Admin)
 */
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Not authenticated' 
    });
  }

  if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ 
      success: false, 
      error: 'Admin access required' 
    });
  }

  next();
};

/**
 * Staff middleware (Admin, Manager, Pharmacist)
 */
const isStaff = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Not authenticated' 
    });
  }

  const staffRoles = ['ADMIN', 'MANAGER', 'PHARMACIST', 'SUPER_ADMIN'];
  if (!staffRoles.includes(req.user.role)) {
    return res.status(403).json({ 
      success: false, 
      error: 'Staff access required' 
    });
  }

  next();
};

/**
 * Super Admin middleware - checks if user has SUPER_ADMIN role
 */
const isSuperAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Not authenticated' 
    });
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ 
      success: false, 
      error: 'Super admin access required' 
    });
  }

  next();
};

/**
 * Business context middleware - ensures user has access to business data
 * Attaches business info to request for queries to filter by business_id
 */
const requireBusinessContext = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    // Super Admin can access all data (no business filter)
    if (req.user.role === 'SUPER_ADMIN') {
      req.businessId = null; // null means access to all
      return next();
    }

    // Regular users must have a business_id
    if (!req.user.business_id) {
      return res.status(403).json({
        success: false,
        error: 'NO_BUSINESS_CONTEXT',
        message: 'You are not associated with any business'
      });
    }

    // Get business status
    const [businesses] = await query(
      'SELECT id, name, status FROM businesses WHERE id = $1',
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

    if (business.status === 'pending') {
      return res.status(403).json({
        success: false,
        error: 'BUSINESS_PENDING',
        message: 'This business account is pending activation'
      });
    }

    // Attach business info to request
    req.businessId = req.user.business_id;
    req.businessName = business.name;

    next();
  } catch (error) {
    console.error('Business context error:', error);
    next(error);
  }
};

/**
 * Optional business context - doesn't fail if no business, just sets businessId
 */
const optionalBusinessContext = async (req, res, next) => {
  try {
    if (req.user && req.user.business_id) {
      req.businessId = req.user.business_id;
    } else {
      req.businessId = null;
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { 
  authenticate, 
  authorize, 
  isAdmin, 
  isStaff,
  isSuperAdmin,
  requireBusinessContext,
  optionalBusinessContext
};
