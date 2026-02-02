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

    // Create all categories
    const categories = [
      { name: 'Pain Relief', description: 'Medications for relieving pain including analgesics and anti-inflammatory drugs' },
      { name: 'Antibiotics', description: 'Antibacterial medications used to treat bacterial infections' },
      { name: 'Vitamins & Supplements', description: 'Vitamins, minerals, and dietary supplements for nutritional support' },
      { name: 'First Aid', description: 'First aid supplies including bandages, antiseptics, and wound care products' },
      { name: 'Cardiovascular', description: 'Medications for heart conditions, blood pressure, and cholesterol management' },
      { name: 'Diabetes Care', description: 'Insulin, glucose monitors, and medications for diabetes management' },
      { name: 'Respiratory', description: 'Medications for asthma, allergies, and respiratory conditions' },
      { name: 'Gastrointestinal', description: 'Medications for digestive issues, antacids, and stomach remedies' },
      { name: 'Mental Health', description: 'Medications for depression, anxiety, and psychiatric conditions' },
      { name: 'Skin Care', description: 'Topical treatments for skin conditions, creams, and ointments' },
      { name: 'Cold & Flu', description: 'Medications for cold, cough, flu, and fever symptoms' },
      { name: 'Women\'s Health', description: 'Medications and products specific to women\'s health needs' },
      { name: 'Men\'s Health', description: 'Medications and products specific to men\'s health needs' },
      { name: 'Baby & Child Care', description: 'Pediatric medications and baby care products' },
      { name: 'Elderly Care', description: 'Medications and products for geriatric health needs' },
      { name: 'Sexual Health', description: 'Contraceptives and medications for sexual health conditions' },
      { name: 'Eye Care', description: 'Eye drops, contact lens solutions, and ocular medications' },
      { name: 'Dental Care', description: 'Oral medications, mouthwashes, and dental hygiene products' },
      { name: 'Herbal & Natural', description: 'Herbal remedies, natural supplements, and alternative medicines' },
      { name: 'Medical Devices', description: 'Medical equipment, testing kits, and health monitoring devices' }
    ];

    for (const cat of categories) {
      const id = uuidv4();
      await pool.query(`
        INSERT INTO categories (id, name, description, created_at)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE id=id
      `, [id, cat.name, cat.description]);
    }

    console.log('✅ All categories created (20 categories)');

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