const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/medicines - Get all medicines (paginated)
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
      whereClause += ` AND (m.name ILIKE $${paramIndex} OR m.generic_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
    }

    if (category) {
      paramIndex++;
      whereClause += ` AND c.name = $${paramIndex}`;
      params.push(category);
    }

    const [medicines] = await query(`
      SELECT m.*, c.name as category_name
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE ${whereClause}
      ORDER BY m.name
      LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
    `, [...params, size, offset]);

    const [[{ total }]] = await query(`
      SELECT COUNT(*) as total
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
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

// GET /api/medicines/categories - Get all category names
router.get('/categories', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [categories] = await query('SELECT name FROM categories ORDER BY name');
    res.json({ success: true, data: categories.map(c => c.name) });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/low-stock - Get low stock medicines
router.get('/low-stock', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [medicines] = await query(`
      SELECT m.*, c.name as category_name
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE m.stock_quantity <= m.reorder_level
      ORDER BY m.stock_quantity ASC
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
      SELECT m.*, c.name as category_name
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE m.expiry_date <= CURRENT_DATE + INTERVAL '1 day' * $1
      ORDER BY m.expiry_date ASC
    `, [days]);

    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/stats - Get medicine statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [[{ totalmedicines }]] = await query('SELECT COUNT(*) as totalMedicines FROM medicines');
    const [[{ lowstock }]] = await query('SELECT COUNT(*) as lowStock FROM medicines WHERE stock_quantity <= reorder_level');
    const [[{ expiringsoon }]] = await query("SELECT COUNT(*) as expiringSoon FROM medicines WHERE expiry_date <= CURRENT_DATE + INTERVAL '90 days'");
    const [[{ outofstock }]] = await query('SELECT COUNT(*) as outOfStock FROM medicines WHERE stock_quantity = 0');

    res.json({
      success: true,
      data: { 
        totalMedicines: parseInt(totalmedicines), 
        lowStock: parseInt(lowstock), 
        expiringSoon: parseInt(expiringsoon), 
        outOfStock: parseInt(outofstock) 
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/:id - Get medicine by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [medicines] = await query(`
      SELECT m.*, c.name as category_name
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE m.id = $1
    `, [req.params.id]);

    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    res.json({ success: true, data: medicines[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/medicines - Create medicine
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const {
      name, generic_name, category_id, description, manufacturer,
      unit_price, cost_price, stock_quantity, reorder_level,
      expiry_date, batch_number, requires_prescription, product_type,
      units, image_url
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const id = uuidv4();

    await query(`
      INSERT INTO medicines (
        id, name, generic_name, category_id, description, manufacturer,
        unit_price, cost_price, stock_quantity, reorder_level,
        expiry_date, batch_number, requires_prescription, product_type, units, image_url, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
    `, [
      id, name, generic_name, category_id, description, manufacturer,
      unit_price || 0, cost_price || 0, stock_quantity || 0, reorder_level || 10,
      expiry_date || null, batch_number, requires_prescription || false, product_type,
      units ? JSON.stringify(units) : null, image_url
    ]);

    // Get the created medicine with category
    const [medicines] = await query(`
      SELECT m.*, c.name as category_name
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE m.id = $1
    `, [id]);

    res.status(201).json({ success: true, data: medicines[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/medicines/:id - Update medicine
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const {
      name, generic_name, category_id, description, manufacturer,
      unit_price, cost_price, stock_quantity, reorder_level,
      expiry_date, batch_number, requires_prescription, product_type,
      units, image_url
    } = req.body;

    await query(`
      UPDATE medicines SET
        name = $1, generic_name = $2, category_id = $3, description = $4, manufacturer = $5,
        unit_price = $6, cost_price = $7, stock_quantity = $8, reorder_level = $9,
        expiry_date = $10, batch_number = $11, requires_prescription = $12, product_type = $13,
        units = $14, image_url = $15, updated_at = CURRENT_TIMESTAMP
      WHERE id = $16
    `, [
      name, generic_name, category_id, description, manufacturer,
      unit_price, cost_price, stock_quantity, reorder_level,
      expiry_date || null, batch_number, requires_prescription, product_type,
      units ? JSON.stringify(units) : null, image_url, req.params.id
    ]);

    const [medicines] = await query(`
      SELECT m.*, c.name as category_name
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE m.id = $1
    `, [req.params.id]);

    res.json({ success: true, data: medicines[0] });
  } catch (error) {
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

// POST /api/medicines/:id/add-stock - Add stock
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

    // Record stock movement
    const movementId = uuidv4();
    await query(`
      INSERT INTO stock_movements (id, medicine_id, type, quantity, batch_number, notes, created_by, created_at)
      VALUES ($1, $2, 'ADDITION', $3, $4, $5, $6, CURRENT_TIMESTAMP)
    `, [movementId, req.params.id, quantity, batch_number, notes, req.user.id]);

    res.json({
      success: true,
      data: {
        id: movementId,
        medicine_id: req.params.id,
        type: 'ADDITION',
        quantity
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/medicines/:id/deduct-stock - Deduct stock
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

    // Record stock movement
    const movementId = uuidv4();
    await query(`
      INSERT INTO stock_movements (id, medicine_id, type, quantity, reference_id, notes, created_by, created_at)
      VALUES ($1, $2, 'SALE', $3, $4, $5, $6, CURRENT_TIMESTAMP)
    `, [movementId, req.params.id, quantity, reference_id, notes, req.user.id]);

    res.json({
      success: true,
      data: {
        id: movementId,
        medicine_id: req.params.id,
        type: 'SALE',
        quantity
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
