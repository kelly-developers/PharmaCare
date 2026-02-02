const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize, requireBusinessContext } = require('../middleware/auth');

const router = express.Router();

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// Helper to validate and fix date parameters
const validateAndFixDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  try {
    const dateOnly = dateStr.split('T')[0];
    const parts = dateOnly.split('-');
    
    if (parts.length !== 3) return dateStr;
    
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const day = parseInt(parts[2]);
    
    if (year < 1900 || year > 2100) {
      const currentYear = new Date().getFullYear();
      return `${currentYear}-${month.toString().padStart(2, '0')}-${Math.min(day, 28).toString().padStart(2, '0')}`;
    }
    
    if (month < 1 || month > 12) {
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const lastDay = new Date(currentYear, currentMonth, 0).getDate();
      return `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${Math.min(day, lastDay).toString().padStart(2, '0')}`;
    }
    
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    
    let fixedDay = day;
    if (day < 1) {
      fixedDay = 1;
    } else if (day > lastDayOfMonth) {
      fixedDay = lastDayOfMonth;
    }
    
    return `${year}-${month.toString().padStart(2, '0')}-${fixedDay.toString().padStart(2, '0')}`;
    
  } catch (error) {
    console.warn(`⚠️ Date validation failed for "${dateStr}":`, error.message);
    const today = new Date();
    return `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
  }
};

const getSafeDateRange = (startDate, endDate) => {
  const safeStartDate = validateAndFixDate(startDate);
  const safeEndDate = validateAndFixDate(endDate);
  
  if (safeStartDate && safeEndDate && safeEndDate < safeStartDate) {
    return { startDate: safeEndDate, endDate: safeStartDate };
  }
  
  return { startDate: safeStartDate, endDate: safeEndDate };
};

const getLastDayOfMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

const createSafeDateQuery = (year, month, day = null) => {
  const safeYear = year || new Date().getFullYear();
  const safeMonth = Math.max(1, Math.min(12, month || new Date().getMonth() + 1));
  
  if (day) {
    const lastDay = getLastDayOfMonth(safeYear, safeMonth);
    const safeDay = Math.max(1, Math.min(day, lastDay));
    return `${safeYear}-${safeMonth.toString().padStart(2, '0')}-${safeDay.toString().padStart(2, '0')}`;
  } else {
    const lastDay = getLastDayOfMonth(safeYear, safeMonth);
    return {
      startDate: `${safeYear}-${safeMonth.toString().padStart(2, '0')}-01`,
      endDate: `${safeYear}-${safeMonth.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`
    };
  }
};

// GET /api/stock/health - Health check
router.get('/health', async (req, res) => {
  res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
});

// GET /api/stock/recent - Get recent stock movements
router.get('/recent', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    let whereClause = '1=1';
    const params = [];
    
    if (req.businessId) {
      whereClause = 'sm.business_id = $1';
      params.push(req.businessId);
    }

    const [movements] = await query(`
      SELECT sm.*
      FROM stock_movements sm
      WHERE ${whereClause}
      ORDER BY sm.created_at DESC
      LIMIT $${params.length + 1}
    `, [...params, limit]);

    res.json({ success: true, data: movements });
  } catch (error) {
    next(error);
  }
});

// GET /api/stock/monthly - Get monthly stock summary
router.get('/monthly', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { year, month } = req.query;
    
    const { startDate, endDate } = createSafeDateQuery(
      parseInt(year),
      parseInt(month)
    );

    console.log(`📊 Monthly stock query for: ${startDate} to ${endDate}`);

    let additionsWhereClause = "type IN ('ADDITION', 'PURCHASE') AND DATE(created_at) BETWEEN $1 AND $2";
    let salesWhereClause = "type = 'SALE' AND DATE(created_at) BETWEEN $1 AND $2";
    const params = [startDate, endDate];
    
    if (req.businessId) {
      additionsWhereClause += ' AND business_id = $3';
      salesWhereClause += ' AND business_id = $3';
      params.push(req.businessId);
    }

    const [additionsResult] = await query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE ${additionsWhereClause}
    `, params);

    const [salesResult] = await query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE ${salesWhereClause}
    `, params);

    res.json({
      success: true,
      data: {
        year: parseInt(year || new Date().getFullYear()),
        month: parseInt(month || new Date().getMonth() + 1),
        totalAdditions: parseInt(getFirst(additionsResult).total) || 0,
        totalSales: parseInt(getFirst(salesResult).total) || 0,
        netChange: (parseInt(getFirst(additionsResult).total) || 0) - (parseInt(getFirst(salesResult).total) || 0)
      }
    });
  } catch (error) {
    console.error('❌ Monthly stock error:', error);
    next(error);
  }
});

// GET /api/stock/summary - Get stock summary for period
router.get('/summary', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const { startDate: safeStartDate, endDate: safeEndDate } = getSafeDateRange(startDate, endDate);
    
    console.log(`📊 Stock summary query: ${safeStartDate || 'No start date'} to ${safeEndDate || 'No end date'}`);

    let dateFilter = '';
    const params = [];
    let paramIndex = 0;
    
    // CRITICAL: Filter by business_id
    if (req.businessId) {
      paramIndex++;
      params.push(req.businessId);
    }

    if (safeStartDate && safeEndDate) {
      paramIndex++;
      dateFilter = `AND DATE(created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(safeStartDate, safeEndDate);
    }

    const businessFilter = req.businessId ? 'business_id = $1' : '1=1';

    const [additionsResult] = await query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE ${businessFilter} AND type IN ('ADDITION', 'PURCHASE')
      ${dateFilter}
    `, params);

    const [salesResult] = await query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE ${businessFilter} AND type = 'SALE'
      ${dateFilter}
    `, params);

    const [lossesResult] = await query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_movements
      WHERE ${businessFilter} AND type = 'LOSS'
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
        netChange: additions - sales - losses,
        dateRange: {
          startDate: safeStartDate,
          endDate: safeEndDate
        }
      }
    });
  } catch (error) {
    console.error('❌ Stock summary error:', error);
    next(error);
  }
});

// GET /api/stock/breakdown - Get stock breakdown by category
router.get('/breakdown', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = "category IS NOT NULL AND category != ''";
    const params = [];
    
    if (req.businessId) {
      whereClause += ' AND business_id = $1';
      params.push(req.businessId);
    }

    const [breakdown] = await query(`
      SELECT 
        category,
        COUNT(*) as medicine_count,
        COALESCE(SUM(stock_quantity), 0) as total_stock,
        COALESCE(SUM(stock_quantity * cost_price), 0) as total_value
      FROM medicines
      WHERE ${whereClause}
      GROUP BY category
      ORDER BY total_value DESC
    `, params);

    res.json({ success: true, data: breakdown });
  } catch (error) {
    next(error);
  }
});

// GET /api/stock/movements - Get all stock movements
// FIXED: Filter by business_id
router.get('/movements', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { type, medicineId, startDate, endDate } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;
    
    // CRITICAL: Filter by business_id
    if (req.businessId) {
      paramIndex++;
      whereClause += ` AND sm.business_id = $${paramIndex}`;
      params.push(req.businessId);
    }
    
    if (type) {
      paramIndex++;
      whereClause += ` AND sm.type = $${paramIndex}`;
      params.push(type.toUpperCase());
    }
    
    if (medicineId) {
      paramIndex++;
      whereClause += ` AND sm.medicine_id = $${paramIndex}`;
      params.push(medicineId);
    }
    
    if (startDate && endDate) {
      const { startDate: safeStartDate, endDate: safeEndDate } = getSafeDateRange(startDate, endDate);
      
      paramIndex++;
      whereClause += ` AND DATE(sm.created_at) >= $${paramIndex}`;
      params.push(safeStartDate);
      paramIndex++;
      whereClause += ` AND DATE(sm.created_at) <= $${paramIndex}`;
      params.push(safeEndDate);
    }

    console.log(`📊 Stock movements query with params:`, params);

    const [movements] = await query(`
      SELECT sm.*
      FROM stock_movements sm
      WHERE ${whereClause}
      ORDER BY sm.created_at DESC
    `, params);

    const total = movements.length;

    res.json({
      success: true,
      data: {
        content: movements,
        totalElements: total,
        totalPages: 1,
        page: 0,
        size: total
      }
    });
  } catch (error) {
    console.error('❌ Stock movements error:', error);
    next(error);
  }
});

// GET /api/stock/movements/reference/:referenceId - Get movements by reference
router.get('/movements/reference/:referenceId', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = 'sm.reference_id = $1';
    const params = [req.params.referenceId];
    
    if (req.businessId) {
      whereClause += ' AND sm.business_id = $2';
      params.push(req.businessId);
    }

    const [movements] = await query(`
      SELECT sm.*
      FROM stock_movements sm
      WHERE ${whereClause}
      ORDER BY sm.created_at DESC
    `, params);

    res.json({ success: true, data: movements });
  } catch (error) {
    next(error);
  }
});

// GET /api/stock/movements/medicine/:medicineId/filtered - Get filtered movements
router.get('/movements/medicine/:medicineId/filtered', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { type, startDate, endDate } = req.query;
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    let whereClause = 'sm.medicine_id = $1';
    const params = [req.params.medicineId];
    let paramIndex = 1;

    if (req.businessId) {
      paramIndex++;
      whereClause += ` AND sm.business_id = $${paramIndex}`;
      params.push(req.businessId);
    }

    if (type) {
      paramIndex++;
      whereClause += ` AND sm.type = $${paramIndex}`;
      params.push(type);
    }
    
    if (startDate && endDate) {
      const { startDate: safeStartDate, endDate: safeEndDate } = getSafeDateRange(startDate, endDate);
      
      paramIndex++;
      whereClause += ` AND DATE(sm.created_at) >= $${paramIndex}`;
      params.push(safeStartDate);
      paramIndex++;
      whereClause += ` AND DATE(sm.created_at) <= $${paramIndex}`;
      params.push(safeEndDate);
    } else if (startDate) {
      const safeStartDate = validateAndFixDate(startDate);
      paramIndex++;
      whereClause += ` AND DATE(sm.created_at) >= $${paramIndex}`;
      params.push(safeStartDate);
    } else if (endDate) {
      const safeEndDate = validateAndFixDate(endDate);
      paramIndex++;
      whereClause += ` AND DATE(sm.created_at) <= $${paramIndex}`;
      params.push(safeEndDate);
    }

    console.log(`📊 Filtered movements query for medicine ${req.params.medicineId} with params:`, params);

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
    console.error('❌ Filtered movements error:', error);
    next(error);
  }
});

// GET /api/stock/movements/medicine/:medicineId - Get movements by medicine
router.get('/movements/medicine/:medicineId', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    let whereClause = 'sm.medicine_id = $1';
    const params = [req.params.medicineId];
    
    if (req.businessId) {
      whereClause += ' AND sm.business_id = $2';
      params.push(req.businessId);
    }

    const [movements] = await query(`
      SELECT sm.*
      FROM stock_movements sm
      WHERE ${whereClause}
      ORDER BY sm.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
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

// GET /api/stock/net-movement/:medicineId - Get net movement for medicine
router.get('/net-movement/:medicineId', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [req.params.medicineId];
    let paramIndex = 1;

    if (req.businessId) {
      paramIndex++;
      params.push(req.businessId);
    }

    if (startDate && endDate) {
      const { startDate: safeStartDate, endDate: safeEndDate } = getSafeDateRange(startDate, endDate);
      
      dateFilter = `AND DATE(created_at) BETWEEN $${paramIndex + 1} AND $${paramIndex + 2}`;
      params.push(safeStartDate, safeEndDate);
    }

    const businessFilter = req.businessId ? `AND business_id = $2` : '';

    console.log(`📊 Net movement query for medicine ${req.params.medicineId} with params:`, params);

    const [result] = await query(`
      SELECT 
        COALESCE(SUM(CASE WHEN type IN ('ADDITION', 'PURCHASE') THEN quantity ELSE 0 END), 0) as additions,
        COALESCE(SUM(CASE WHEN type = 'SALE' THEN quantity ELSE 0 END), 0) as sales,
        COALESCE(SUM(CASE WHEN type = 'LOSS' THEN quantity ELSE 0 END), 0) as losses
      FROM stock_movements
      WHERE medicine_id = $1
      ${businessFilter}
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
    console.error('❌ Net movement error:', error);
    next(error);
  }
});

// POST /api/stock/loss - Record stock loss
// FIXED: Include business_id
router.post('/loss', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { medicine_id, quantity, reason, notes } = req.body;

    if (!medicine_id || !quantity || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Medicine ID and valid quantity are required' });
    }

    // Check available stock - verify business ownership
    let medicineQuery = 'SELECT * FROM medicines WHERE id = $1';
    const medicineParams = [medicine_id];
    
    if (req.businessId) {
      medicineQuery += ' AND business_id = $2';
      medicineParams.push(req.businessId);
    }

    const [medicines] = await query(medicineQuery, medicineParams);
    
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    const medicine = medicines[0];

    if (medicine.stock_quantity < quantity) {
      return res.status(400).json({ success: false, error: 'Insufficient stock for loss recording' });
    }

    const previousStock = medicine.stock_quantity;
    const newStock = previousStock - quantity;

    // Update medicine stock
    await query(
      'UPDATE medicines SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newStock, medicine_id]
    );

    // Get user name
    const [userResult] = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const performedByName = getFirst(userResult).name || 'Unknown';

    // Record stock movement with business_id
    const movementId = uuidv4();
    await query(`
      INSERT INTO stock_movements (
        id, business_id, medicine_id, medicine_name, type, quantity, reason, notes,
        created_by, performed_by_name, performed_by_role,
        previous_stock, new_stock, created_at
      )
      VALUES ($1, $2, $3, $4, 'LOSS', $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
    `, [
      movementId, req.businessId || null, medicine_id, medicine.name, quantity, reason || null, notes || null,
      req.user.id, performedByName, req.user.role, previousStock, newStock
    ]);

    res.status(201).json({
      success: true,
      data: {
        id: movementId,
        medicine_id,
        medicine_name: medicine.name,
        type: 'LOSS',
        quantity,
        previous_stock: previousStock,
        new_stock: newStock,
        reason,
        notes
      },
      message: 'Stock loss recorded successfully'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/stock/adjustment - Record stock adjustment
router.post('/adjustment', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { medicine_id, new_quantity, reason, notes } = req.body;

    if (!medicine_id || new_quantity === undefined || new_quantity < 0) {
      return res.status(400).json({ success: false, error: 'Medicine ID and valid new quantity are required' });
    }

    // Check medicine exists - verify business ownership
    let medicineQuery = 'SELECT * FROM medicines WHERE id = $1';
    const medicineParams = [medicine_id];
    
    if (req.businessId) {
      medicineQuery += ' AND business_id = $2';
      medicineParams.push(req.businessId);
    }

    const [medicines] = await query(medicineQuery, medicineParams);
    
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    const medicine = medicines[0];
    const previousStock = medicine.stock_quantity;
    const quantityChange = new_quantity - previousStock;

    // Update medicine stock
    await query(
      'UPDATE medicines SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [new_quantity, medicine_id]
    );

    // Get user name
    const [userResult] = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const performedByName = getFirst(userResult).name || 'Unknown';

    // Record stock movement with business_id
    const movementId = uuidv4();
    await query(`
      INSERT INTO stock_movements (
        id, business_id, medicine_id, medicine_name, type, quantity, reason, notes,
        created_by, performed_by_name, performed_by_role,
        previous_stock, new_stock, created_at
      )
      VALUES ($1, $2, $3, $4, 'ADJUSTMENT', $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
    `, [
      movementId, req.businessId || null, medicine_id, medicine.name, Math.abs(quantityChange), reason || null, notes || null,
      req.user.id, performedByName, req.user.role, previousStock, new_quantity
    ]);

    res.status(201).json({
      success: true,
      data: {
        id: movementId,
        medicine_id,
        medicine_name: medicine.name,
        type: 'ADJUSTMENT',
        quantity_change: quantityChange,
        previous_stock: previousStock,
        new_stock: new_quantity,
        reason,
        notes
      },
      message: 'Stock adjustment recorded successfully'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/stock/addition - Record stock addition
router.post('/addition', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { medicine_id, quantity, batch_number, notes } = req.body;

    if (!medicine_id || !quantity || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Medicine ID and valid quantity are required' });
    }

    // Check medicine exists - verify business ownership
    let medicineQuery = 'SELECT * FROM medicines WHERE id = $1';
    const medicineParams = [medicine_id];
    
    if (req.businessId) {
      medicineQuery += ' AND business_id = $2';
      medicineParams.push(req.businessId);
    }

    const [medicines] = await query(medicineQuery, medicineParams);
    
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    const medicine = medicines[0];
    const previousStock = medicine.stock_quantity;
    const newStock = previousStock + quantity;

    // Update medicine stock
    await query(
      'UPDATE medicines SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newStock, medicine_id]
    );

    // Get user name
    const [userResult] = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const performedByName = getFirst(userResult).name || 'Unknown';

    // Record stock movement with business_id
    const movementId = uuidv4();
    await query(`
      INSERT INTO stock_movements (
        id, business_id, medicine_id, medicine_name, type, quantity, batch_number, notes,
        created_by, performed_by_name, performed_by_role,
        previous_stock, new_stock, created_at
      )
      VALUES ($1, $2, $3, $4, 'ADDITION', $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
    `, [
      movementId, req.businessId || null, medicine_id, medicine.name, quantity, batch_number || null, notes || null,
      req.user.id, performedByName, req.user.role, previousStock, newStock
    ]);

    res.status(201).json({
      success: true,
      data: {
        id: movementId,
        medicine_id,
        medicine_name: medicine.name,
        type: 'ADDITION',
        quantity,
        previous_stock: previousStock,
        new_stock: newStock,
        batch_number,
        notes
      },
      message: 'Stock addition recorded successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
