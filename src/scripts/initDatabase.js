const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, config } = require('../config/database');

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
    console.log('   Admin credentials not configured in environment');
    return;
  }

  // Check if admin already exists
  const existingAdmin = await client.query(
    "SELECT id FROM users WHERE email = $1 OR role = 'ADMIN'",
    [adminEmail]
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
    INSERT INTO users (id, username, email, password, name, phone, role, active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'ADMIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [id, username, adminEmail, hashedPassword, adminName, adminPhone]);

  console.log('✅ Admin user created successfully');
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Username: ${username}`);
};

const initializeDatabase = async () => {
  console.log('🚀 Initializing database connection...');
  console.log(`   Host: ${config.host}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   Schema: ${config.schema}`);
  
  const client = await pool.connect();
  
  try {
    // Set the search path
    await client.query(`SET search_path TO ${config.schema}, public`);
    
    // Verify tables exist by checking one
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 
        AND table_name = 'users'
      )
    `, [config.schema]);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  Tables not found. Please ensure your database schema is set up.');
      console.log('   The backend expects these tables to already exist in your database.');
    } else {
      console.log('✅ Database tables found');
    }
    
    // Create admin user if configured
    await createAdminUser(client);
    
    console.log('');
    console.log('🎉 Database initialization complete!');
    console.log('');
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    // Don't throw - let the server continue and handle errors gracefully
  } finally {
    client.release();
  }
};

module.exports = { initializeDatabase };
