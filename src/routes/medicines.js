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
      whereClause += ` AND (name ILIKE $${paramIndex} OR generic_name ILIKE $${paramIndex} OR manufacturer ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
    }

    if (category) {
      paramIndex++;
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
    }

    const [medicines] = await query(`
      SELECT 
        id, name, generic_name, category, description, manufacturer,
        unit_price, cost_price, stock_quantity, reorder_level,
        expiry_date, batch_number, requires_prescription, product_type,
        units, image_url, created_at, updated_at,
        (stock_quantity * cost_price) as stock_value,
        CASE 
          WHEN stock_quantity = 0 THEN 'Out of Stock'
          WHEN stock_quantity <= reorder_level THEN 'Low Stock'
          ELSE 'In Stock'
        END as status
      FROM medicines
      WHERE ${whereClause}
      ORDER BY name
      LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
    `, [...params, size, offset]);

    const [countResult] = await query(`
      SELECT COUNT(*) as total
      FROM medicines
      WHERE ${whereClause}
    `, params);

    const total = parseInt(countResult[0]?.total) || 0;

    res.json({
      success: true,
      data: {
        content: medicines,
        totalElements: total,
        totalPages: Math.ceil(total / size),
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
      WHERE category IS NOT NULL AND category != ''
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

// GET /api/medicines/low-stock - Get low stock medicines
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

// GET /api/medicines/stats - Get medicine statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [totalResult] = await query('SELECT COUNT(*) as total FROM medicines');
    const [lowStockResult] = await query('SELECT COUNT(*) as count FROM medicines WHERE stock_quantity <= reorder_level');
    const [expiringResult] = await query("SELECT COUNT(*) as count FROM medicines WHERE expiry_date <= CURRENT_DATE + INTERVAL '90 days'");
    const [outOfStockResult] = await query('SELECT COUNT(*) as count FROM medicines WHERE stock_quantity = 0');

    res.json({
      success: true,
      data: { 
        totalMedicines: parseInt(totalResult[0]?.total) || 0, 
        lowStock: parseInt(lowStockResult[0]?.count) || 0, 
        expiringSoon: parseInt(expiringResult[0]?.count) || 0, 
        outOfStock: parseInt(outOfStockResult[0]?.count) || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/:id - Get medicine by ID
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

// POST /api/medicines - Create medicine
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const {
      name,
      category,
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

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Medicine name is required' 
      });
    }

    if (!category || !category.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Category is required' 
      });
    }

    // Validate numeric fields
    if (cost_price !== undefined && (isNaN(cost_price) || cost_price < 0)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cost price must be a non-negative number' 
      });
    }

    if (stock_quantity !== undefined && (isNaN(stock_quantity) || stock_quantity < 0)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Stock quantity must be a non-negative number' 
      });
    }

    const id = uuidv4();

    await query(`
      INSERT INTO medicines (
        id, name, generic_name, category, description, manufacturer,
        unit_price, cost_price, stock_quantity, reorder_level,
        expiry_date, batch_number, requires_prescription, product_type, 
        units, image_url, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      id, 
      name.trim(), 
      generic_name || null, 
      category.trim(),
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
    
    if (error.code === '23502') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: ' + (error.column || 'unknown')
      });
    }
    
    next(error);
  }
});

// PUT /api/medicines/:id - Update medicine
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const {
      name,
      category,
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

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Medicine name is required' 
      });
    }

    if (!category || !category.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Category is required' 
      });
    }

    // Check if medicine exists
    const [existing] = await query('SELECT id FROM medicines WHERE id = $1', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
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
      WHERE id = $16
    `, [
      name.trim(), 
      generic_name || null, 
      category.trim(),
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
    // Check if medicine has sale items
    const [saleItems] = await query(
      'SELECT COUNT(*) as count FROM sale_items WHERE medicine_id = $1',
      [req.params.id]
    );

    if (parseInt(saleItems[0]?.count) > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete medicine with sales history' 
      });
    }

    await query('DELETE FROM medicines WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Medicine deleted successfully' });
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

    // Get current medicine
    const [medicines] = await query('SELECT * FROM medicines WHERE id = $1', [req.params.id]);
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    const medicine = medicines[0];
    const previousStock = medicine.stock_quantity;
    const newStock = previousStock + parseInt(quantity);

    // Update medicine stock and optionally update cost price and batch info
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    updateFields.push(`stock_quantity = $${paramIndex++}`);
    updateValues.push(newStock);

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    
    if (cost_price) {
      updateFields.push(`cost_price = $${paramIndex++}`);
      updateValues.push(parseFloat(cost_price));
    }
    
    if (batch_number) {
      updateFields.push(`batch_number = $${paramIndex++}`);
      updateValues.push(batch_number);
    }
    
    if (expiry_date) {
      updateFields.push(`expiry_date = $${paramIndex++}`);
      updateValues.push(expiry_date);
    }

    updateValues.push(req.params.id);

    await query(
      `UPDATE medicines SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      updateValues
    );

    // Record stock movement
    const movementId = uuidv4();
    await query(`
      INSERT INTO stock_movements (
        id, medicine_id, type, quantity, batch_number, notes, created_by, 
        created_at, medicine_name, previous_stock, new_stock
      )
      VALUES ($1, $2, 'ADDITION', $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9)
    `, [movementId, req.params.id, quantity, batch_number || null, notes || null, req.user.id, medicine.name, previousStock, newStock]);

    res.json({
      success: true,
      data: {
        medicine_id: req.params.id,
        quantity_added: quantity,
        previous_stock: previousStock,
        new_stock: newStock,
        batch_number: batch_number || medicine.batch_number,
        expiry_date: expiry_date || medicine.expiry_date,
        cost_price: cost_price || medicine.cost_price
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
    const [medicines] = await query('SELECT * FROM medicines WHERE id = $1', [req.params.id]);
    
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    const medicine = medicines[0];

    if (medicine.stock_quantity < quantity) {
      return res.status(400).json({ success: false, error: 'Insufficient stock' });
    }

    const previousStock = medicine.stock_quantity;
    const newStock = previousStock - parseInt(quantity);

    // Update medicine stock
    await query(
      'UPDATE medicines SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newStock, req.params.id]
    );

    res.json({
      success: true,
      data: {
        medicine_id: req.params.id,
        quantity_deducted: quantity,
        previous_stock: previousStock,
        new_stock: newStock
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

// POST /api/medicines/:id/update-batch - Update batch information
router.post('/:id/update-batch', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { batch_number, expiry_date } = req.body;

    const [medicines] = await query('SELECT * FROM medicines WHERE id = $1', [req.params.id]);
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (batch_number !== undefined) {
      updateFields.push(`batch_number = $${paramIndex++}`);
      updateValues.push(batch_number || null);
    }

    if (expiry_date !== undefined) {
      updateFields.push(`expiry_date = $${paramIndex++}`);
      updateValues.push(expiry_date || null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(req.params.id);

    await query(
      `UPDATE medicines SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      updateValues
    );

    const [updatedMedicine] = await query(
      'SELECT * FROM medicines WHERE id = $1',
      [req.params.id]
    );

    res.json({ 
      success: true, 
      data: updatedMedicine[0],
      message: 'Batch information updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;