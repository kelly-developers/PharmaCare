const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, config } = require('../config/database');

const createSchema = async (client) => {
  console.log(`📋 Creating schema: ${config.schema}`);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${config.schema}`);
  await client.query(`SET search_path TO ${config.schema}, public`);
};

const createTables = async (client) => {
  console.log('📋 Creating tables...');

  // Create ENUM types if they don't exist
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE payment_method AS ENUM ('CASH', 'CARD', 'MPESA', 'CREDIT');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE expense_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE prescription_status AS ENUM ('PENDING', 'DISPENSED', 'CANCELLED');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE purchase_order_status AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CANCELLED');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE payroll_status AS ENUM ('PENDING', 'APPROVED', 'PAID');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE stock_movement_type AS ENUM ('ADDITION', 'SALE', 'LOSS', 'ADJUSTMENT', 'PURCHASE');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Users table
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(50),
      role user_role DEFAULT 'CASHIER',
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
      category_id VARCHAR(36) REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT,
      manufacturer VARCHAR(255),
      product_type VARCHAR(50),
      unit_price DECIMAL(10, 2) DEFAULT 0,
      cost_price DECIMAL(10, 2) DEFAULT 0,
      stock_quantity INT DEFAULT 0,
      reorder_level INT DEFAULT 10,
      expiry_date DATE,
      batch_number VARCHAR(100),
      image_url TEXT,
      requires_prescription BOOLEAN DEFAULT FALSE,
      units JSONB,
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
      medicine_id VARCHAR(36) NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
      type stock_movement_type NOT NULL,
      quantity INT NOT NULL,
      batch_number VARCHAR(100),
      reference_id VARCHAR(36),
      notes TEXT,
      created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Sales table
  await client.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id VARCHAR(36) PRIMARY KEY,
      cashier_id VARCHAR(36) NOT NULL REFERENCES users(id),
      total_amount DECIMAL(10, 2) DEFAULT 0,
      discount DECIMAL(10, 2) DEFAULT 0,
      final_amount DECIMAL(10, 2) DEFAULT 0,
      profit DECIMAL(10, 2) DEFAULT 0,
      payment_method payment_method DEFAULT 'CASH',
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
      sale_id VARCHAR(36) NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      medicine_id VARCHAR(36) NOT NULL REFERENCES medicines(id),
      quantity INT NOT NULL,
      unit_type VARCHAR(50),
      unit_label VARCHAR(100),
      unit_price DECIMAL(10, 2) NOT NULL,
      subtotal DECIMAL(10, 2) NOT NULL
    )
  `);

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
      status expense_status DEFAULT 'PENDING',
      rejection_reason TEXT,
      created_by VARCHAR(36) REFERENCES users(id),
      approved_by VARCHAR(36) REFERENCES users(id),
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
      status prescription_status DEFAULT 'PENDING',
      created_by VARCHAR(36) REFERENCES users(id),
      dispensed_by VARCHAR(36) REFERENCES users(id),
      dispensed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Prescription items table
  await client.query(`
    CREATE TABLE IF NOT EXISTS prescription_items (
      id VARCHAR(36) PRIMARY KEY,
      prescription_id VARCHAR(36) NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
      medicine_id VARCHAR(36) NOT NULL REFERENCES medicines(id),
      quantity INT NOT NULL,
      dosage VARCHAR(100),
      frequency VARCHAR(100),
      duration VARCHAR(100),
      instructions TEXT
    )
  `);

  // Purchase orders table
  await client.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id VARCHAR(36) PRIMARY KEY,
      order_number VARCHAR(50) UNIQUE NOT NULL,
      supplier_id VARCHAR(36) NOT NULL REFERENCES suppliers(id),
      total_amount DECIMAL(10, 2) DEFAULT 0,
      status purchase_order_status DEFAULT 'DRAFT',
      notes TEXT,
      expected_delivery_date DATE,
      cancellation_reason TEXT,
      created_by VARCHAR(36) REFERENCES users(id),
      approved_by VARCHAR(36) REFERENCES users(id),
      approved_at TIMESTAMP,
      received_by VARCHAR(36) REFERENCES users(id),
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
      purchase_order_id VARCHAR(36) NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      medicine_id VARCHAR(36) NOT NULL REFERENCES medicines(id),
      quantity INT NOT NULL,
      unit_price DECIMAL(10, 2) NOT NULL,
      subtotal DECIMAL(10, 2) NOT NULL
    )
  `);

  // Employees table
  await client.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id VARCHAR(36) PRIMARY KEY,
      employee_id VARCHAR(50) UNIQUE NOT NULL,
      user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
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
      employee_id VARCHAR(36) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      pay_period VARCHAR(7) NOT NULL,
      basic_salary DECIMAL(10, 2) NOT NULL,
      allowances DECIMAL(10, 2) DEFAULT 0,
      deductions DECIMAL(10, 2) DEFAULT 0,
      net_salary DECIMAL(10, 2) NOT NULL,
      status payroll_status DEFAULT 'PENDING',
      notes TEXT,
      paid_by VARCHAR(36) REFERENCES users(id),
      paid_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ All tables created successfully');
};

const createIndexes = async (client) => {
  console.log('📋 Creating indexes...');
  
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category_id)',
    'CREATE INDEX IF NOT EXISTS idx_medicines_expiry ON medicines(expiry_date)',
    'CREATE INDEX IF NOT EXISTS idx_stock_movements_medicine ON stock_movements(medicine_id)',
    'CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status)',
    'CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status)',
    'CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(pay_period)',
    'CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll(employee_id)'
  ];

  for (const indexSql of indexes) {
    await client.query(indexSql);
  }
  
  console.log('✅ Indexes created successfully');
};

const createAdminUser = async (client) => {
  console.log('👤 Checking admin user...');
  
  // Check if admin creation is enabled
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

  // Check if admin already exists
  const existingAdmin = await client.query(
    'SELECT id FROM users WHERE email = $1 OR role = $2',
    [adminEmail, 'ADMIN']
  );

  if (existingAdmin.rows.length > 0) {
    console.log('   Admin user already exists');
    return;
  }

  // Create admin user
  const id = uuidv4();
  const username = adminEmail.split('@')[0];
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  await client.query(`
    INSERT INTO users (id, username, email, password, name, phone, role, active, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'ADMIN', true, CURRENT_TIMESTAMP)
  `, [id, username, adminEmail, hashedPassword, adminName, adminPhone]);

  console.log('✅ Admin user created successfully');
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Username: ${username}`);
};

const createDefaultCategories = async (client) => {
  console.log('📦 Creating default categories...');
  
  const categories = [
    { name: 'Tablets', description: 'Oral solid dosage forms' },
    { name: 'Syrups', description: 'Liquid oral medications' },
    { name: 'Injections', description: 'Injectable medications' },
    { name: 'Creams & Ointments', description: 'Topical medications' },
    { name: 'Drops', description: 'Eye, ear, and nasal drops' },
    { name: 'Medical Supplies', description: 'Cotton, bandages, syringes, etc.' },
    { name: 'Personal Care', description: 'Condoms, sanitary products, etc.' },
    { name: 'Services', description: 'Family planning, consultations, etc.' }
  ];

  for (const category of categories) {
    const existing = await client.query('SELECT id FROM categories WHERE name = $1', [category.name]);
    
    if (existing.rows.length === 0) {
      const id = uuidv4();
      await client.query(
        'INSERT INTO categories (id, name, description, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
        [id, category.name, category.description]
      );
    }
  }
  
  console.log('✅ Default categories created');
};

const initializeDatabase = async () => {
  console.log('🚀 Initializing database...');
  console.log(`   Schema: ${config.schema}`);
  
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
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { initializeDatabase };
