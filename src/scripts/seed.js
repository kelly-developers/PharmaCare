require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2/promise');

const seedDatabase = async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pharmacare',
    waitForConnections: true,
    connectionLimit: 10
  });

  try {
    console.log('🌱 Starting database seed...');

    // Create admin user
    const adminId = uuidv4();
    const adminPassword = await bcrypt.hash('admin123', 10);
    
    await pool.query(`
      INSERT INTO users (id, username, email, password, name, role, active, created_at)
      VALUES (?, 'admin', 'admin@pharmacare.com', ?, 'System Admin', 'ADMIN', true, NOW())
      ON DUPLICATE KEY UPDATE id=id
    `, [adminId, adminPassword]);

    console.log('✅ Admin user created (username: admin, password: admin123)');

    // Create manager user
    const managerId = uuidv4();
    const managerPassword = await bcrypt.hash('manager123', 10);
    
    await pool.query(`
      INSERT INTO users (id, username, email, password, name, role, active, created_at)
      VALUES (?, 'manager', 'manager@pharmacare.com', ?, 'Store Manager', 'MANAGER', true, NOW())
      ON DUPLICATE KEY UPDATE id=id
    `, [managerId, managerPassword]);

    console.log('✅ Manager user created (username: manager, password: manager123)');

    // Create pharmacist user
    const pharmacistId = uuidv4();
    const pharmacistPassword = await bcrypt.hash('pharmacist123', 10);
    
    await pool.query(`
      INSERT INTO users (id, username, email, password, name, role, active, created_at)
      VALUES (?, 'pharmacist', 'pharmacist@pharmacare.com', ?, 'John Pharmacist', 'PHARMACIST', true, NOW())
      ON DUPLICATE KEY UPDATE id=id
    `, [pharmacistId, pharmacistPassword]);

    console.log('✅ Pharmacist user created (username: pharmacist, password: pharmacist123)');

    // Create cashier user
    const cashierId = uuidv4();
    const cashierPassword = await bcrypt.hash('cashier123', 10);
    
    await pool.query(`
      INSERT INTO users (id, username, email, password, name, role, active, created_at)
      VALUES (?, 'cashier', 'cashier@pharmacare.com', ?, 'Jane Cashier', 'CASHIER', true, NOW())
      ON DUPLICATE KEY UPDATE id=id
    `, [cashierId, cashierPassword]);

    console.log('✅ Cashier user created (username: cashier, password: cashier123)');

    // Create sample categories
    const categories = [
      { name: 'Pain Relief', description: 'Analgesics and pain management medications' },
      { name: 'Antibiotics', description: 'Antibacterial medications' },
      { name: 'Vitamins', description: 'Vitamins and dietary supplements' },
      { name: 'First Aid', description: 'First aid supplies and medications' },
      { name: 'Cardiovascular', description: 'Heart and blood pressure medications' }
    ];

    const categoryIds = {};
    for (const cat of categories) {
      const id = uuidv4();
      categoryIds[cat.name] = id;
      await pool.query(`
        INSERT INTO categories (id, name, description, created_at)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE id=id
      `, [id, cat.name, cat.description]);
    }

    console.log('✅ Categories created');

    // Create sample medicines
    const medicines = [
      { name: 'Paracetamol 500mg', generic_name: 'Acetaminophen', category: 'Pain Relief', unit_price: 50, cost_price: 30, stock: 500, reorder: 100 },
      { name: 'Ibuprofen 400mg', generic_name: 'Ibuprofen', category: 'Pain Relief', unit_price: 80, cost_price: 50, stock: 300, reorder: 50 },
      { name: 'Amoxicillin 500mg', generic_name: 'Amoxicillin', category: 'Antibiotics', unit_price: 150, cost_price: 100, stock: 200, reorder: 40 },
      { name: 'Vitamin C 1000mg', generic_name: 'Ascorbic Acid', category: 'Vitamins', unit_price: 120, cost_price: 70, stock: 400, reorder: 80 },
      { name: 'Bandages (Pack)', generic_name: 'Medical Bandage', category: 'First Aid', unit_price: 200, cost_price: 120, stock: 150, reorder: 30 }
    ];

    for (const med of medicines) {
      const id = uuidv4();
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 2);
      
      await pool.query(`
        INSERT INTO medicines (id, name, generic_name, category_id, unit_price, cost_price, stock_quantity, reorder_level, expiry_date, batch_number, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE id=id
      `, [id, med.name, med.generic_name, categoryIds[med.category], med.unit_price, med.cost_price, med.stock, med.reorder, expiryDate, `BATCH-${Date.now()}`]);
    }

    console.log('✅ Sample medicines created');

    // Create sample suppliers
    const suppliers = [
      { name: 'PharmaCo Distributors', contact: 'John Smith', email: 'orders@pharmaco.com', phone: '+254700000001' },
      { name: 'MediSupply Kenya', contact: 'Jane Doe', email: 'sales@medisupply.co.ke', phone: '+254700000002' }
    ];

    for (const sup of suppliers) {
      const id = uuidv4();
      await pool.query(`
        INSERT INTO suppliers (id, name, contact_person, email, phone, active, created_at)
        VALUES (?, ?, ?, ?, ?, true, NOW())
        ON DUPLICATE KEY UPDATE id=id
      `, [id, sup.name, sup.contact, sup.email, sup.phone]);
    }

    console.log('✅ Sample suppliers created');

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\nYou can now login with:');
    console.log('  Admin: admin / admin123');
    console.log('  Manager: manager / manager123');
    console.log('  Pharmacist: pharmacist / pharmacist123');
    console.log('  Cashier: cashier / cashier123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

seedDatabase();
