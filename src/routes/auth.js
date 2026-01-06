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

// POST /api/auth/login - UPDATED to accept both email and username
router.post('/login', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Accept either username or email
    const loginIdentifier = username || email;
    
    if (!loginIdentifier || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username/Email and password are required' 
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

    // Generate access token
    const accessToken = jwt.sign(
      { 
        userId: user.id, 
        username: user.username, 
        email: user.email,
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

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

    res.json({
      success: true,
      data: {
        token: accessToken,
        refreshToken,
        user: userWithoutPassword
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password, name, role = 'CASHIER', phone } = req.body;

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

    await query(
      `INSERT INTO users (id, username, email, password, name, role, phone, active, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, CURRENT_TIMESTAMP)`,
      [id, username, email, hashedPassword, name, role, phone || null]
    );

    // Generate tokens
    const accessToken = jwt.sign(
      { userId: id, username, email, role },
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
          role, 
          phone: phone || null,
          active: true 
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me - Get current user profile
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [users] = await query(
      'SELECT id, username, email, name, role, phone, active, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      data: users[0]
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  // In a stateless JWT system, client just removes the token
  // For refresh token invalidation, you might want to implement a blacklist
  res.json({ 
    success: true, 
    message: 'Logged out successfully' 
  });
});

// POST /api/auth/refresh - Refresh access token
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
      'SELECT id, username, email, role, active FROM users WHERE id = $1',
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

    // Generate new access token
    const newAccessToken = jwt.sign(
      { 
        userId: user.id, 
        username: user.username, 
        email: user.email,
        role: user.role 
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

// POST /api/auth/change-password
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

// POST /api/auth/forgot-password
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

    // In a real app, you would send an email here
    // For now, we'll just return the token (in development)
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

// POST /api/auth/reset-password
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