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

  const schema = String(config.schema || 'sme_platform').replace(/"/g, '""');
  const quotedSchema = `"${schema}"`;

  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);
  await client.query(`SET search_path TO ${quotedSchema}, public`);
  console.log(`✅ Schema '${schema}' ready`);
};

// V1: Initial tables - All tables in single schema with business_id for multi-tenancy
const createV1Tables = async (client) => {
  console.log('📋 Creating v1 tables (initial schema)...');

  // Businesses table (master list)
  await client.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(50),
      business_type VARCHAR(20) NOT NULL CHECK (business_type IN ('pharmacy', 'general', 'supermarket', 'retail')),
      address TEXT,
      city VARCHAR(100),
      country VARCHAR(100),
      logo TEXT,
      subscription_plan VARCHAR(20) DEFAULT 'basic' CHECK (subscription_plan IN ('free', 'basic', 'premium', 'enterprise')),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('active', 'inactive', 'suspended', 'pending')),
      suspension_reason TEXT,
      owner_id VARCHAR(36),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Users table - All users in single table with business_id for isolation
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(50) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(50),
      role VARCHAR(20) DEFAULT 'CASHIER' CHECK (role IN ('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER', 'SUPER_ADMIN')),
      active BOOLEAN DEFAULT TRUE,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE SET NULL,
      avatar VARCHAR(500),
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Categories table - with business_id for multi-tenancy
  await client.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(business_id, name)
    )
  `);

  // Medicines table - with business_id
  await client.query(`
    CREATE TABLE IF NOT EXISTS medicines (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE CASCADE,
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

  // Suppliers table - with business_id
  await client.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE CASCADE,
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

  // Stock movements table - with business_id
  await client.query(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE CASCADE,
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

  // Sales table - with business_id
  await client.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE CASCADE,
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

  await recordMigration(client, 1, 'Initial schema with businesses, users, categories, medicines, suppliers, stock movements, sales');
};

// V2: Additional tables
const createV2Tables = async (client) => {
  console.log('📋 Creating v2 tables (expenses, prescriptions)...');

  // Expenses table - with business_id
  await client.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE CASCADE,
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

  // Prescriptions table - with business_id
  await client.query(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE CASCADE,
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

  // Purchase orders table - with business_id
  await client.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE CASCADE,
      order_number VARCHAR(50) NOT NULL,
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
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(business_id, order_number)
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

  // Employees table - with business_id
  await client.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE CASCADE,
      employee_id VARCHAR(50) NOT NULL,
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
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(business_id, employee_id)
    )
  `);

  // Payroll table - with business_id
  await client.query(`
    CREATE TABLE IF NOT EXISTS payroll (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE CASCADE,
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
  
  // Create indexes for business_id on all tables (critical for multi-tenancy performance)
  const businessIdIndexes = [
    { name: 'idx_users_business', table: 'users', column: 'business_id' },
    { name: 'idx_categories_business', table: 'categories', column: 'business_id' },
    { name: 'idx_medicines_business', table: 'medicines', column: 'business_id' },
    { name: 'idx_suppliers_business', table: 'suppliers', column: 'business_id' },
    { name: 'idx_stock_movements_business', table: 'stock_movements', column: 'business_id' },
    { name: 'idx_sales_business', table: 'sales', column: 'business_id' },
    { name: 'idx_expenses_business', table: 'expenses', column: 'business_id' },
    { name: 'idx_prescriptions_business', table: 'prescriptions', column: 'business_id' },
    { name: 'idx_purchase_orders_business', table: 'purchase_orders', column: 'business_id' },
    { name: 'idx_employees_business', table: 'employees', column: 'business_id' },
    { name: 'idx_payroll_business', table: 'payroll', column: 'business_id' },
  ];

  for (const idx of businessIdIndexes) {
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.column})`);
    } catch (error) {
      console.warn(`   ⚠️ Could not create index ${idx.name}:`, error.message);
    }
  }

  // Other useful indexes
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
    { name: 'idx_users_role', table: 'users', column: 'role' },
    { name: 'idx_businesses_status', table: 'businesses', column: 'status' },
  ];

  for (const idx of indexes) {
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.column})`);
    } catch (error) {
      console.warn(`   ⚠️ Could not create index ${idx.name}:`, error.message);
    }
  }

  await recordMigration(client, 4, 'Added business_id indexes and other performance indexes');
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
    'prescriptions', 'purchase_orders', 'employees', 'payroll', 'businesses'
  ];

  for (const table of tablesWithUpdatedAt) {
    try {
      await client.query(`DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table}`);
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

// SIMPLIFIED AND GUARANTEED SUPER ADMIN CREATION
const createDefaultData = async (client) => {
  console.log('📥 Creating default data...');

  // ALWAYS CREATE SUPER ADMIN - No conditions, just create it
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@system.com';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'SuperSecure123!';
  const superAdminName = process.env.SUPER_ADMIN_NAME || 'System Administrator';
  
  console.log('👑 Creating super admin user...');
  console.log(`   Email: ${superAdminEmail}`);
  console.log(`   Name: ${superAdminName}`);
  
  try {
    // Check if users table exists, if not, create it
    try {
      await client.query('SELECT 1 FROM users LIMIT 1');
    } catch (error) {
      console.log('⚠️ Users table might not exist, will create super admin after migrations');
      return;
    }
    
    // Check if user already exists
    const existingSuperAdmin = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [superAdminEmail]
    );
    
    const hashedPassword = await bcrypt.hash(superAdminPassword, 12);
    const id = uuidv4();
    const username = 'superadmin';

    if (existingSuperAdmin.rows.length === 0) {
      // Try to insert with business_id column
      try {
        await client.query(`
          INSERT INTO users (id, username, email, password, name, role, active, business_id)
          VALUES ($1, $2, $3, $4, $5, 'SUPER_ADMIN', true, NULL)
        `, [id, username, superAdminEmail, hashedPassword, superAdminName]);
        console.log('✅ Super admin user created successfully');
      } catch (insertError) {
        // If that fails, try without business_id column
        console.log('⚠️ First insert failed, trying without business_id...');
        try {
          await client.query(`
            INSERT INTO users (id, username, email, password, name, role, active)
            VALUES ($1, $2, $3, $4, $5, 'SUPER_ADMIN', true)
          `, [id, username, superAdminEmail, hashedPassword, superAdminName]);
          console.log('✅ Super admin user created (without business_id)');
        } catch (secondError) {
          console.warn('⚠️ Could not create super admin user:', secondError.message);
        }
      }
    } else {
      // Update existing user
      try {
        await client.query(`
          UPDATE users SET 
            password = $1, 
            name = $2, 
            role = 'SUPER_ADMIN',
            active = true,
            updated_at = CURRENT_TIMESTAMP
          WHERE email = $3
        `, [hashedPassword, superAdminName, superAdminEmail]);
        console.log('✅ Super admin user updated');
      } catch (updateError) {
        console.warn('⚠️ Could not update super admin user:', updateError.message);
      }
    }
  } catch (error) {
    console.warn('⚠️ Error in super admin creation:', error.message);
    // Don't fail the entire initialization
  }

  // Create default categories
  try {
    console.log('📁 Creating default categories...');
    
    const defaultCategories = [
      { name: 'Antibiotics', description: 'Medications that fight bacterial infections' },
      { name: 'Pain Relief', description: 'Medications for pain management' },
      { name: 'Vitamins & Supplements', description: 'Nutritional supplements and vitamins' },
      { name: 'First Aid', description: 'Basic first aid supplies' },
      { name: 'Skin Care', description: 'Skin care products and medications' }
    ];

    // Check if categories table exists
    try {
      await client.query('SELECT 1 FROM categories LIMIT 1');
    } catch (error) {
      console.log('⚠️ Categories table does not exist yet, skipping default categories');
      return;
    }

    for (const cat of defaultCategories) {
      const catId = uuidv4();
      
      try {
        // Try with business_id first
        await client.query(`
          INSERT INTO categories (id, business_id, name, description) 
          VALUES ($1, NULL, $2, $3)
          ON CONFLICT DO NOTHING
        `, [catId, cat.name, cat.description]);
      } catch (error) {
        // Try without business_id
        try {
          await client.query(`
            INSERT INTO categories (id, name, description) 
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
          `, [catId, cat.name, cat.description]);
        } catch (secondError) {
          console.warn(`⚠️ Could not insert category ${cat.name}:`, secondError.message);
        }
      }
    }
    console.log('✅ Default categories created');
  } catch (error) {
    console.warn('⚠️ Could not create default categories:', error.message);
  }
};

// V6: Credit Sales tables
const createV6CreditSales = async (client) => {
  console.log('📋 Creating v6 tables (credit sales)...');

  // Credit sales table - tracks credit purchases
  await client.query(`
    CREATE TABLE IF NOT EXISTS credit_sales (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE CASCADE,
      sale_id VARCHAR(36) REFERENCES sales(id) ON DELETE CASCADE,
      customer_id VARCHAR(36),
      customer_name VARCHAR(100) NOT NULL,
      customer_phone VARCHAR(50) NOT NULL,
      total_amount DECIMAL(10, 2) NOT NULL,
      paid_amount DECIMAL(10, 2) DEFAULT 0,
      balance_amount DECIMAL(10, 2) NOT NULL,
      status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIAL', 'PAID')),
      due_date DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Credit payments table - tracks payments made against credit sales
  await client.query(`
    CREATE TABLE IF NOT EXISTS credit_payments (
      id VARCHAR(36) PRIMARY KEY,
      credit_sale_id VARCHAR(36) REFERENCES credit_sales(id) ON DELETE CASCADE,
      amount DECIMAL(10, 2) NOT NULL,
      payment_method VARCHAR(20) DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'CARD', 'MPESA')),
      received_by VARCHAR(36),
      received_by_name VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add indexes for credit tables
  try {
    await client.query(`CREATE INDEX IF NOT EXISTS idx_credit_sales_business ON credit_sales(business_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_credit_sales_customer ON credit_sales(customer_phone)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_credit_sales_status ON credit_sales(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_credit_payments_credit_sale ON credit_payments(credit_sale_id)`);
  } catch (error) {
    console.warn('⚠️ Could not create credit indexes:', error.message);
  }

  await recordMigration(client, 6, 'Added credit_sales and credit_payments tables');
};

// V7: Family Planning tables
const createV7FamilyPlanning = async (client) => {
  console.log('📋 Creating v7 tables (family planning)...');

  // Family planning table - tracks clients for Depo, Herbal, Femi Plan
  await client.query(`
    CREATE TABLE IF NOT EXISTS family_planning (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) REFERENCES businesses(id) ON DELETE CASCADE,
      client_name VARCHAR(100) NOT NULL,
      client_phone VARCHAR(50) NOT NULL,
      method VARCHAR(20) NOT NULL CHECK (method IN ('DEPO', 'HERBAL', 'FEMI_PLAN')),
      last_administered_date DATE NOT NULL,
      next_due_date DATE NOT NULL,
      cycle_days INT DEFAULT 28,
      notes TEXT,
      status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'COMPLETED')),
      created_by VARCHAR(36),
      created_by_name VARCHAR(100),
      updated_by VARCHAR(36),
      updated_by_name VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add indexes for family planning
  try {
    await client.query(`CREATE INDEX IF NOT EXISTS idx_family_planning_business ON family_planning(business_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_family_planning_client ON family_planning(client_phone)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_family_planning_method ON family_planning(method)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_family_planning_due_date ON family_planning(next_due_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_family_planning_status ON family_planning(status)`);
  } catch (error) {
    console.warn('⚠️ Could not create family planning indexes:', error.message);
  }

  await recordMigration(client, 7, 'Added family_planning table for Depo, Herbal, Femi Plan tracking');
};

// Migration definitions
const migrations = [
  { version: 1, description: 'Initial schema', migrate: createV1Tables },
  { version: 2, description: 'Expenses and prescriptions', migrate: createV2Tables },
  { version: 3, description: 'Purchase orders and employees', migrate: createV3Tables },
  { version: 4, description: 'Indexes and constraints', migrate: createV4Indexes },
  { version: 5, description: 'Audit triggers', migrate: createV5Triggers },
  { version: 6, description: 'Credit sales', migrate: createV6CreditSales },
  { version: 7, description: 'Family planning', migrate: createV7FamilyPlanning },
];

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
    // Always set schema first
    await client.query(`SET search_path TO "${config.schema}", public`);
    
    // Create and set schema
    await createSchema(client);
    
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
            // Don't throw error, continue with other migrations
          }
        }
      }
    } else {
      console.log('✅ Database is up to date');
      console.log('');
    }

    // ALWAYS create default data
    console.log('📥 Creating default data...');
    await createDefaultData(client);

    console.log('');
    console.log('🎉 Database initialization complete!');
    console.log('');
    console.log('🔑 Super Admin Login:');
    console.log(`   Email: ${process.env.SUPER_ADMIN_EMAIL || 'superadmin@system.com'}`);
    console.log(`   Password: ${process.env.SUPER_ADMIN_PASSWORD ? '********' : 'SuperSecure123!'}`);

  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { initializeDatabase };