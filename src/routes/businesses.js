const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, pool, config } = require('../config/database');
const { authenticate, isSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// Validate schema name (alphanumeric + underscore only)
const isValidSchemaName = (name) => {
  return /^[a-z][a-z0-9_]*$/.test(name) && name.length <= 63;
};

// Generate schema name from business name
const generateSchemaName = (businessName) => {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
};

// GET /api/businesses - List all businesses (Super Admin only)
router.get('/', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query;
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

    // Get total count
    const [countResult] = await query(
      `SELECT COUNT(*) as total FROM businesses WHERE 1=1 ${whereClause}`,
      params
    );
    const total = parseInt(countResult[0]?.total || 0);

    // Get businesses
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
        COUNT(*) FILTER (WHERE business_type = 'pharmacy') as pharmacy_count,
        COUNT(*) FILTER (WHERE business_type = 'general') as general_count,
        COUNT(*) FILTER (WHERE business_type = 'supermarket') as supermarket_count,
        COUNT(*) FILTER (WHERE business_type = 'retail') as retail_count
      FROM businesses
    `);

    res.json({
      success: true,
      data: {
        totalBusinesses: parseInt(stats[0]?.total_businesses || 0),
        activeBusinesses: parseInt(stats[0]?.active_businesses || 0),
        suspendedBusinesses: parseInt(stats[0]?.suspended_businesses || 0),
        inactiveBusinesses: parseInt(stats[0]?.inactive_businesses || 0),
        pharmacyCount: parseInt(stats[0]?.pharmacy_count || 0),
        generalCount: parseInt(stats[0]?.general_count || 0),
        supermarketCount: parseInt(stats[0]?.supermarket_count || 0),
        retailCount: parseInt(stats[0]?.retail_count || 0)
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/businesses/check-schema/:schemaName - Check if schema name is available
router.get('/check-schema/:schemaName', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const { schemaName } = req.params;

    if (!isValidSchemaName(schemaName)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SCHEMA_NAME',
        message: 'Schema name must start with a letter and contain only lowercase letters, numbers, and underscores'
      });
    }

    const [existing] = await query(
      'SELECT id FROM businesses WHERE schema_name = $1',
      [schemaName]
    );

    res.json({
      success: true,
      data: {
        available: existing.length === 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/businesses - Create new business (Super Admin only)
router.post('/', authenticate, isSuperAdmin, async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    const {
      name,
      email,
      phone,
      businessType,
      schemaName,
      address,
      city,
      country,
      adminName,
      adminEmail,
      adminPassword
    } = req.body;

    // Validate required fields
    if (!name || !email || !businessType || !schemaName || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, email, businessType, schemaName, adminName, adminEmail, adminPassword'
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

    // Validate schema name
    if (!isValidSchemaName(schemaName)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SCHEMA_NAME',
        message: 'Schema name must start with a letter and contain only lowercase letters, numbers, and underscores'
      });
    }

    // Check if schema already exists
    const [existingSchema] = await query(
      'SELECT id FROM businesses WHERE schema_name = $1',
      [schemaName]
    );

    if (existingSchema.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'SCHEMA_EXISTS',
        message: `A business with schema name '${schemaName}' already exists`
      });
    }

    // Check if business email already exists
    const [existingEmail] = await query(
      'SELECT id FROM businesses WHERE email = $1',
      [email]
    );

    if (existingEmail.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'EMAIL_EXISTS',
        message: 'A business with this email already exists'
      });
    }

    await client.query('BEGIN');

    // Set search path to main schema for business creation
    await client.query(`SET search_path TO ${config.schema}, public`);

    // Create business record
    const businessId = uuidv4();
    await client.query(
      `INSERT INTO businesses (
        id, name, email, phone, business_type, schema_name, 
        address, city, country, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', CURRENT_TIMESTAMP)`,
      [businessId, name, email, phone, businessType, schemaName, address, city, country]
    );

    // Create the business schema
    const quotedSchema = `"${schemaName.replace(/"/g, '""')}"`;
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);

    // Set search path to new schema
    await client.query(`SET search_path TO ${quotedSchema}, public`);

    // Create tables based on business type
    await createBusinessTables(client, businessType);

    // Create admin user for the business
    const adminId = uuidv4();
    const adminUsername = adminEmail.split('@')[0];
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await client.query(
      `INSERT INTO users (id, username, email, password, name, role, active, business_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'ADMIN', true, $6, CURRENT_TIMESTAMP)`,
      [adminId, adminUsername, adminEmail, hashedPassword, adminName, businessId]
    );

    // Also insert admin user in main schema with business_id
    await client.query(`SET search_path TO ${config.schema}, public`);
    await client.query(
      `INSERT INTO users (id, username, email, password, name, role, active, business_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'ADMIN', true, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO NOTHING`,
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
        schemaName,
        status: 'active',
        createdAt: new Date().toISOString(),
        adminUser: {
          id: adminId,
          email: adminEmail,
          role: 'ADMIN'
        }
      },
      message: `Business created successfully. Schema '${schemaName}' has been created.`
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

    res.json({
      success: true,
      data: businesses[0]
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
      `UPDATE businesses SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
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

// Helper function to create business-specific tables
async function createBusinessTables(client, businessType) {
  // Common tables for all business types
  
  // Users table (business-specific)
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(50) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(50),
      role VARCHAR(20) DEFAULT 'CASHIER' CHECK (role IN ('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')),
      active BOOLEAN DEFAULT TRUE,
      business_id VARCHAR(36),
      avatar VARCHAR(500),
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Categories table
  await client.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Suppliers table
  await client.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      contact_person VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      address TEXT,
      city VARCHAR(100),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Sales table
  await client.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id VARCHAR(36) PRIMARY KEY,
      subtotal DECIMAL(12,2) NOT NULL,
      discount DECIMAL(12,2) DEFAULT 0,
      tax DECIMAL(12,2) DEFAULT 0,
      total DECIMAL(12,2) NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      cashier_id VARCHAR(36),
      cashier_name VARCHAR(100),
      customer_name VARCHAR(255),
      customer_phone VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Sale items table
  await client.query(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id VARCHAR(36) PRIMARY KEY,
      sale_id VARCHAR(36) REFERENCES sales(id) ON DELETE CASCADE,
      product_id VARCHAR(36) NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      unit_type VARCHAR(50),
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(12,2) NOT NULL,
      total_price DECIMAL(12,2) NOT NULL,
      cost_price DECIMAL(12,2)
    )
  `);

  // Expenses table
  await client.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id VARCHAR(36) PRIMARY KEY,
      category VARCHAR(100) NOT NULL,
      description TEXT,
      amount DECIMAL(12,2) NOT NULL,
      expense_date DATE NOT NULL,
      created_by VARCHAR(36),
      created_by_name VARCHAR(100),
      status VARCHAR(20) DEFAULT 'PENDING',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Purchase orders table
  await client.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id VARCHAR(36) PRIMARY KEY,
      order_number VARCHAR(50) UNIQUE,
      supplier_id VARCHAR(36) REFERENCES suppliers(id),
      status VARCHAR(50) DEFAULT 'DRAFT',
      total_amount DECIMAL(12,2),
      expected_date DATE,
      notes TEXT,
      created_by VARCHAR(36),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Business type specific tables
  if (businessType === 'pharmacy') {
    // Medicines table
    await client.query(`
      CREATE TABLE IF NOT EXISTS medicines (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        generic_name VARCHAR(255),
        category_id VARCHAR(36) REFERENCES categories(id),
        manufacturer VARCHAR(255),
        batch_number VARCHAR(100),
        expiry_date DATE NOT NULL,
        stock_quantity INTEGER DEFAULT 0,
        reorder_level INTEGER DEFAULT 10,
        cost_price DECIMAL(12,2) NOT NULL,
        product_type VARCHAR(50) DEFAULT 'tablets',
        description TEXT,
        image_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        supplier_id VARCHAR(36) REFERENCES suppliers(id),
        requires_prescription BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Medicine units table
    await client.query(`
      CREATE TABLE IF NOT EXISTS medicine_units (
        id VARCHAR(36) PRIMARY KEY,
        medicine_id VARCHAR(36) REFERENCES medicines(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        quantity INTEGER NOT NULL,
        price DECIMAL(12,2) NOT NULL,
        label VARCHAR(100)
      )
    `);

    // Prescriptions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id VARCHAR(36) PRIMARY KEY,
        patient_name VARCHAR(255) NOT NULL,
        patient_phone VARCHAR(50),
        doctor_name VARCHAR(255),
        notes TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Prescription items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS prescription_items (
        id VARCHAR(36) PRIMARY KEY,
        prescription_id VARCHAR(36) REFERENCES prescriptions(id) ON DELETE CASCADE,
        medicine_id VARCHAR(36) REFERENCES medicines(id),
        medicine_name VARCHAR(255),
        dosage VARCHAR(100),
        quantity INTEGER,
        instructions TEXT
      )
    `);

    // Stock movements table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id VARCHAR(36) PRIMARY KEY,
        medicine_id VARCHAR(36) REFERENCES medicines(id),
        type VARCHAR(20) NOT NULL,
        quantity INTEGER NOT NULL,
        batch_number VARCHAR(100),
        reference_id VARCHAR(36),
        notes TEXT,
        created_by VARCHAR(36),
        previous_stock INTEGER DEFAULT 0,
        new_stock INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

  } else {
    // Products table (for general, supermarket, retail)
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100),
        barcode VARCHAR(100),
        category_id VARCHAR(36) REFERENCES categories(id),
        brand VARCHAR(255),
        stock_quantity INTEGER DEFAULT 0,
        reorder_level INTEGER DEFAULT 10,
        cost_price DECIMAL(12,2) NOT NULL,
        selling_price DECIMAL(12,2) NOT NULL,
        description TEXT,
        image_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        supplier_id VARCHAR(36) REFERENCES suppliers(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Stock movements table for products
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id VARCHAR(36) PRIMARY KEY,
        product_id VARCHAR(36) REFERENCES products(id),
        type VARCHAR(20) NOT NULL,
        quantity INTEGER NOT NULL,
        reference_id VARCHAR(36),
        notes TEXT,
        created_by VARCHAR(36),
        previous_stock INTEGER DEFAULT 0,
        new_stock INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  console.log(`   ✅ Created tables for ${businessType} business`);
}

module.exports = router;
