const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/medicines - Get all medicines (paginated) - UPDATED
router.get('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;
    const search = req.query.search || '';
    const category = req.query.category || '';

    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;

    if (search) {
      paramIndex++;
      whereClause += ` AND (name ILIKE $${paramIndex} OR generic_name ILIKE $${paramIndex} OR manufacturer ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
    }

    if (category) {
      paramIndex++;
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
    }

    const [medicines] = await query(`
      SELECT *
      FROM medicines
      WHERE ${whereClause}
      ORDER BY name
      LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
    `, [...params, size, offset]);

    const [[{ total }]] = await query(`
      SELECT COUNT(*) as total
      FROM medicines
      WHERE ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        content: medicines,
        totalElements: parseInt(total),
        totalPages: Math.ceil(parseInt(total) / size),
        page,
        size
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/categories - Get all distinct categories
router.get('/categories', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [categories] = await query(`
      SELECT DISTINCT category 
      FROM medicines 
      WHERE category IS NOT NULL 
      ORDER BY category
    `);
    res.json({ 
      success: true, 
      data: categories.map(c => c.category).filter(Boolean) 
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/low-stock - Get low stock medicines - UPDATED
router.get('/low-stock', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [medicines] = await query(`
      SELECT *
      FROM medicines
      WHERE stock_quantity <= reorder_level
      ORDER BY stock_quantity ASC
    `);

    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/expiring - Get expiring medicines
router.get('/expiring', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 90;

    const [medicines] = await query(`
      SELECT *
      FROM medicines
      WHERE expiry_date <= CURRENT_DATE + INTERVAL '1 day' * $1
        AND expiry_date IS NOT NULL
      ORDER BY expiry_date ASC
    `, [days]);

    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/stats - Get medicine statistics - UPDATED
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [[{ total_medicines }]] = await query('SELECT COUNT(*) as total_medicines FROM medicines');
    const [[{ low_stock }]] = await query('SELECT COUNT(*) as low_stock FROM medicines WHERE stock_quantity <= reorder_level');
    const [[{ expiring_soon }]] = await query("SELECT COUNT(*) as expiring_soon FROM medicines WHERE expiry_date <= CURRENT_DATE + INTERVAL '90 days'");
    const [[{ out_of_stock }]] = await query('SELECT COUNT(*) as out_of_stock FROM medicines WHERE stock_quantity = 0');

    res.json({
      success: true,
      data: { 
        totalMedicines: parseInt(total_medicines), 
        lowStock: parseInt(low_stock), 
        expiringSoon: parseInt(expiring_soon), 
        outOfStock: parseInt(out_of_stock) 
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/:id - Get medicine by ID - UPDATED
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [medicines] = await query(
      'SELECT * FROM medicines WHERE id = $1',
      [req.params.id]
    );

    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    res.json({ success: true, data: medicines[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/medicines - Create medicine - UPDATED with correct schema
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const {
      name,
      category, // This is the direct category field (string), not category_id
      generic_name,
      description,
      manufacturer,
      unit_price,
      cost_price,
      stock_quantity,
      reorder_level = 10,
      expiry_date,
      batch_number,
      requires_prescription = false,
      product_type,
      units,
      image_url,
  
      
    } = req.body;

    // Validate required fields - category is REQUIRED
    if (!name || !category) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name and category are required fields' 
      });
    }

    const id = uuidv4();

    await query(`
      INSERT INTO medicines (
        id, name, generic_name, category, description, manufacturer,
        unit_price, cost_price, stock_quantity, reorder_level,
        expiry_date, batch_number, requires_prescription, product_type, 
        units, image_url, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      id, 
      name, 
      generic_name || null, 
      category, // This is the critical field - must not be null
      description || null, 
      manufacturer || null,
      parseFloat(unit_price) || 0, 
      parseFloat(cost_price) || 0, 
      parseInt(stock_quantity) || 0, 
      parseInt(reorder_level) || 10,
      expiry_date || null, 
      batch_number || null, 
      Boolean(requires_prescription),
      product_type || null,
      units ? JSON.stringify(units) : null, 
      image_url || null,
      
    ]);

    // Get the created medicine
    const [medicines] = await query(
      'SELECT * FROM medicines WHERE id = $1',
      [id]
    );

    res.status(201).json({ success: true, data: medicines[0] });
  } catch (error) {
    console.error('Create medicine error:', error);
    
    // Handle specific errors
    if (error.code === '23502') {
      return res.status(400).json({
        success: false,
        error: 'Category is a required field'
      });
    }
    
    next(error);
  }
});

// PUT /api/medicines/:id - Update medicine - UPDATED
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const {
      name,
      category, // This is the direct category field
      generic_name,
      description,
      manufacturer,
      unit_price,
      cost_price,
      stock_quantity,
      reorder_level,
      expiry_date,
      batch_number,
      requires_prescription,
      product_type,
      units,
      image_url,
    
      
    } = req.body;

    // Validate required fields - category is REQUIRED
    if (!name || !category) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name and category are required fields' 
      });
    }

    await query(`
      UPDATE medicines SET
        name = $1, 
        generic_name = $2, 
        category = $3, 
        description = $4, 
        manufacturer = $5,
        unit_price = $6, 
        cost_price = $7, 
        stock_quantity = $8, 
        reorder_level = $9,
        expiry_date = $10, 
        batch_number = $11, 
        requires_prescription = $12, 
        product_type = $13,
        units = $14, 
        image_url = $15, 
        
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $18
    `, [
      name, 
      generic_name || null, 
      category,
      description || null, 
      manufacturer || null,
      parseFloat(unit_price) || 0, 
      parseFloat(cost_price) || 0, 
      parseInt(stock_quantity) || 0, 
      parseInt(reorder_level) || 10,
      expiry_date || null, 
      batch_number || null, 
      Boolean(requires_prescription),
      product_type || null,
      units ? JSON.stringify(units) : null, 
      image_url || null,
  

      req.params.id
    ]);

    const [medicines] = await query(
      'SELECT * FROM medicines WHERE id = $1',
      [req.params.id]
    );

    res.json({ success: true, data: medicines[0] });
  } catch (error) {
    console.error('Update medicine error:', error);
    next(error);
  }
});

// DELETE /api/medicines/:id - Delete medicine
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    await query('DELETE FROM medicines WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/medicines/:id/add-stock - Add stock - UPDATED
router.post('/:id/add-stock', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { quantity, batch_number, expiry_date, cost_price, notes } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Valid quantity is required' });
    }

    // Update medicine stock
    await query(
      'UPDATE medicines SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [quantity, req.params.id]
    );

    // If you have a stock_movements table, record the movement
    // For now, just return success
    res.json({
      success: true,
      data: {
        medicine_id: req.params.id,
        quantity_added: quantity
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/medicines/:id/deduct-stock - Deduct stock - UPDATED
router.post('/:id/deduct-stock', authenticate, authorize('ADMIN', 'CASHIER'), async (req, res, next) => {
  try {
    const { quantity, notes, reference_id } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Valid quantity is required' });
    }

    // Check available stock
    const [medicines] = await query('SELECT stock_quantity FROM medicines WHERE id = $1', [req.params.id]);
    
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    if (medicines[0].stock_quantity < quantity) {
      return res.status(400).json({ success: false, error: 'Insufficient stock' });
    }

    // Update medicine stock
    await query(
      'UPDATE medicines SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [quantity, req.params.id]
    );

    // If you have a stock_movements table, record the movement
    res.json({
      success: true,
      data: {
        medicine_id: req.params.id,
        quantity_deducted: quantity
      }
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/medicines/:id/stock - Update stock quantity directly
router.patch('/:id/stock', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { stock_quantity } = req.body;

    if (stock_quantity === undefined || stock_quantity === null) {
      return res.status(400).json({ success: false, error: 'Stock quantity is required' });
    }

    if (parseInt(stock_quantity) < 0) {
      return res.status(400).json({ success: false, error: 'Stock quantity cannot be negative' });
    }

    await query(
      'UPDATE medicines SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [parseInt(stock_quantity), req.params.id]
    );

    const [medicines] = await query(
      'SELECT * FROM medicines WHERE id = $1',
      [req.params.id]
    );

    res.json({ 
      success: true, 
      data: medicines[0],
      message: 'Stock updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;