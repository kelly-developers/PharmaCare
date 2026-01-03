const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.errors
    });
  }

  // PostgreSQL errors
  if (err.code === '23505') { // unique_violation
    return res.status(409).json({
      success: false,
      error: 'Duplicate entry. This record already exists.'
    });
  }

  if (err.code === '23503') { // foreign_key_violation
    return res.status(400).json({
      success: false,
      error: 'Referenced record does not exist.'
    });
  }

  if (err.code === '22P02') { // invalid_text_representation
    return res.status(400).json({
      success: false,
      error: 'Invalid data format provided.'
    });
  }

  if (err.code === '42P01') { // undefined_table
    return res.status(500).json({
      success: false,
      error: 'Database table not found. Please run database initialization.'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message || 'Internal server error'
  });
};

module.exports = { errorHandler };
