const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// Helper to normalize user data
const normalizeUser = (user) => {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    phone: user.phone || '',
    isActive: user.active,
    createdAt: user.created_at,
    lastLogin: user.last_login,
    updatedAt: user.updated_at
  };
};

// GET /api/users/profile - Get current user profile
router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const [users] = await query(
      'SELECT id, username, email, name, role, phone, active, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );

    res.json({ 
      success: true, 
      data: normalizeUser(users[0]) 
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/profile - Update current user profile
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { name, email, phone } = req.body;

    await query(
      'UPDATE users SET name = $1, email = $2, phone = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
      [name, email, phone || null, req.user.id]
    );

    const [users] = await query(
      'SELECT id, username, email, name, role, phone, active FROM users WHERE id = $1',
      [req.user.id]
    );

    res.json({ 
      success: true, 
      data: normalizeUser(users[0]) 
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/stats - Get user statistics
router.get('/stats', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const [totalResult] = await query('SELECT COUNT(*) as total FROM users');
    const [activeResult] = await query('SELECT COUNT(*) as active FROM users WHERE active = true');
    
    // Get counts by role
    const [roleCounts] = await query(`
      SELECT role, COUNT(*) as count FROM users GROUP BY role
    `);

    const roleBreakdown = {
      adminUsersCount: 0,
      managerUsersCount: 0,
      pharmacistUsersCount: 0,
      cashierUsersCount: 0
    };

    roleCounts.forEach(r => {
      const roleKey = `${r.role.toLowerCase()}UsersCount`;
      if (roleBreakdown.hasOwnProperty(roleKey)) {
        roleBreakdown[roleKey] = parseInt(r.count);
      }
    });

    res.json({
      success: true,
      data: { 
        totalUsersCount: parseInt(getFirst(totalResult).total) || 0, 
        activeUsersCount: parseInt(getFirst(activeResult).active) || 0,
        inactiveUsersCount: (parseInt(getFirst(totalResult).total) || 0) - (parseInt(getFirst(activeResult).active) || 0),
        ...roleBreakdown
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/role/:role - Get users by role
router.get('/role/:role', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let queryText = `
      SELECT id, username, email, name, role, phone, active, created_at, last_login 
      FROM users 
      WHERE role = $1
    `;
    let queryCount = 'SELECT COUNT(*) as total FROM users WHERE role = $1';
    let params = [req.params.role];
    let paramCount = 1;

    if (search) {
      paramCount++;
      queryText += ` AND (name ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
      queryCount += ` AND (name ILIKE $2 OR email ILIKE $2)`;
      params.push(`%${search}%`);
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [users] = await query(queryText, params);
    const [countResult] = await query(queryCount, params.slice(0, search ? 2 : 1));
    
    const total = parseInt(getFirst(countResult).total) || 0;

    res.json({
      success: true,
      data: users.map(normalizeUser),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users - Get all users (paginated)
router.get('/', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const role = req.query.role;

    let queryText = `
      SELECT id, username, email, name, role, phone, active, created_at, last_login 
      FROM users 
      WHERE 1=1
    `;
    
    let queryCount = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    let params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      queryText += ` AND (name ILIKE $${paramCount} OR email ILIKE $${paramCount} OR phone ILIKE $${paramCount})`;
      queryCount += ` AND (name ILIKE $${paramCount} OR email ILIKE $${paramCount} OR phone ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (role) {
      paramCount++;
      queryText += ` AND role = $${paramCount}`;
      queryCount += ` AND role = $${paramCount}`;
      params.push(role);
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [users] = await query(queryText, params);
    const [countResult] = await query(queryCount, params.slice(0, search || role ? params.length - 2 : 0));
    
    const total = parseInt(getFirst(countResult).total) || 0;

    res.json({
      success: true,
      data: users.map(normalizeUser),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
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

    const [users] = await query(
      'SELECT id, username, email, name, role, phone, active, created_at, last_login FROM users WHERE id = $1',
      [req.params.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ 
      success: true, 
      data: normalizeUser(users[0]) 
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/users - Create user
router.post('/', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;

    console.log('Creating user with data:', { name, email, password, role, phone });

    if (!name || !email || !password || !role) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name, email, password, and role are required' 
      });
    }

    // Generate username from email
    const username = email.split('@')[0];

    // Check if user already exists
    const [existing] = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Email already exists' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await query(
      `INSERT INTO users (id, username, email, password, name, role, phone, active, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, username, email, hashedPassword, name, role.toUpperCase(), phone || null]
    );

    const [newUser] = await query(
      'SELECT id, username, email, name, role, phone, active, created_at FROM users WHERE id = $1',
      [id]
    );

    res.status(201).json({
      success: true,
      data: normalizeUser(newUser[0])
    });
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === '23505') {
      return res.status(409).json({ 
        success: false, 
        error: 'Email already exists' 
      });
    }
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

    const { name, email, role, phone, password, isActive } = req.body;

    let queryText = 'UPDATE users SET name = $1, email = $2, phone = $3, updated_at = CURRENT_TIMESTAMP';
    let params = [name, email, phone || null];
    let paramIndex = 3;

    // Only admin can change role and active status
    if (req.user.role === 'ADMIN') {
      if (role) {
        paramIndex++;
        queryText += `, role = $${paramIndex}`;
        params.push(role.toUpperCase());
      }
      if (isActive !== undefined) {
        paramIndex++;
        queryText += `, active = $${paramIndex}`;
        params.push(isActive);
      }
    }

    // Update password if provided
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      paramIndex++;
      queryText += `, password = $${paramIndex}`;
      params.push(hashedPassword);
    }

    paramIndex++;
    queryText += ` WHERE id = $${paramIndex}`;
    params.push(req.params.id);

    await query(queryText, params);

    const [users] = await query(
      'SELECT id, username, email, name, role, phone, active, created_at FROM users WHERE id = $1',
      [req.params.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ 
      success: true, 
      data: normalizeUser(users[0]) 
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:id - Deactivate user
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    // Prevent deleting own account
    if (req.user.id === req.params.id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot deactivate your own account' 
      });
    }

    await query(
      'UPDATE users SET active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', 
      [req.params.id]
    );
    
    res.json({ 
      success: true, 
      message: 'User deactivated successfully' 
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/users/:id/activate - Activate user
router.patch('/:id/activate', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    await query(
      'UPDATE users SET active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', 
      [req.params.id]
    );

    const [users] = await query(
      'SELECT id, username, email, name, role, phone, active FROM users WHERE id = $1',
      [req.params.id]
    );

    res.json({ 
      success: true, 
      data: normalizeUser(users[0]) 
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;