const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/sales - Get all sales (paginated)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [sales] = await db.query(`
      SELECT s.*, u.name as cashier_name
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `, [size, offset]);

    // Get sale items for each sale
    for (let sale of sales) {
      const [items] = await db.query(`
        SELECT si.*, m.name as medicine_name
        FROM sale_items si
        LEFT JOIN medicines m ON si.medicine_id = m.id
        WHERE si.sale_id = ?
      `, [sale.id]);
      sale.items = items;
    }

    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM sales');

    res.json({
      success: true,
      data: {
        content: sales,
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

// GET /api/sales/today - Get today's sales summary
router.get('/today', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [[summary]] = await db.query(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE DATE(created_at) = ?
    `, [today]);

    res.json({
      success: true,
      data: {
        transactionCount: summary.transaction_count,
        totalSales: summary.total_sales,
        totalProfit: summary.total_profit,
        date: today
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/cashier/:cashierId/today - Get cashier's today sales
router.get('/cashier/:cashierId/today', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [sales] = await db.query(`
      SELECT s.*, u.name as cashier_name
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE s.cashier_id = ? AND DATE(s.created_at) = ?
      ORDER BY s.created_at DESC
    `, [req.params.cashierId, today]);

    // Get items for each sale
    for (let sale of sales) {
      const [items] = await db.query(`
        SELECT si.*, m.name as medicine_name
        FROM sale_items si
        LEFT JOIN medicines m ON si.medicine_id = m.id
        WHERE si.sale_id = ?
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

    const [sales] = await db.query(`
      SELECT s.*, u.name as cashier_name
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE s.cashier_id = ?
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.params.cashierId, size, offset]);

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) as total FROM sales WHERE cashier_id = ?',
      [req.params.cashierId]
    );

    res.json({
      success: true,
      data: {
        content: sales,
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

// GET /api/sales/report - Get sales report
router.get('/report', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = 'WHERE DATE(created_at) BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    const [[summary]] = await db.query(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(AVG(total_amount), 0) as average_sale
      FROM sales
      ${dateFilter}
    `, params);

    // Get daily breakdown
    const [dailyBreakdown] = await db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        SUM(total_amount) as total_sales,
        SUM(profit) as total_profit
      FROM sales
      ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, params);

    res.json({
      success: true,
      data: {
        summary,
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

    const [[result]] = await db.query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as totalSales,
        COUNT(*) as transactionCount
      FROM sales
      WHERE DATE(created_at) BETWEEN ? AND ?
    `, [startDate, endDate]);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/:id - Get sale by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    const [sales] = await db.query(`
      SELECT s.*, u.name as cashier_name
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE s.id = ?
    `, [req.params.id]);

    if (sales.length === 0) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    const [items] = await db.query(`
      SELECT si.*, m.name as medicine_name
      FROM sale_items si
      LEFT JOIN medicines m ON si.medicine_id = m.id
      WHERE si.sale_id = ?
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
      const [medicines] = await db.query(
        'SELECT id, name, unit_price, cost_price, stock_quantity FROM medicines WHERE id = ?',
        [item.medicine_id]
      );

      if (medicines.length === 0) {
        return res.status(400).json({ success: false, error: `Medicine not found: ${item.medicine_id}` });
      }

      const medicine = medicines[0];

      if (medicine.stock_quantity < item.quantity) {
        return res.status(400).json({ 
          success: false, 
          error: `Insufficient stock for ${medicine.name}. Available: ${medicine.stock_quantity}` 
        });
      }

      item.unit_price = item.unit_price || medicine.unit_price;
      item.cost_price = medicine.cost_price;
      item.subtotal = item.unit_price * item.quantity;
      item.profit = (item.unit_price - item.cost_price) * item.quantity;

      totalAmount += item.subtotal;
      totalProfit += item.profit;
    }

    // Apply discount
    const finalAmount = totalAmount - (discount || 0);

    // Create sale record
    await db.query(`
      INSERT INTO sales (id, cashier_id, total_amount, discount, final_amount, profit, payment_method, customer_name, customer_phone, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [saleId, req.user.id, totalAmount, discount || 0, finalAmount, totalProfit, payment_method || 'CASH', customer_name, customer_phone, notes]);

    // Create sale items and update stock
    for (const item of items) {
      const itemId = uuidv4();

      await db.query(`
        INSERT INTO sale_items (id, sale_id, medicine_id, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [itemId, saleId, item.medicine_id, item.quantity, item.unit_price, item.subtotal]);

      // Update medicine stock
      await db.query(
        'UPDATE medicines SET stock_quantity = stock_quantity - ?, updated_at = NOW() WHERE id = ?',
        [item.quantity, item.medicine_id]
      );

      // Record stock movement
      const movementId = uuidv4();
      await db.query(`
        INSERT INTO stock_movements (id, medicine_id, type, quantity, reference_id, created_by, created_at)
        VALUES (?, ?, 'SALE', ?, ?, ?, NOW())
      `, [movementId, item.medicine_id, item.quantity, saleId, req.user.id]);
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
    const [items] = await db.query('SELECT * FROM sale_items WHERE sale_id = ?', [req.params.id]);

    // Reverse stock changes
    for (const item of items) {
      await db.query(
        'UPDATE medicines SET stock_quantity = stock_quantity + ?, updated_at = NOW() WHERE id = ?',
        [item.quantity, item.medicine_id]
      );
    }

    // Delete sale items and sale
    await db.query('DELETE FROM sale_items WHERE sale_id = ?', [req.params.id]);
    await db.query('DELETE FROM sales WHERE id = ?', [req.params.id]);

    // Delete related stock movements
    await db.query('DELETE FROM stock_movements WHERE reference_id = ?', [req.params.id]);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
