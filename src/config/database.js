const { Pool } = require('pg');

// Parse the JDBC URL to extract connection details
const parseJdbcUrl = (jdbcUrl) => {
  if (!jdbcUrl) return null;
  
  const match = jdbcUrl.match(/jdbc:postgresql:\/\/([^:\/]+):?(\d*)?\/([^?]+)(\?.*)?/);
  if (match) {
    const params = new URLSearchParams(match[4]?.substring(1) || '');
    return {
      host: match[1],
      port: parseInt(match[2]) || 5432,
      database: match[3],
      schema: params.get('currentSchema') || 'public'
    };
  }
  return null;
};

// Get connection config from environment
const getConnectionConfig = () => {
  const jdbcConfig = parseJdbcUrl(process.env.DATASOURCE_URL);
  
  if (jdbcConfig) {
    return {
      host: jdbcConfig.host,
      port: jdbcConfig.port,
      database: jdbcConfig.database,
      user: process.env.DATASOURCE_USER || process.env.DB_USER,
      password: process.env.DATASOURCE_PASSWORD || process.env.DB_PASSWORD,
      schema: process.env.DB_SCHEMA || jdbcConfig.schema || 'sme_platform',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };
  }
  
  // Fallback to individual env vars
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'pharmacare',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    schema: process.env.DB_SCHEMA || 'sme_platform',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  };
};

const config = getConnectionConfig();

console.log('📊 Database Configuration:', {
  host: config.host,
  database: config.database,
  schema: config.schema,
  user: config.user
});

const pool = new Pool({
  host: config.host,
  port: config.port,
  database: config.database,
  user: config.user,
  password: config.password,
  ssl: config.ssl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Set schema on each connection
pool.on('connect', async (client) => {
  try {
    const schema = config.schema;
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    console.log(`✅ Database connected to schema: ${schema}`);
  } catch (error) {
    console.error('Failed to set schema:', error.message);
  }
});

// Enhanced query wrapper with schema handling
const query = async (text, params = []) => {
  let client;
  try {
    client = await pool.connect();
    
    // Always set schema first
    await client.query(`SET search_path TO "${config.schema}", public`);
    
    // Convert MySQL placeholders if present
    let pgText = text;
    if (text.includes('?')) {
      let paramIndex = 0;
      pgText = text.replace(/\?/g, () => `$${++paramIndex}`);
    }
    
    // Convert MySQL functions to PostgreSQL
    pgText = pgText
      .replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP')
      .replace(/CURDATE\(\)/gi, 'CURRENT_DATE')
      .replace(/IFNULL/gi, 'COALESCE')
      .replace(/LIMIT\s+(\?|\$\d+),\s*(\?|\$\d+)/gi, 'LIMIT $2 OFFSET $1');
    
    // Log in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📝 Query: ${pgText.substring(0, 150)}${pgText.length > 150 ? '...' : ''}`);
    }
    
    const result = await client.query(pgText, params);
    
    // Return in mysql2 format for compatibility
    return [result.rows, result.fields || []];
  } catch (error) {
    console.error('❌ Query Error:', error.message);
    console.error('Query:', text.substring(0, 200));
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Direct query method for transactions
const queryDirect = async (client, text, params = []) => {
  return client.query(text, params);
};

module.exports = { 
  query, 
  queryDirect,
  pool, 
  config
};