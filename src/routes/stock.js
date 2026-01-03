const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/stock/health - Health check
router.get('/health', async (req, res) => {
  res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
});

// GET /api/stock/movements - Get stock movements (paginated)
router.get('/movements', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [movements] = await db.query(`
      SELECT sm.*, m.name as medicine_name, u.name as created_by_name
      FROM stock_movements sm
      LEFT JOIN medicines m ON sm.medicine_id = m.id
      LEFT JOIN users u ON sm.created_by = u.id
      ORDER BY sm.created_at DESC
      LIMIT ? OFFSET ?
    `, [size, offset]);

    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM stock_movements');

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

// GET /api/stock/recent - Get recent stock movements
router.get('/recent', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const [movements] = await db.query(`
      SELECT sm.*, m.name as medicine_name, u.name as created_by_name
      FROM stock_movements sm
      LEFT JOIN medicines m ON sm.medicine_id = m.id
      LEFT JOIN users u ON sm.created_by = u.id
      ORDER BY sm.created_at DESC
      LIMIT ?
    `, [limit]);

    res.json({ success: true, data: movements });
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

    const [movements] = await db.query(`
      SELECT sm.*, m.name as medicine_name, u.name as created_by_name
      FROM stock_movements sm
      LEFT JOIN medicines m ON sm.medicine_id = m.id
      LEFT JOIN users u ON sm.created_by = u.id
      WHERE sm.medicine_id = ?
      ORDER BY sm.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.params.medicineId, size, offset]);

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) as total FROM stock_movements WHERE medicine_id = ?',
      [req.params.medicineId]
    );

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

// GET /api/stock/movements/medicine/:medicineId/filtered - Get filtered movements
router.get('/movements/medicine/:medicineId/filtered', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { type, startDate, endDate } = req.query;
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    let whereClause = 'sm.medicine_id = ?';
    const params = [req.params.medicineId];

    if (type) {
      whereClause += ' AND sm.type = ?';
      params.push(type);
    }
    if (startDate) {
      whereClause += ' AND sm.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ' AND sm.created_at <= ?';
      params.push(endDate);
    }

    const [movements] = await db.query(`
      SELECT sm.*, m.name as medicine_name, u.name as created_by_name
      FROM stock_movements sm
      LEFT JOIN medicines m ON sm.medicine_id = m.id
      LEFT JOIN users u ON sm.created_by = u.id
      WHERE ${whereClause}
      ORDER BY sm.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, size, offset]);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM stock_movements sm WHERE ${whereClause}`,
      params
    );

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
    const [movements] = await db.query(`
      SELECT sm.*, m.name as medicine_name, u.name as created_by_name
      FROM stock_movements sm
      LEFT JOIN medicines m ON sm.medicine_id = m.id
      LEFT JOIN users u ON sm.created_by = u.id
      WHERE sm.reference_id = ?
      ORDER BY sm.created_at DESC
    `, [req.params.referenceId]);

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

    const [[additions]] = await db.query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE type IN ('ADDITION', 'PURCHASE')
      AND created_at BETWEEN ? AND ?
    `, [startDate, endDate]);

    const [[deductions]] = await db.query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE type IN ('SALE', 'LOSS', 'ADJUSTMENT')
      AND quantity < 0
      AND created_at BETWEEN ? AND ?
    `, [startDate, endDate]);

    res.json({
      success: true,
      data: {
        year: parseInt(currentYear),
        month: parseInt(currentMonth),
        totalAdditions: additions.total,
        totalDeductions: Math.abs(deductions.total),
        netChange: additions.total - Math.abs(deductions.total)
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
      dateFilter = 'AND created_at BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    const [[additions]] = await db.query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE type IN ('ADDITION', 'PURCHASE')
      ${dateFilter}
    `, params);

    const [[sales]] = await db.query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE type = 'SALE'
      ${dateFilter}
    `, params);

    const [[losses]] = await db.query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE type = 'LOSS'
      ${dateFilter}
    `, params);

    res.json({
      success: true,
      data: {
        totalAdditions: additions.total,
        totalSales: sales.total,
        totalLosses: losses.total,
        netChange: additions.total - sales.total - losses.total
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
      dateFilter = 'AND created_at BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    const [[result]] = await db.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN type IN ('ADDITION', 'PURCHASE') THEN quantity ELSE 0 END), 0) as additions,
        COALESCE(SUM(CASE WHEN type = 'SALE' THEN quantity ELSE 0 END), 0) as sales,
        COALESCE(SUM(CASE WHEN type = 'LOSS' THEN quantity ELSE 0 END), 0) as losses
      FROM stock_movements
      WHERE medicine_id = ?
      ${dateFilter}
    `, params);

    res.json({
      success: true,
      data: {
        additions: result.additions,
        sales: result.sales,
        losses: result.losses,
        netMovement: result.additions - result.sales - result.losses
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stock/breakdown - Get stock breakdown
router.get('/breakdown', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [breakdown] = await db.query(`
      SELECT 
        c.name as category,
        COUNT(m.id) as medicine_count,
        COALESCE(SUM(m.stock_quantity), 0) as total_stock,
        COALESCE(SUM(m.stock_quantity * m.cost_price), 0) as total_value
      FROM categories c
      LEFT JOIN medicines m ON m.category_id = c.id
      GROUP BY c.id, c.name
      ORDER BY total_value DESC
    `);

    res.json({ success: true, data: breakdown });
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
    const [medicines] = await db.query('SELECT stock_quantity FROM medicines WHERE id = ?', [medicine_id]);
    
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    if (medicines[0].stock_quantity < quantity) {
      return res.status(400).json({ success: false, error: 'Insufficient stock for loss recording' });
    }

    // Update medicine stock
    await db.query(
      'UPDATE medicines SET stock_quantity = stock_quantity - ?, updated_at = NOW() WHERE id = ?',
      [quantity, medicine_id]
    );

    // Record stock movement
    const id = uuidv4();
    await db.query(`
      INSERT INTO stock_movements (id, medicine_id, type, quantity, notes, created_by, created_at)
      VALUES (?, ?, 'LOSS', ?, ?, ?, NOW())
    `, [id, medicine_id, quantity, `${reason || 'Stock loss'}: ${notes || ''}`, req.user.id]);

    res.json({
      success: true,
      data: { id, medicine_id, type: 'LOSS', quantity, reason, notes }
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
    const [medicines] = await db.query('SELECT stock_quantity FROM medicines WHERE id = ?', [medicine_id]);
    
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    const currentStock = medicines[0].stock_quantity;
    const adjustment = quantity - currentStock;

    // Update medicine stock
    await db.query(
      'UPDATE medicines SET stock_quantity = ?, updated_at = NOW() WHERE id = ?',
      [quantity, medicine_id]
    );

    // Record stock movement
    const id = uuidv4();
    await db.query(`
      INSERT INTO stock_movements (id, medicine_id, type, quantity, notes, created_by, created_at)
      VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?, NOW())
    `, [id, medicine_id, adjustment, `${reason || 'Stock adjustment'}: ${notes || ''}`, req.user.id]);

    res.json({
      success: true,
      data: { id, medicine_id, type: 'ADJUSTMENT', previousQuantity: currentStock, newQuantity: quantity, adjustment }
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/stock/movements/:id - Delete stock movement
router.delete('/movements/:id', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    // Get the movement to reverse
    const [movements] = await db.query('SELECT * FROM stock_movements WHERE id = ?', [req.params.id]);
    
    if (movements.length === 0) {
      return res.status(404).json({ success: false, error: 'Stock movement not found' });
    }

    const movement = movements[0];

    // Reverse the stock change
    let stockChange = 0;
    if (movement.type === 'ADDITION' || movement.type === 'PURCHASE') {
      stockChange = -movement.quantity; // Remove added stock
    } else if (movement.type === 'SALE' || movement.type === 'LOSS') {
      stockChange = movement.quantity; // Add back sold/lost stock
    }

    await db.query(
      'UPDATE medicines SET stock_quantity = stock_quantity + ?, updated_at = NOW() WHERE id = ?',
      [stockChange, movement.medicine_id]
    );

    await db.query('DELETE FROM stock_movements WHERE id = ?', [req.params.id]);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
