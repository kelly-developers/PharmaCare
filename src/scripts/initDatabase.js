const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, config } = require('../config/database');

// Database version tracking table
const createVersionTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id SERIAL PRIMARY KEY,
      version INTEGER NOT NULL,
      description TEXT,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64)
    )
  `);
  console.log('📊 Schema version table ready');
};

// Get current database version
const getCurrentVersion = async (client) => {
  try {
    const result = await client.query(
      'SELECT MAX(version) as current_version FROM schema_version'
    );
    return result.rows[0]?.current_version || 0;
  } catch (error) {
    // Table doesn't exist yet
    return 0;
  }
};

// Record migration
const recordMigration = async (client, version, description) => {
  await client.query(
    'INSERT INTO schema_version (version, description) VALUES ($1, $2)',
    [version, description]
  );
  console.log(`📝 Recorded migration: v${version} - ${description}`);
};

// Schema creation
const createSchema = async (client) => {
  console.log('📦 Creating schema if not exists...');

  const schema = String(config.schema || 'public').replace(/"/g, '""');
  const quotedSchema = `"${schema}"`;

  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);
  await client.query(`SET search_path TO ${quotedSchema}, public`);
  console.log(`✅ Schema '${config.schema}' ready`);
};

// V1: Initial tables
const createV1Tables = async (client) => {
  console.log('📋 Creating v1 tables (initial schema)...');

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

  // Medicines table
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

  // Stock movements table
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

  await recordMigration(client, 1, 'Initial schema with users, categories, medicines, suppliers, stock movements, sales');
};

// V2: Additional tables
const createV2Tables = async (client) => {
  console.log('📋 Creating v2 tables (expenses, prescriptions)...');

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

  await recordMigration(client, 2, 'Added expenses, prescriptions, and prescription_items tables');
};

// V3: Purchase orders and employees
const createV3Tables = async (client) => {
  console.log('📋 Creating v3 tables (purchase orders, employees, payroll)...');

  // Purchase orders table
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

  await recordMigration(client, 3, 'Added purchase_orders, purchase_order_items, employees, and payroll tables');
};

// V4: Add indexes and constraints
const createV4Indexes = async (client) => {
  console.log('🔍 Creating indexes and constraints...');
  
  // Add foreign key constraints
  const constraints = [
    { table: 'medicines', column: 'category_id', ref: 'categories(id)', constraint: 'fk_medicines_category' },
    { table: 'stock_movements', column: 'medicine_id', ref: 'medicines(id)', constraint: 'fk_stock_movements_medicine' },
    { table: 'sale_items', column: 'sale_id', ref: 'sales(id)', constraint: 'fk_sale_items_sale' },
    { table: 'sale_items', column: 'medicine_id', ref: 'medicines(id)', constraint: 'fk_sale_items_medicine' },
    { table: 'prescription_items', column: 'prescription_id', ref: 'prescriptions(id)', constraint: 'fk_prescription_items_prescription' },
    { table: 'prescription_items', column: 'medicine_id', ref: 'medicines(id)', constraint: 'fk_prescription_items_medicine' },
    { table: 'purchase_orders', column: 'supplier_id', ref: 'suppliers(id)', constraint: 'fk_purchase_orders_supplier' },
    { table: 'purchase_order_items', column: 'purchase_order_id', ref: 'purchase_orders(id)', constraint: 'fk_purchase_order_items_order' },
    { table: 'purchase_order_items', column: 'medicine_id', ref: 'medicines(id)', constraint: 'fk_purchase_order_items_medicine' },
    { table: 'payroll', column: 'employee_id', ref: 'employees(id)', constraint: 'fk_payroll_employee' },
  ];

  for (const constraint of constraints) {
    try {
      await client.query(`
        ALTER TABLE ${constraint.table}
        ADD CONSTRAINT ${constraint.constraint}
        FOREIGN KEY (${constraint.column}) REFERENCES ${constraint.ref}
        ON DELETE RESTRICT
      `);
    } catch (error) {
      // Constraint might already exist
      if (!error.message.includes('already exists')) {
        console.warn(`   ⚠️ Could not add constraint ${constraint.constraint}:`, error.message);
      }
    }
  }

  // Create indexes
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
    } catch (error) {
      console.warn(`   ⚠️ Could not create index ${idx.name}:`, error.message);
    }
  }

  await recordMigration(client, 4, 'Added foreign key constraints and indexes');
};

// V5: Add audit triggers
const createV5Triggers = async (client) => {
  console.log('🔔 Creating audit triggers...');

  // Create updated_at trigger function
  await client.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Apply trigger to tables with updated_at column
  const tablesWithUpdatedAt = [
    'users', 'categories', 'medicines', 'suppliers', 'expenses', 
    'prescriptions', 'purchase_orders', 'employees', 'payroll'
  ];

  for (const table of tablesWithUpdatedAt) {
    try {
      await client.query(`
        CREATE TRIGGER update_${table}_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
      `);
    } catch (error) {
      console.warn(`   ⚠️ Could not create trigger for ${table}:`, error.message);
    }
  }

  await recordMigration(client, 5, 'Added audit triggers for updated_at columns');
};

const createDefaultData = async (client) => {
  console.log('📥 Creating default data...');

  // Create admin user if enabled
  if (process.env.ADMIN_ENABLED === 'true') {
    console.log('👤 Checking admin user...');
    
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || 'System Administrator';
    const adminPhone = process.env.ADMIN_PHONE || '';

    if (adminEmail && adminPassword) {
      const existingAdmin = await client.query(
        "SELECT id FROM users WHERE email = $1 OR role = 'ADMIN'",
        [adminEmail]
      );

      if (existingAdmin.rows.length === 0) {
        const id = uuidv4();
        const username = adminEmail.split('@')[0];
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        await client.query(`
          INSERT INTO users (id, username, email, password, name, phone, role, active)
          VALUES ($1, $2, $3, $4, $5, $6, 'ADMIN', true)
        `, [id, username, adminEmail, hashedPassword, adminName, adminPhone]);

        console.log('✅ Admin user created');
      } else {
        console.log('✅ Admin user already exists');
      }
    }
  }

  // Create default categories
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
        'INSERT INTO categories (id, name, description) VALUES ($1, $2, $3)',
        [uuidv4(), cat.name, cat.description]
      );
    }
  }

  console.log('✅ Default data ready');
};

// Migration definitions
const migrations = [
  { version: 1, description: 'Initial schema', migrate: createV1Tables },
  { version: 2, description: 'Expenses and prescriptions', migrate: createV2Tables },
  { version: 3, description: 'Purchase orders and employees', migrate: createV3Tables },
  { version: 4, description: 'Indexes and constraints', migrate: createV4Indexes },
  { version: 5, description: 'Audit triggers', migrate: createV5Triggers },
];

// Main initialization function
const initializeDatabase = async () => {
  console.log('');
  console.log('🚀 PharmaCare Database Initialization');
  console.log('=====================================');
  console.log(`   Host: ${config.host}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   Schema: ${config.schema}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');

  const client = await pool.connect();
  
  try {
    // Set search path
    await client.query(`SET search_path TO ${config.schema}, public`);
    
    // Create version table
    await createVersionTable(client);
    
    // Get current version
    const currentVersion = await getCurrentVersion(client);
    console.log(`📊 Current database version: v${currentVersion}`);
    console.log(`📊 Target version: v${migrations.length}`);
    console.log('');

    // Run migrations if needed
    if (currentVersion < migrations.length) {
      console.log('🔄 Running migrations...');
      console.log('');
      
      for (const migration of migrations) {
        if (migration.version > currentVersion) {
          console.log(`▶️  Running migration v${migration.version}: ${migration.description}`);
          try {
            await migration.migrate(client);
            console.log(`✅ Migration v${migration.version} completed`);
            console.log('');
          } catch (error) {
            console.error(`❌ Migration v${migration.version} failed:`, error.message);
            throw error;
          }
        }
      }
    } else {
      console.log('✅ Database is up to date');
      console.log('');
    }

    // Create default data (always run)
    await createDefaultData(client);

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

// Auto-run if called directly
if (require.main === module) {
  initializeDatabase().catch(console.error);
}

module.exports = { 
  initializeDatabase,
  getCurrentVersion 
};