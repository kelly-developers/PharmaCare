const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/sales - Get all sales (paginated)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [sales] = await query(`
      SELECT s.*, u.name as cashier_name
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      ORDER BY s.created_at DESC
      LIMIT $1 OFFSET $2
    `, [size, offset]);

    // Get sale items for each sale
    for (let sale of sales) {
      const [items] = await query(`
        SELECT si.*, m.name as medicine_name
        FROM sale_items si
        LEFT JOIN medicines m ON si.medicine_id = m.id
        WHERE si.sale_id = $1
      `, [sale.id]);
      sale.items = items;
    }

    const [[{ total }]] = await query('SELECT COUNT(*) as total FROM sales');

    res.json({
      success: true,
      data: {
        content: sales,
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

// GET /api/sales/today - Get today's sales summary
router.get('/today', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    const [[summary]] = await query(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    res.json({
      success: true,
      data: {
        transactionCount: parseInt(summary.transaction_count),
        totalSales: parseFloat(summary.total_sales),
        totalProfit: parseFloat(summary.total_profit),
        date: new Date().toISOString().split('T')[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/cashier/:cashierId/today - Get cashier's today sales
router.get('/cashier/:cashierId/today', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    const [sales] = await query(`
      SELECT s.*, u.name as cashier_name
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE s.cashier_id = $1 AND DATE(s.created_at) = CURRENT_DATE
      ORDER BY s.created_at DESC
    `, [req.params.cashierId]);

    // Get items for each sale
    for (let sale of sales) {
      const [items] = await query(`
        SELECT si.*, m.name as medicine_name
        FROM sale_items si
        LEFT JOIN medicines m ON si.medicine_id = m.id
        WHERE si.sale_id = $1
      `, [sale.id]);
      sale.items = items;
    }

    res.json({ success: true, data: sales });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/cashier/:cashierId - Get sales by cashier (paginated)
router.get('/cashier/:cashierId', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [sales] = await query(`
      SELECT s.*, u.name as cashier_name
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE s.cashier_id = $1
      ORDER BY s.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.params.cashierId, size, offset]);

    const [[{ total }]] = await query(
      'SELECT COUNT(*) as total FROM sales WHERE cashier_id = $1',
      [req.params.cashierId]
    );

    res.json({
      success: true,
      data: {
        content: sales,
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

// GET /api/sales/report - Get sales report
router.get('/report', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = 'WHERE DATE(created_at) BETWEEN $1 AND $2';
      params.push(startDate, endDate);
    }

    const [[summary]] = await query(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(AVG(total_amount), 0) as average_sale
      FROM sales
      ${dateFilter}
    `, params);

    // Get daily breakdown
    const dailyQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        SUM(total_amount) as total_sales,
        SUM(profit) as total_profit
      FROM sales
      ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    const [dailyBreakdown] = await query(dailyQuery, params);

    res.json({
      success: true,
      data: {
        summary: {
          transaction_count: parseInt(summary.transaction_count),
          total_sales: parseFloat(summary.total_sales),
          total_profit: parseFloat(summary.total_profit),
          average_sale: parseFloat(summary.average_sale)
        },
        dailyBreakdown
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/period-total - Get sales total for period
router.get('/period-total', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const [[result]] = await query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as "totalSales",
        COUNT(*) as "transactionCount"
      FROM sales
      WHERE DATE(created_at) BETWEEN $1 AND $2
    `, [startDate, endDate]);

    res.json({ 
      success: true, 
      data: {
        totalSales: parseFloat(result.totalSales),
        transactionCount: parseInt(result.transactionCount)
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/:id - Get sale by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    const [sales] = await query(`
      SELECT s.*, u.name as cashier_name
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE s.id = $1
    `, [req.params.id]);

    if (sales.length === 0) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    const [items] = await query(`
      SELECT si.*, m.name as medicine_name
      FROM sale_items si
      LEFT JOIN medicines m ON si.medicine_id = m.id
      WHERE si.sale_id = $1
    `, [req.params.id]);

    sales[0].items = items;

    res.json({ success: true, data: sales[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/sales - Create sale
router.post('/', authenticate, authorize('ADMIN', 'CASHIER'), async (req, res, next) => {
  try {
    const { items, payment_method, customer_name, customer_phone, discount, notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Sale items are required' });
    }

    const saleId = uuidv4();
    let totalAmount = 0;
    let totalProfit = 0;

    // Calculate totals and validate stock
    for (const item of items) {
      const [medicines] = await query(
        'SELECT id, name, unit_price, cost_price, stock_quantity, units FROM medicines WHERE id = $1',
        [item.medicine_id]
      );

      if (medicines.length === 0) {
        return res.status(400).json({ success: false, error: `Medicine not found: ${item.medicine_id}` });
      }

      const medicine = medicines[0];

      // Calculate stock needed based on unit type
      let stockNeeded = item.quantity;
      if (medicine.units && item.unit_type) {
        const unitConfig = medicine.units.find(u => u.type === item.unit_type);
        if (unitConfig && unitConfig.quantity) {
          stockNeeded = item.quantity * unitConfig.quantity;
        }
      }

      if (medicine.stock_quantity < stockNeeded) {
        return res.status(400).json({ 
          success: false, 
          error: `Insufficient stock for ${medicine.name}. Available: ${medicine.stock_quantity}` 
        });
      }

      item.unit_price = item.unit_price || medicine.unit_price;
      item.cost_price = medicine.cost_price;
      item.subtotal = item.unit_price * item.quantity;
      item.profit = (item.unit_price - (item.cost_price || 0)) * item.quantity;
      item.stock_deduction = stockNeeded;

      totalAmount += item.subtotal;
      totalProfit += item.profit;
    }

    // Apply discount
    const finalAmount = totalAmount - (discount || 0);

    // Create sale record
    await query(`
      INSERT INTO sales (id, cashier_id, total_amount, discount, final_amount, profit, payment_method, customer_name, customer_phone, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
    `, [saleId, req.user.id, totalAmount, discount || 0, finalAmount, totalProfit, payment_method || 'CASH', customer_name, customer_phone, notes]);

    // Create sale items and update stock
    for (const item of items) {
      const itemId = uuidv4();

      await query(`
        INSERT INTO sale_items (id, sale_id, medicine_id, quantity, unit_type, unit_label, unit_price, subtotal)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [itemId, saleId, item.medicine_id, item.quantity, item.unit_type, item.unit_label, item.unit_price, item.subtotal]);

      // Update medicine stock
      await query(
        'UPDATE medicines SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [item.stock_deduction, item.medicine_id]
      );

      // Record stock movement
      const movementId = uuidv4();
      await query(`
        INSERT INTO stock_movements (id, medicine_id, type, quantity, reference_id, created_by, created_at)
        VALUES ($1, $2, 'SALE', $3, $4, $5, CURRENT_TIMESTAMP)
      `, [movementId, item.medicine_id, item.stock_deduction, saleId, req.user.id]);
    }

    res.status(201).json({
      success: true,
      data: {
        id: saleId,
        cashier_id: req.user.id,
        total_amount: totalAmount,
        discount: discount || 0,
        final_amount: finalAmount,
        profit: totalProfit,
        payment_method: payment_method || 'CASH',
        items
      }
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/sales/:id - Delete sale (void)
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    // Get sale items to reverse stock
    const [items] = await query('SELECT * FROM sale_items WHERE sale_id = $1', [req.params.id]);

    // Reverse stock changes
    for (const item of items) {
      await query(
        'UPDATE medicines SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [item.quantity, item.medicine_id]
      );
    }

    // Delete sale items and sale
    await query('DELETE FROM sale_items WHERE sale_id = $1', [req.params.id]);
    await query('DELETE FROM sales WHERE id = $1', [req.params.id]);

    // Delete related stock movements
    await query('DELETE FROM stock_movements WHERE reference_id = $1', [req.params.id]);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
