const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, config } = require('../config/database');

const createSchema = async (client) => {
  console.log('📦 Creating schema if not exists...');

  // Safely quote schema identifier (cannot be parameterized in pg)
  const schema = String(config.schema || 'public').replace(/"/g, '""');
  const quotedSchema = `"${schema}"`;

  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);
  await client.query(`SET search_path TO ${quotedSchema}, public`);
  console.log(`✅ Schema '${config.schema}' ready`);
};

const createTables = async (client) => {
  console.log('📋 Creating tables...');

  // Users table
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(50),
      role VARCHAR(20) DEFAULT 'CASHIER' CHECK (role IN ('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')),
      active BOOLEAN DEFAULT TRUE,
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   ✓ users table');

  // Categories table
  await client.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   ✓ categories table');

  // Medicines table with ALL columns including product_type, units, batch_number, etc.
  await client.query(`
    CREATE TABLE IF NOT EXISTS medicines (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      generic_name VARCHAR(255),
      category VARCHAR(100),
      category_id VARCHAR(36),
      description TEXT,
      manufacturer VARCHAR(255),
      unit_price DECIMAL(10, 2) DEFAULT 0,
      cost_price DECIMAL(10, 2) DEFAULT 0,
      stock_quantity INT DEFAULT 0,
      reorder_level INT DEFAULT 10,
      expiry_date DATE,
      batch_number VARCHAR(100),
      requires_prescription BOOLEAN DEFAULT FALSE,
      product_type VARCHAR(50),
      units JSONB,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   ✓ medicines table');

  // Suppliers table
  await client.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      contact_person VARCHAR(100),
      email VARCHAR(255),
      phone VARCHAR(50),
      address TEXT,
      city VARCHAR(100),
      country VARCHAR(100),
      notes TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   ✓ suppliers table');

  // Stock movements table with all tracking columns
  await client.query(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id VARCHAR(36) PRIMARY KEY,
      medicine_id VARCHAR(36) NOT NULL,
      medicine_name VARCHAR(255),
      type VARCHAR(20) NOT NULL CHECK (type IN ('ADDITION', 'SALE', 'LOSS', 'ADJUSTMENT', 'PURCHASE')),
      quantity INT NOT NULL,
      batch_number VARCHAR(100),
      reference_id VARCHAR(36),
      reason TEXT,
      notes TEXT,
      created_by VARCHAR(36),
      performed_by_name VARCHAR(100),
      performed_by_role VARCHAR(50),
      previous_stock INT DEFAULT 0,
      new_stock INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   ✓ stock_movements table');

  // Sales table
  await client.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id VARCHAR(36) PRIMARY KEY,
      cashier_id VARCHAR(36) NOT NULL,
      cashier_name VARCHAR(100),
      total_amount DECIMAL(10, 2) DEFAULT 0,
      discount DECIMAL(10, 2) DEFAULT 0,
      final_amount DECIMAL(10, 2) DEFAULT 0,
      profit DECIMAL(10, 2) DEFAULT 0,
      payment_method VARCHAR(20) DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'CARD', 'MPESA', 'CREDIT')),
      customer_name VARCHAR(100),
      customer_phone VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   ✓ sales table');

  // Sale items table
  await client.query(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id VARCHAR(36) PRIMARY KEY,
      sale_id VARCHAR(36) NOT NULL,
      medicine_id VARCHAR(36) NOT NULL,
      medicine_name VARCHAR(255),
      quantity INT NOT NULL,
      unit_type VARCHAR(50),
      unit_label VARCHAR(100),
      unit_price DECIMAL(10, 2) NOT NULL,
      cost_price DECIMAL(10, 2) DEFAULT 0,
      subtotal DECIMAL(10, 2) NOT NULL,
      profit DECIMAL(10, 2) DEFAULT 0
    )
  `);
  console.log('   ✓ sale_items table');

  // Expenses table
  await client.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id VARCHAR(36) PRIMARY KEY,
      category VARCHAR(100) NOT NULL,
      description TEXT,
      amount DECIMAL(10, 2) NOT NULL,
      expense_date DATE NOT NULL,
      vendor VARCHAR(255),
      receipt_number VARCHAR(100),
      notes TEXT,
      status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      rejection_reason TEXT,
      created_by VARCHAR(36),
      created_by_name VARCHAR(100),
      approved_by VARCHAR(36),
      approved_by_name VARCHAR(100),
      approved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   ✓ expenses table');

  // Prescriptions table
  await client.query(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id VARCHAR(36) PRIMARY KEY,
      patient_name VARCHAR(100) NOT NULL,
      patient_phone VARCHAR(50),
      doctor_name VARCHAR(100),
      diagnosis TEXT,
      notes TEXT,
      status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DISPENSED', 'CANCELLED')),
      created_by VARCHAR(36),
      created_by_name VARCHAR(100),
      dispensed_by VARCHAR(36),
      dispensed_by_name VARCHAR(100),
      dispensed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   ✓ prescriptions table');

  // Prescription items table
  await client.query(`
    CREATE TABLE IF NOT EXISTS prescription_items (
      id VARCHAR(36) PRIMARY KEY,
      prescription_id VARCHAR(36) NOT NULL,
      medicine_id VARCHAR(36) NOT NULL,
      medicine_name VARCHAR(255),
      quantity INT NOT NULL,
      dosage VARCHAR(100),
      frequency VARCHAR(100),
      duration VARCHAR(100),
      instructions TEXT
    )
  `);
  console.log('   ✓ prescription_items table');

  // Purchase orders table with all tracking columns
  await client.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id VARCHAR(36) PRIMARY KEY,
      order_number VARCHAR(50) UNIQUE NOT NULL,
      supplier_id VARCHAR(36) NOT NULL,
      supplier_name VARCHAR(255),
      subtotal DECIMAL(10, 2) DEFAULT 0,
      tax DECIMAL(10, 2) DEFAULT 0,
      total DECIMAL(10, 2) DEFAULT 0,
      total_amount DECIMAL(10, 2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CANCELLED')),
      notes TEXT,
      expected_delivery_date DATE,
      cancellation_reason TEXT,
      created_by VARCHAR(36),
      created_by_name VARCHAR(100),
      approved_by VARCHAR(36),
      approved_by_name VARCHAR(100),
      approved_at TIMESTAMP,
      received_by VARCHAR(36),
      received_by_name VARCHAR(100),
      received_at TIMESTAMP,
      submitted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   ✓ purchase_orders table');

  // Purchase order items table
  await client.query(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id VARCHAR(36) PRIMARY KEY,
      purchase_order_id VARCHAR(36) NOT NULL,
      medicine_id VARCHAR(36) NOT NULL,
      medicine_name VARCHAR(255),
      quantity INT NOT NULL,
      unit_price DECIMAL(10, 2) DEFAULT 0,
      unit_cost DECIMAL(10, 2) DEFAULT 0,
      subtotal DECIMAL(10, 2) DEFAULT 0,
      total_cost DECIMAL(10, 2) DEFAULT 0
    )
  `);
  console.log('   ✓ purchase_order_items table');

  // Employees table
  await client.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id VARCHAR(36) PRIMARY KEY,
      employee_id VARCHAR(50) UNIQUE NOT NULL,
      user_id VARCHAR(36),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      department VARCHAR(100),
      position VARCHAR(100),
      hire_date DATE,
      salary DECIMAL(10, 2),
      bank_account VARCHAR(50),
      bank_name VARCHAR(100),
      tax_id VARCHAR(50),
      address TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   ✓ employees table');

  // Payroll table
  await client.query(`
    CREATE TABLE IF NOT EXISTS payroll (
      id VARCHAR(36) PRIMARY KEY,
      employee_id VARCHAR(36) NOT NULL,
      employee_name VARCHAR(100),
      pay_period VARCHAR(7) NOT NULL,
      basic_salary DECIMAL(10, 2) NOT NULL,
      allowances DECIMAL(10, 2) DEFAULT 0,
      deductions DECIMAL(10, 2) DEFAULT 0,
      net_salary DECIMAL(10, 2) NOT NULL,
      status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'PAID')),
      notes TEXT,
      paid_by VARCHAR(36),
      paid_by_name VARCHAR(100),
      paid_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('   ✓ payroll table');

  console.log('✅ All tables created successfully');
};

const createIndexes = async (client) => {
  console.log('🔍 Creating indexes...');
  
  const indexes = [
    { name: 'idx_medicines_category', table: 'medicines', column: 'category' },
    { name: 'idx_medicines_expiry', table: 'medicines', column: 'expiry_date' },
    { name: 'idx_medicines_batch', table: 'medicines', column: 'batch_number' },
    { name: 'idx_stock_movements_medicine', table: 'stock_movements', column: 'medicine_id' },
    { name: 'idx_stock_movements_date', table: 'stock_movements', column: 'created_at' },
    { name: 'idx_stock_movements_type', table: 'stock_movements', column: 'type' },
    { name: 'idx_sales_date', table: 'sales', column: 'created_at' },
    { name: 'idx_sales_cashier', table: 'sales', column: 'cashier_id' },
    { name: 'idx_expenses_date', table: 'expenses', column: 'expense_date' },
    { name: 'idx_expenses_status', table: 'expenses', column: 'status' },
    { name: 'idx_prescriptions_status', table: 'prescriptions', column: 'status' },
    { name: 'idx_purchase_orders_status', table: 'purchase_orders', column: 'status' },
    { name: 'idx_purchase_orders_supplier', table: 'purchase_orders', column: 'supplier_id' },
    { name: 'idx_payroll_period', table: 'payroll', column: 'pay_period' },
    { name: 'idx_payroll_employee', table: 'payroll', column: 'employee_id' },
  ];

  for (const idx of indexes) {
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.column})`);
    } catch (err) {
      // Ignore if index already exists
    }
  }
  
  console.log('✅ Indexes created');
};

const createAdminUser = async (client) => {
  console.log('👤 Checking admin user...');
  
  if (process.env.ADMIN_ENABLED !== 'true') {
    console.log('   Admin auto-creation is disabled');
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || 'System Administrator';
  const adminPhone = process.env.ADMIN_PHONE || '';

  if (!adminEmail || !adminPassword) {
    console.log('   Admin credentials not configured');
    return;
  }

  const existingAdmin = await client.query(
    "SELECT id FROM users WHERE email = $1 OR role = 'ADMIN'",
    [adminEmail]
  );

  if (existingAdmin.rows.length > 0) {
    console.log('   Admin user already exists');
    return;
  }

  const id = uuidv4();
  const username = adminEmail.split('@')[0];
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  await client.query(`
    INSERT INTO users (id, username, email, password, name, phone, role, active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'ADMIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [id, username, adminEmail, hashedPassword, adminName, adminPhone]);

  console.log('✅ Admin user created');
  console.log(`   Email: ${adminEmail}`);
};

const createDefaultCategories = async (client) => {
  console.log('📂 Checking default categories...');

  const categories = [
    { name: 'Tablets', description: 'Oral solid dosage forms' },
    { name: 'Capsules', description: 'Oral capsule medications' },
    { name: 'Syrups', description: 'Liquid oral medications' },
    { name: 'Injections', description: 'Injectable medications' },
    { name: 'Topicals', description: 'Creams, ointments, and lotions' },
    { name: 'Drops', description: 'Eye, ear, and nasal drops' },
    { name: 'Supplies', description: 'Medical supplies and consumables' },
    { name: 'Equipment', description: 'Medical equipment and devices' },
  ];

  for (const cat of categories) {
    const existing = await client.query(
      'SELECT id FROM categories WHERE name = $1',
      [cat.name]
    );

    if (existing.rows.length === 0) {
      await client.query(
        'INSERT INTO categories (id, name, description, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [uuidv4(), cat.name, cat.description]
      );
    }
  }

  console.log('✅ Default categories ready');
};

const initializeDatabase = async () => {
  console.log('');
  console.log('🚀 PharmaCare Database Initialization');
  console.log('=====================================');
  console.log(`   Host: ${config.host}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   Schema: ${config.schema}`);
  console.log('');
  
  const client = await pool.connect();
  
  try {
    await createSchema(client);
    await createTables(client);
    await createIndexes(client);
    await createAdminUser(client);
    await createDefaultCategories(client);
    
    console.log('');
    console.log('🎉 Database initialization complete!');
    console.log('');
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { initializeDatabase };
