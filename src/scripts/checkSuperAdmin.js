const { pool, config } = require('../config/database');
const bcrypt = require('bcryptjs');

const checkSuperAdmin = async () => {
  console.log('🔍 Checking super admin status...');
  
  const client = await pool.connect();
  
  try {
    // Set schema
    await client.query(`SET search_path TO "${config.schema}", public`);
    
    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 
        AND table_name = 'users'
      )
    `, [config.schema]);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ Users table does not exist!');
      return;
    }
    
    // Check all columns in users table
    const columns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = $1 
      AND table_name = 'users'
      ORDER BY ordinal_position
    `, [config.schema]);
    
    console.log('📋 Users table columns:');
    columns.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    });
    
    // Check for super admin
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@system.com';
    const result = await client.query(
      'SELECT id, email, username, name, role, password FROM users WHERE email = $1 OR role = $2',
      [superAdminEmail, 'SUPER_ADMIN']
    );
    
    console.log('\n👑 Super Admin Status:');
    if (result.rows.length === 0) {
      console.log('❌ No super admin found!');
      
      // Create super admin now
      console.log('📝 Creating super admin...');
      const { v4: uuidv4 } = require('uuid');
      const id = uuidv4();
      const username = 'superadmin';
      const email = superAdminEmail;
      const name = process.env.SUPER_ADMIN_NAME || 'System Administrator';
      const password = process.env.SUPER_ADMIN_PASSWORD || 'SuperSecure123!';
      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Check if business_id column exists
      const hasBusinessId = columns.rows.some(col => col.column_name === 'business_id');
      
      if (hasBusinessId) {
        await client.query(`
          INSERT INTO users (id, username, email, password, name, role, active, business_id)
          VALUES ($1, $2, $3, $4, $5, 'SUPER_ADMIN', true, NULL)
        `, [id, username, email, hashedPassword, name]);
      } else {
        await client.query(`
          INSERT INTO users (id, username, email, password, name, role, active)
          VALUES ($1, $2, $3, $4, $5, 'SUPER_ADMIN', true)
        `, [id, username, email, hashedPassword, name]);
      }
      
      console.log('✅ Super admin created!');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${password}`);
      console.log(`   Hashed password: ${hashedPassword.substring(0, 20)}...`);
    } else {
      console.log('✅ Super admin found!');
      result.rows.forEach(user => {
        console.log(`   ID: ${user.id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Username: ${user.username}`);
        console.log(`   Name: ${user.name}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Password hash: ${user.password ? user.password.substring(0, 30) + '...' : 'NULL'}`);
        
        // Test the password
        const testPassword = process.env.SUPER_ADMIN_PASSWORD || 'SuperSecure123!';
        const passwordMatches = user.password ? bcrypt.compareSync(testPassword, user.password) : false;
        console.log(`   Password matches '${testPassword}': ${passwordMatches ? '✅' : '❌'}`);
      });
    }
    
    // Show all users
    const allUsers = await client.query(
      'SELECT id, email, username, name, role, active FROM users ORDER BY created_at'
    );
    
    console.log('\n👥 All users in database:');
    allUsers.rows.forEach(user => {
      console.log(`   - ${user.email} (${user.username}) - ${user.role} - ${user.active ? 'Active' : 'Inactive'}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking super admin:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
  }
};

checkSuperAdmin();