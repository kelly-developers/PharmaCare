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
      schema: process.env.DB_SCHEMA || jdbcConfig.schema || 'public',
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
    schema: process.env.DB_SCHEMA || 'public',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  };
};

const config = getConnectionConfig();

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
    await client.query(`SET search_path TO ${config.schema}, public`);
    console.log(`✅ Database connected to schema: ${config.schema}`);
  } catch (error) {
    console.error('Failed to set schema:', error);
  }
});

// Query wrapper with better error handling
const query = async (text, params = []) => {
  let client;
  try {
    client = await pool.connect();
    
    // Convert MySQL placeholders (?) to PostgreSQL ($1, $2, etc.)
    let paramIndex = 0;
    const pgText = text.replace(/\?/g, () => `$${++paramIndex}`);
    
    // Convert MySQL functions to PostgreSQL
    const convertedText = pgText
      .replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP')
      .replace(/CURDATE\(\)/gi, 'CURRENT_DATE')
      .replace(/DATE_ADD\(([^,]+),\s*INTERVAL\s+(\?|\$\d+)\s+DAY\)/gi, '($1 + INTERVAL \'1 day\' * $2)')
      .replace(/DATE\(([^)]+)\)/gi, 'DATE($1)')
      .replace(/IFNULL/gi, 'COALESCE')
      .replace(/LIMIT\s+(\?|\$\d+)\s+OFFSET\s+(\?|\$\d+)/gi, 'LIMIT $1 OFFSET $2');
    
    console.log('📝 Executing query:', convertedText.substring(0, 200) + '...');
    console.log('📝 With params:', params);
    
    const result = await client.query(convertedText, params);
    
    // Return in mysql2 format: [[rows], [fields]]
    return [result.rows, result.fields];
  } catch (error) {
    console.error('❌ Query Error:', {
      originalText: text.substring(0, 200),
      params: params,
      error: error.message,
      stack: error.stack
    });
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
  config,
  getConnectionConfig 
};