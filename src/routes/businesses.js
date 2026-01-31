const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, pool, config } = require('../config/database');
const { authenticate, isSuperAdmin, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/businesses - List all businesses (Super Admin only)
router.get('/', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, type, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (type) {
      whereClause += ` AND business_type = $${paramIndex++}`;
      params.push(type);
    }
    if (search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex++})`;
      params.push(`%${search}%`);
    }

    // Get total count
    const [countResult] = await query(
      `SELECT COUNT(*) as total FROM businesses WHERE 1=1 ${whereClause}`,
      params
    );
    const total = parseInt(countResult[0]?.total || 0);

    // Get businesses with user count
    params.push(parseInt(limit), offset);
    const [businesses] = await query(
      `SELECT b.*, 
              (SELECT COUNT(*) FROM users u WHERE u.business_id = b.id) as users_count
       FROM businesses b 
       WHERE 1=1 ${whereClause}
       ORDER BY b.created_at DESC 
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    res.json({
      success: true,
      data: {
        businesses,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/businesses/stats - Business statistics (Super Admin only)
router.get('/stats', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const [stats] = await query(`
      SELECT 
        COUNT(*) as total_businesses,
        COUNT(*) FILTER (WHERE status = 'active') as active_businesses,
        COUNT(*) FILTER (WHERE status = 'suspended') as suspended_businesses,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive_businesses,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_businesses,
        COUNT(*) FILTER (WHERE business_type = 'pharmacy') as pharmacy_count,
        COUNT(*) FILTER (WHERE business_type = 'general') as general_count,
        COUNT(*) FILTER (WHERE business_type = 'supermarket') as supermarket_count,
        COUNT(*) FILTER (WHERE business_type = 'retail') as retail_count
      FROM businesses
    `);

    // Get total users count
    const [userStats] = await query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE role = 'ADMIN') as admin_count,
        COUNT(*) FILTER (WHERE role != 'SUPER_ADMIN' AND business_id IS NOT NULL) as business_users
      FROM users
    `);

    res.json({
      success: true,
      data: {
        totalBusinesses: parseInt(stats[0]?.total_businesses || 0),
        activeBusinesses: parseInt(stats[0]?.active_businesses || 0),
        suspendedBusinesses: parseInt(stats[0]?.suspended_businesses || 0),
        inactiveBusinesses: parseInt(stats[0]?.inactive_businesses || 0),
        pendingBusinesses: parseInt(stats[0]?.pending_businesses || 0),
        pharmacyCount: parseInt(stats[0]?.pharmacy_count || 0),
        generalCount: parseInt(stats[0]?.general_count || 0),
        supermarketCount: parseInt(stats[0]?.supermarket_count || 0),
        retailCount: parseInt(stats[0]?.retail_count || 0),
        totalUsers: parseInt(userStats[0]?.total_users || 0),
        adminCount: parseInt(userStats[0]?.admin_count || 0),
        businessUsers: parseInt(userStats[0]?.business_users || 0)
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/businesses - Create new business (Super Admin only)
// NOTE: No schema is created - uses business_id for multi-tenancy
router.post('/', authenticate, isSuperAdmin, async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    const {
      name,
      email,
      phone,
      businessType,
      address,
      city,
      country,
      adminName,
      adminEmail,
      adminPassword,
      subscriptionPlan = 'basic'
    } = req.body;

    // Validate required fields
    if (!name || !email || !businessType || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, email, businessType, adminName, adminEmail, adminPassword'
      });
    }

    // Validate business type
    const validTypes = ['pharmacy', 'general', 'supermarket', 'retail'];
    if (!validTypes.includes(businessType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid business type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Validate subscription plan
    const validPlans = ['free', 'basic', 'premium', 'enterprise'];
    if (!validPlans.includes(subscriptionPlan)) {
      return res.status(400).json({
        success: false,
        error: `Invalid subscription plan. Must be one of: ${validPlans.join(', ')}`
      });
    }

    // Check if business email already exists
    const [existingBusiness] = await query(
      'SELECT id FROM businesses WHERE email = $1',
      [email]
    );

    if (existingBusiness.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'BUSINESS_EMAIL_EXISTS',
        message: 'A business with this email already exists'
      });
    }

    // Check if admin email already exists
    const [existingAdmin] = await query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );

    if (existingAdmin.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'ADMIN_EMAIL_EXISTS',
        message: 'A user with this admin email already exists'
      });
    }

    await client.query('BEGIN');

    // Create business record (auto-generated UUID as business_id)
    const businessId = uuidv4();
    await client.query(
      `INSERT INTO businesses (
        id, name, email, phone, business_type, 
        address, city, country, subscription_plan, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', CURRENT_TIMESTAMP)`,
      [businessId, name, email, phone, businessType, address, city, country, subscriptionPlan]
    );

    // Create admin user for the business
    const adminId = uuidv4();
    const adminUsername = adminEmail.split('@')[0] + '_' + businessId.substring(0, 8);
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await client.query(
      `INSERT INTO users (id, username, email, password, name, role, active, business_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'ADMIN', true, $6, CURRENT_TIMESTAMP)`,
      [adminId, adminUsername, adminEmail, hashedPassword, adminName, businessId]
    );

    // Update business with owner_id
    await client.query(
      'UPDATE businesses SET owner_id = $1 WHERE id = $2',
      [adminId, businessId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        id: businessId,
        name,
        email,
        phone,
        businessType,
        subscriptionPlan,
        status: 'active',
        createdAt: new Date().toISOString(),
        adminUser: {
          id: adminId,
          username: adminUsername,
          email: adminEmail,
          name: adminName,
          role: 'ADMIN'
        }
      },
      message: 'Business created successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// GET /api/businesses/:id - Get business by ID (Super Admin only)
router.get('/:id', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [businesses] = await query(
      `SELECT b.*,
              (SELECT COUNT(*) FROM users u WHERE u.business_id = b.id) as users_count
       FROM businesses b
       WHERE b.id = $1`,
      [id]
    );

    if (businesses.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'BUSINESS_NOT_FOUND',
        message: 'Business not found'
      });
    }

    // Get admin users for this business
    const [admins] = await query(
      `SELECT id, username, email, name, role, active, last_login, created_at 
       FROM users WHERE business_id = $1 AND role = 'ADMIN'`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...businesses[0],
        admins
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/businesses/:id/users - Get all users for a business (Super Admin only)
router.get('/:id/users', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, role } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'WHERE business_id = $1';
    const params = [id];
    let paramIndex = 2;

    if (role) {
      whereClause += ` AND role = $${paramIndex++}`;
      params.push(role);
    }

    const [countResult] = await query(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    );
    const total = parseInt(countResult[0]?.total || 0);

    params.push(parseInt(limit), offset);
    const [users] = await query(
      `SELECT id, username, email, name, phone, role, active, last_login, created_at 
       FROM users ${whereClause}
       ORDER BY created_at DESC 
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    res.json({
      success: true,
      data: {
        users,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/businesses/:id - Update business (Super Admin only)
router.put('/:id', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, city, country, logo, subscriptionPlan } = req.body;

    const [existing] = await query('SELECT id FROM businesses WHERE id = $1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'BUSINESS_NOT_FOUND',
        message: 'Business not found'
      });
    }

    await query(
      `UPDATE businesses SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        address = COALESCE($4, address),
        city = COALESCE($5, city),
        country = COALESCE($6, country),
        logo = COALESCE($7, logo),
        subscription_plan = COALESCE($8, subscription_plan),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $9`,
      [name, email, phone, address, city, country, logo, subscriptionPlan, id]
    );

    const [updated] = await query('SELECT * FROM businesses WHERE id = $1', [id]);

    res.json({
      success: true,
      data: updated[0],
      message: 'Business updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/businesses/:id - Deactivate business (Super Admin only)
router.delete('/:id', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [existing] = await query('SELECT id FROM businesses WHERE id = $1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'BUSINESS_NOT_FOUND',
        message: 'Business not found'
      });
    }

    await query(
      `UPDATE businesses SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    // Deactivate all users of this business
    await query(
      `UPDATE users SET active = false WHERE business_id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Business deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/businesses/:id/activate - Activate business (Super Admin only)
router.post('/:id/activate', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [existing] = await query('SELECT id FROM businesses WHERE id = $1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'BUSINESS_NOT_FOUND',
        message: 'Business not found'
      });
    }

    await query(
      `UPDATE businesses SET status = 'active', suspension_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    // Reactivate admin users
    await query(
      `UPDATE users SET active = true WHERE business_id = $1 AND role = 'ADMIN'`,
      [id]
    );

    res.json({
      success: true,
      message: 'Business activated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/businesses/:id/suspend - Suspend business (Super Admin only)
router.post('/:id/suspend', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const [existing] = await query('SELECT id FROM businesses WHERE id = $1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'BUSINESS_NOT_FOUND',
        message: 'Business not found'
      });
    }

    await query(
      `UPDATE businesses SET status = 'suspended', suspension_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [reason, id]
    );

    res.json({
      success: true,
      message: 'Business suspended'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/businesses/:id/users - Create user for a business (Business Admin or Super Admin)
router.post('/:id/users', authenticate, async (req, res, next) => {
  try {
    const { id: businessId } = req.params;
    const { username, email, password, name, phone, role = 'CASHIER' } = req.body;

    // Check authorization: Super Admin can create for any business, Business Admin for their own
    const isSuperAdminUser = req.user.role === 'SUPER_ADMIN';
    const isBusinessAdmin = req.user.role === 'ADMIN' && req.user.business_id === businessId;

    if (!isSuperAdminUser && !isBusinessAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only create users for your own business.'
      });
    }

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, password, name'
      });
    }

    // Validate role
    const validRoles = ['ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    // Check if business exists
    const [business] = await query('SELECT id, status FROM businesses WHERE id = $1', [businessId]);
    if (business.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }

    if (business[0].status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Cannot add users to inactive or suspended business'
      });
    }

    // Check if email already exists
    const [existingUser] = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'A user with this email already exists'
      });
    }

    const userId = uuidv4();
    const finalUsername = username || email.split('@')[0] + '_' + businessId.substring(0, 8);
    const hashedPassword = await bcrypt.hash(password, 12);

    await query(
      `INSERT INTO users (id, username, email, password, name, phone, role, active, business_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, CURRENT_TIMESTAMP)`,
      [userId, finalUsername, email, hashedPassword, name, phone, role, businessId]
    );

    res.status(201).json({
      success: true,
      data: {
        id: userId,
        username: finalUsername,
        email,
        name,
        phone,
        role,
        businessId,
        active: true
      },
      message: 'User created successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
