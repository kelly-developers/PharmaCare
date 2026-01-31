const { pool, config } = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const createEmergencySuperAdmin = async () => {
  console.log('🚨 EMERGENCY SUPER ADMIN CREATION');
  console.log('==================================');
  
  const client = await pool.connect();
  
  try {
    // Ensure we're in the right schema
    await client.query(`SET search_path TO "${config.schema}", public`);
    
    // Create users table if it doesn't exist (simplified version)
    console.log('📋 Checking/Creating users table...');
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
        business_id VARCHAR(36),
        avatar VARCHAR(500),
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Define super admin credentials
    const superAdminCredentials = {
      email: 'superadmin@system.com',
      password: 'SuperSecure123!',
      username: 'superadmin',
      name: 'System Administrator'
    };
    
    console.log('\n🔑 Super Admin Credentials:');
    console.log(`   Email: ${superAdminCredentials.email}`);
    console.log(`   Password: ${superAdminCredentials.password}`);
    console.log(`   Username: ${superAdminCredentials.username}`);
    console.log(`   Name: ${superAdminCredentials.name}`);
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(superAdminCredentials.password, 12);
    console.log(`\n🔐 Hashed Password: ${hashedPassword.substring(0, 50)}...`);
    
    // Check if super admin already exists
    const existingUser = await client.query(
      'SELECT id, email, username, role, password FROM users WHERE email = $1 OR username = $2',
      [superAdminCredentials.email, superAdminCredentials.username]
    );
    
    if (existingUser.rows.length > 0) {
      console.log('\n⚠️ Super admin already exists. Updating...');
      
      // Update existing user
      await client.query(`
        UPDATE users SET 
          password = $1,
          name = $2,
          role = 'SUPER_ADMIN',
          active = true,
          business_id = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE email = $3
      `, [hashedPassword, superAdminCredentials.name, superAdminCredentials.email]);
      
      console.log('✅ Super admin updated successfully!');
    } else {
      console.log('\n📝 Creating new super admin...');
      
      // Create new super admin
      const id = uuidv4();
      
      await client.query(`
        INSERT INTO users (
          id, username, email, password, name, role, active, business_id, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'SUPER_ADMIN', true, NULL, CURRENT_TIMESTAMP
        )
      `, [
        id,
        superAdminCredentials.username,
        superAdminCredentials.email,
        hashedPassword,
        superAdminCredentials.name
      ]);
      
      console.log('✅ Super admin created successfully!');
      console.log(`   User ID: ${id}`);
    }
    
    // Verify the super admin
    console.log('\n🔍 Verifying super admin...');
    const verifyResult = await client.query(
      `SELECT id, username, email, name, role, active, 
              business_id, created_at 
       FROM users WHERE email = $1`,
      [superAdminCredentials.email]
    );
    
    if (verifyResult.rows.length > 0) {
      const user = verifyResult.rows[0];
      console.log('\n✅ SUPER ADMIN VERIFIED:');
      console.log(`   ID: ${user.id}`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Active: ${user.active}`);
      console.log(`   Business ID: ${user.business_id}`);
      console.log(`   Created: ${user.created_at}`);
      
      // Test the password
      const passwordTest = await bcrypt.compare(
        superAdminCredentials.password,
        hashedPassword
      );
      console.log(`   Password test: ${passwordTest ? '✅ PASS' : '❌ FAIL'}`);
    } else {
      console.log('❌ Super admin not found after creation!');
    }
    
    // List all users
    console.log('\n👥 ALL USERS IN DATABASE:');
    const allUsers = await client.query(
      'SELECT id, email, username, name, role, active FROM users ORDER BY created_at'
    );
    
    allUsers.rows.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (${user.username}) - ${user.role} - ${user.active ? 'Active' : 'Inactive'}`);
    });
    
    console.log('\n🎉 EMERGENCY SUPER ADMIN SETUP COMPLETE!');
    console.log('\n📋 LOGIN INSTRUCTIONS:');
    console.log('   1. Go to your login page');
    console.log('   2. Enter email: superadmin@system.com');
    console.log('   3. Enter password: SuperSecure123!');
    console.log('   4. Click Login');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    process.exit(0);
  }
};

// Run the script
createEmergencySuperAdmin();