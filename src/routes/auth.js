const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || process.env.APPLICATION_SECURITY_JWT_SECRET_KEY || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * POST /api/auth/login
 * 
 * Universal login endpoint for all user types:
 * - Super Admin (no business_id, role = 'SUPER_ADMIN')
 * - Business Admin (has business_id, role = 'ADMIN')
 * - Business Staff (has business_id, role in ['MANAGER', 'PHARMACIST', 'CASHIER'])
 * 
 * Request body:
 * {
 *   "email": "user@example.com" OR "username": "username",
 *   "password": "password123"
 * }
 * 
 * Response includes user type indicator for frontend routing:
 * - isSuperAdmin: true/false
 * - business: null for super admin, business object for business users
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Accept either username or email
    const loginIdentifier = username || email;
    
    if (!loginIdentifier || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email/Username and password are required' 
      });
    }

    const [users] = await query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [loginIdentifier]
    );

    if (users.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email/username or password' 
      });
    }

    const user = users[0];

    if (!user.active) {
      return res.status(401).json({ 
        success: false, 
        error: 'Account is deactivated. Please contact administrator.' 
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email/username or password' 
      });
    }

    // Check if user is Super Admin
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    // Get business info if user has a business_id
    let businessInfo = null;
    if (user.business_id && !isSuperAdmin) {
      const [businesses] = await query(
        'SELECT id, name, business_type, status, subscription_plan, logo FROM businesses WHERE id = $1',
        [user.business_id]
      );

      if (businesses.length > 0) {
        const business = businesses[0];
        
        // Check if business is suspended or inactive
        if (business.status === 'suspended') {
          return res.status(403).json({
            success: false,
            error: 'BUSINESS_SUSPENDED',
            message: 'Your business account has been suspended. Please contact support.'
          });
        }
        
        if (business.status === 'inactive') {
          return res.status(403).json({
            success: false,
            error: 'BUSINESS_INACTIVE',
            message: 'Your business account is inactive. Please contact support.'
          });
        }

        if (business.status === 'pending') {
          return res.status(403).json({
            success: false,
            error: 'BUSINESS_PENDING',
            message: 'Your business account is pending activation. Please wait for approval.'
          });
        }

        businessInfo = {
          id: business.id,
          name: business.name,
          businessType: business.business_type,
          status: business.status,
          subscriptionPlan: business.subscription_plan,
          logo: business.logo
        };
      }
    }

    // Generate access token
    const tokenPayload = { 
      userId: user.id, 
      username: user.username, 
      email: user.email,
      role: user.role,
      businessId: user.business_id || null,
      isSuperAdmin
    };

    const accessToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Generate refresh token
    const refreshToken = jwt.sign(
      { 
        userId: user.id,
        type: 'refresh'
      },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );

    // Update last login
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', 
      [user.id]
    );

    // Remove password from user object
    const { password: _, ...userWithoutPassword } = user;

    // Build response
    const responseData = {
      token: accessToken,
      refreshToken,
      user: {
        ...userWithoutPassword,
        isSuperAdmin
      },
      // Include business info for business users, null for super admin
      business: businessInfo
    };

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/register
 * 
 * Self-registration endpoint (for public signups)
 * Creates a user without a business (they can be added to a business later)
 */
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password, name, phone } = req.body;

    if (!username || !email || !password || !name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username, email, password, and name are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid email format' 
      });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 6 characters' 
      });
    }

    // Check if user exists
    const [existing] = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Username or email already exists' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const id = uuidv4();

    // Create user without business_id (public registration)
    await query(
      `INSERT INTO users (id, username, email, password, name, phone, role, active, business_id, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, 'CASHIER', true, NULL, CURRENT_TIMESTAMP)`,
      [id, username, email, hashedPassword, name, phone || null]
    );

    // Generate tokens
    const accessToken = jwt.sign(
      { userId: id, username, email, role: 'CASHIER', businessId: null, isSuperAdmin: false },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: id, type: 'refresh' },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      data: {
        token: accessToken,
        refreshToken,
        user: { 
          id, 
          username, 
          email, 
          name, 
          role: 'CASHIER', 
          phone: phone || null,
          active: true,
          businessId: null,
          isSuperAdmin: false
        },
        business: null
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current user profile with business info
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [users] = await query(
      `SELECT id, username, email, name, role, phone, active, business_id, avatar, created_at, last_login 
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const user = users[0];
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    // Get business info if applicable
    let businessInfo = null;
    if (user.business_id && !isSuperAdmin) {
      const [businesses] = await query(
        'SELECT id, name, business_type, status, subscription_plan, logo FROM businesses WHERE id = $1',
        [user.business_id]
      );
      if (businesses.length > 0) {
        businessInfo = {
          id: businesses[0].id,
          name: businesses[0].name,
          businessType: businesses[0].business_type,
          status: businesses[0].status,
          subscriptionPlan: businesses[0].subscription_plan,
          logo: businesses[0].logo
        };
      }
    }

    res.json({
      success: true,
      data: {
        ...user,
        isSuperAdmin,
        business: businessInfo
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, (req, res) => {
  res.json({ 
    success: true, 
    message: 'Logged out successfully' 
  });
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Refresh token is required' 
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    
    if (decoded.type !== 'refresh') {
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

    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    // Generate new access token
    const newAccessToken = jwt.sign(
      { 
        userId: user.id, 
        username: user.username, 
        email: user.email,
        role: user.role,
        businessId: user.business_id,
        isSuperAdmin
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      data: { 
        token: newAccessToken 
      }
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Refresh token expired. Please log in again.' 
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid refresh token' 
      });
    }
    next(error);
  }
});

/**
 * POST /api/auth/change-password
 */
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Current password and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'New password must be at least 6 characters long' 
      });
    }

    // Get current user with password
    const [users] = await query(
      'SELECT password FROM users WHERE id = $1',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const user = users[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'Current password is incorrect' 
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedNewPassword, userId]
    );

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email is required' 
      });
    }

    const [users] = await query(
      'SELECT id, email, name FROM users WHERE email = $1',
      [email]
    );

    if (users.length === 0) {
      // Don't reveal if user exists for security
      return res.json({
        success: true,
        message: 'If an account exists with this email, a reset link will be sent.'
      });
    }

    const user = users[0];

    // Generate password reset token (expires in 1 hour)
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password_reset' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // TODO: Send email with resetLink
    console.log('Password reset link:', resetLink);

    res.json({
      success: true,
      message: 'If an account exists with this email, a reset link will be sent.',
      // Remove this in production
      resetLink: process.env.NODE_ENV === 'development' ? resetLink : undefined
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/reset-password
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Token and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'New password must be at least 6 characters long' 
      });
    }

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      
      if (decoded.type !== 'password_reset') {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid token type' 
        });
      }
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false, 
          error: 'Reset token has expired. Please request a new one.' 
        });
      }
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid reset token' 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, decoded.userId]
    );

    res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
