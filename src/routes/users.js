const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - Get all users (paginated)
router.get('/', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [users] = await db.query(
      `SELECT id, username, email, name, role, active, created_at, last_login 
       FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [size, offset]
    );

    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM users');

    res.json({
      success: true,
      data: {
        content: users,
        totalElements: total,
        totalPages: Math.ceil(total / size),
        page,
        size
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/profile - Get current user profile
router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const [users] = await db.query(
      'SELECT id, username, email, name, role, active, created_at, last_login FROM users WHERE id = ?',
      [req.user.id]
    );

    res.json({ success: true, data: users[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/profile - Update current user profile
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { name, email } = req.body;

    await db.query(
      'UPDATE users SET name = ?, email = ?, updated_at = NOW() WHERE id = ?',
      [name, email, req.user.id]
    );

    const [users] = await db.query(
      'SELECT id, username, email, name, role, active FROM users WHERE id = ?',
      [req.user.id]
    );

    res.json({ success: true, data: users[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    // Allow users to view their own profile, or admins to view anyone
    if (req.user.id !== req.params.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const [users] = await db.query(
      'SELECT id, username, email, name, role, active, created_at, last_login FROM users WHERE id = ?',
      [req.params.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: users[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/users - Create user
router.post('/', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const { username, email, password, name, role } = req.body;

    if (!username || !email || !password || !name || !role) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await db.query(
      `INSERT INTO users (id, username, email, password, name, role, active, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, true, NOW())`,
      [id, username, email, hashedPassword, name, role]
    );

    res.status(201).json({
      success: true,
      data: { id, username, email, name, role, active: true }
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    // Allow users to update their own profile, or admins to update anyone
    if (req.user.id !== req.params.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { name, email, role, password } = req.body;

    let query = 'UPDATE users SET name = ?, email = ?, updated_at = NOW()';
    let params = [name, email];

    // Only admin can change role
    if (req.user.role === 'ADMIN' && role) {
      query += ', role = ?';
      params.push(role);
    }

    // Update password if provided
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = ?';
      params.push(hashedPassword);
    }

    query += ' WHERE id = ?';
    params.push(req.params.id);

    await db.query(query, params);

    const [users] = await db.query(
      'SELECT id, username, email, name, role, active FROM users WHERE id = ?',
      [req.params.id]
    );

    res.json({ success: true, data: users[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:id - Deactivate user
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    await db.query('UPDATE users SET active = false, updated_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/users/:id/activate - Activate user
router.patch('/:id/activate', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    await db.query('UPDATE users SET active = true, updated_at = NOW() WHERE id = ?', [req.params.id]);

    const [users] = await db.query(
      'SELECT id, username, email, name, role, active FROM users WHERE id = ?',
      [req.params.id]
    );

    res.json({ success: true, data: users[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/role/:role - Get users by role
router.get('/role/:role', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [users] = await db.query(
      `SELECT id, username, email, name, role, active, created_at 
       FROM users WHERE role = ? LIMIT ? OFFSET ?`,
      [req.params.role, size, offset]
    );

    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM users WHERE role = ?', [req.params.role]);

    res.json({
      success: true,
      data: {
        content: users,
        totalElements: total,
        totalPages: Math.ceil(total / size),
        page,
        size
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/stats - Get user statistics
router.get('/stats', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM users');
    const [[{ active }]] = await db.query('SELECT COUNT(*) as active FROM users WHERE active = true');

    res.json({
      success: true,
      data: { totalUsers: total, activeUsers: active }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
