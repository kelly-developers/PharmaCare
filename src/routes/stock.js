const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// GET /api/stock/health - Health check
router.get('/health', async (req, res) => {
  res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
});

// GET /api/stock/recent - Get recent stock movements
router.get('/recent', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const [movements] = await query(`
      SELECT sm.*
      FROM stock_movements sm
      ORDER BY sm.created_at DESC
      LIMIT $1
    `, [limit]);

    res.json({ success: true, data: movements });
  } catch (error) {
    next(error);
  }
});

// GET /api/stock/monthly - Get monthly stock summary
router.get('/monthly', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const currentYear = year || new Date().getFullYear();
    const currentMonth = month || new Date().getMonth() + 1;

    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`;

    const [additionsResult] = await query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE type IN ('ADDITION', 'PURCHASE')
      AND created_at BETWEEN $1 AND $2
    `, [startDate, endDate]);

    const [salesResult] = await query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE type = 'SALE'
      AND created_at BETWEEN $1 AND $2
    `, [startDate, endDate]);

    res.json({
      success: true,
      data: {
        year: parseInt(currentYear),
        month: parseInt(currentMonth),
        totalAdditions: parseInt(getFirst(additionsResult).total) || 0,
        totalSales: parseInt(getFirst(salesResult).total) || 0,
        netChange: (parseInt(getFirst(additionsResult).total) || 0) - (parseInt(getFirst(salesResult).total) || 0)
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stock/summary - Get stock summary for period
router.get('/summary', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = 'AND created_at BETWEEN $1 AND $2';
      params.push(startDate, endDate);
    }

    const [additionsResult] = await query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE type IN ('ADDITION', 'PURCHASE')
      ${dateFilter}
    `, params);

    const [salesResult] = await query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE type = 'SALE'
      ${dateFilter}
    `, params);

    const [lossesResult] = await query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE type = 'LOSS'
      ${dateFilter}
    `, params);

    const additions = parseInt(getFirst(additionsResult).total) || 0;
    const sales = parseInt(getFirst(salesResult).total) || 0;
    const losses = parseInt(getFirst(lossesResult).total) || 0;

    res.json({
      success: true,
      data: {
        totalAdditions: additions,
        totalSales: sales,
        totalLosses: losses,
        netChange: additions - sales - losses
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stock/breakdown - Get stock breakdown by category
router.get('/breakdown', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [breakdown] = await query(`
      SELECT 
        category,
        COUNT(*) as medicine_count,
        COALESCE(SUM(stock_quantity), 0) as total_stock,
        COALESCE(SUM(stock_quantity * cost_price), 0) as total_value
      FROM medicines
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY total_value DESC
    `);

    res.json({ success: true, data: breakdown });
  } catch (error) {
    next(error);
  }
});

// GET /api/stock/movements - Get stock movements (paginated)
router.get('/movements', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [movements] = await query(`
      SELECT sm.*
      FROM stock_movements sm
      ORDER BY sm.created_at DESC
      LIMIT $1 OFFSET $2
    `, [size, offset]);

    const [countResult] = await query('SELECT COUNT(*) as total FROM stock_movements');
    const total = parseInt(getFirst(countResult).total) || 0;

    res.json({
      success: true,
      data: {
        content: movements,
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

// GET /api/stock/movements/reference/:referenceId - Get movements by reference
router.get('/movements/reference/:referenceId', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [movements] = await query(`
      SELECT sm.*
      FROM stock_movements sm
      WHERE sm.reference_id = $1
      ORDER BY sm.created_at DESC
    `, [req.params.referenceId]);

    res.json({ success: true, data: movements });
  } catch (error) {
    next(error);
  }
});

// GET /api/stock/movements/medicine/:medicineId/filtered - Get filtered movements
router.get('/movements/medicine/:medicineId/filtered', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { type, startDate, endDate } = req.query;
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    let whereClause = 'sm.medicine_id = $1';
    const params = [req.params.medicineId];
    let paramIndex = 1;

    if (type) {
      paramIndex++;
      whereClause += ` AND sm.type = $${paramIndex}`;
      params.push(type);
    }
    if (startDate) {
      paramIndex++;
      whereClause += ` AND sm.created_at >= $${paramIndex}`;
      params.push(startDate);
    }
    if (endDate) {
      paramIndex++;
      whereClause += ` AND sm.created_at <= $${paramIndex}`;
      params.push(endDate);
    }

    const [movements] = await query(`
      SELECT sm.*
      FROM stock_movements sm
      WHERE ${whereClause}
      ORDER BY sm.created_at DESC
      LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
    `, [...params, size, offset]);

    const [countResult] = await query(
      `SELECT COUNT(*) as total FROM stock_movements sm WHERE ${whereClause}`,
      params
    );
    const total = parseInt(getFirst(countResult).total) || 0;

    res.json({
      success: true,
      data: {
        content: movements,
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

// GET /api/stock/movements/medicine/:medicineId - Get movements by medicine
router.get('/movements/medicine/:medicineId', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [movements] = await query(`
      SELECT sm.*
      FROM stock_movements sm
      WHERE sm.medicine_id = $1
      ORDER BY sm.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.params.medicineId, size, offset]);

    const [countResult] = await query(
      'SELECT COUNT(*) as total FROM stock_movements WHERE medicine_id = $1',
      [req.params.medicineId]
    );
    const total = parseInt(getFirst(countResult).total) || 0;

    res.json({
      success: true,
      data: {
        content: movements,
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

// GET /api/stock/net-movement/:medicineId - Get net movement for medicine
router.get('/net-movement/:medicineId', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [req.params.medicineId];

    if (startDate && endDate) {
      dateFilter = 'AND created_at BETWEEN $2 AND $3';
      params.push(startDate, endDate);
    }

    const [result] = await query(`
      SELECT 
        COALESCE(SUM(CASE WHEN type IN ('ADDITION', 'PURCHASE') THEN quantity ELSE 0 END), 0) as additions,
        COALESCE(SUM(CASE WHEN type = 'SALE' THEN quantity ELSE 0 END), 0) as sales,
        COALESCE(SUM(CASE WHEN type = 'LOSS' THEN quantity ELSE 0 END), 0) as losses
      FROM stock_movements
      WHERE medicine_id = $1
      ${dateFilter}
    `, params);

    const data = getFirst(result);
    const additions = parseInt(data.additions) || 0;
    const sales = parseInt(data.sales) || 0;
    const losses = parseInt(data.losses) || 0;

    res.json({
      success: true,
      data: {
        additions,
        sales,
        losses,
        netMovement: additions - sales - losses
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/stock/loss - Record stock loss
router.post('/loss', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { medicine_id, quantity, reason, notes } = req.body;

    if (!medicine_id || !quantity || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Medicine ID and valid quantity are required' });
    }

    // Check available stock
    const [medicines] = await query('SELECT * FROM medicines WHERE id = $1', [medicine_id]);
    
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    const medicine = medicines[0];

    if (medicine.stock_quantity < quantity) {
      return res.status(400).json({ success: false, error: 'Insufficient stock for loss recording' });
    }

    const previousStock = medicine.stock_quantity;
    const newStock = previousStock - quantity;

    // Get user name
    const [userResult] = await query('SELECT name, role FROM users WHERE id = $1', [req.user.id]);
    const user = getFirst(userResult);

    // Update medicine stock
    await query(
      'UPDATE medicines SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newStock, medicine_id]
    );

    // Record stock movement
    const id = uuidv4();
    await query(`
      INSERT INTO stock_movements (
        id, medicine_id, medicine_name, type, quantity, reason, notes, 
        created_by, performed_by_name, performed_by_role, previous_stock, new_stock, created_at
      )
      VALUES ($1, $2, $3, 'LOSS', $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
    `, [
      id, medicine_id, medicine.name, quantity, reason || 'Stock loss', notes || null,
      req.user.id, user.name || 'Unknown', user.role || 'UNKNOWN', previousStock, newStock
    ]);

    res.json({
      success: true,
      data: { id, medicine_id, type: 'LOSS', quantity, reason, notes, previous_stock: previousStock, new_stock: newStock }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/stock/adjustment - Record stock adjustment
router.post('/adjustment', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { medicine_id, quantity, reason, notes } = req.body;

    if (!medicine_id || quantity === undefined) {
      return res.status(400).json({ success: false, error: 'Medicine ID and quantity are required' });
    }

    // Get current stock
    const [medicines] = await query('SELECT * FROM medicines WHERE id = $1', [medicine_id]);
    
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    const medicine = medicines[0];
    const previousStock = medicine.stock_quantity;
    const adjustment = quantity - previousStock;

    // Get user name
    const [userResult] = await query('SELECT name, role FROM users WHERE id = $1', [req.user.id]);
    const user = getFirst(userResult);

    // Update medicine stock
    await query(
      'UPDATE medicines SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [quantity, medicine_id]
    );

    // Record stock movement
    const id = uuidv4();
    await query(`
      INSERT INTO stock_movements (
        id, medicine_id, medicine_name, type, quantity, reason, notes, 
        created_by, performed_by_name, performed_by_role, previous_stock, new_stock, created_at
      )
      VALUES ($1, $2, $3, 'ADJUSTMENT', $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
    `, [
      id, medicine_id, medicine.name, adjustment, reason || 'Stock adjustment', notes || null,
      req.user.id, user.name || 'Unknown', user.role || 'UNKNOWN', previousStock, quantity
    ]);

    res.json({
      success: true,
      data: { id, medicine_id, type: 'ADJUSTMENT', previousQuantity: previousStock, newQuantity: quantity, adjustment }
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/stock/movements/:id - Delete stock movement
router.delete('/movements/:id', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    // Get the movement to reverse
    const [movements] = await query('SELECT * FROM stock_movements WHERE id = $1', [req.params.id]);
    
    if (movements.length === 0) {
      return res.status(404).json({ success: false, error: 'Stock movement not found' });
    }

    const movement = movements[0];

    // Reverse the stock change
    let stockChange = 0;
    if (movement.type === 'ADDITION' || movement.type === 'PURCHASE') {
      stockChange = -movement.quantity;
    } else if (movement.type === 'SALE' || movement.type === 'LOSS') {
      stockChange = movement.quantity;
    }

    await query(
      'UPDATE medicines SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [stockChange, movement.medicine_id]
    );

    await query('DELETE FROM stock_movements WHERE id = $1', [req.params.id]);

    res.json({ success: true, message: 'Stock movement deleted and reversed' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
