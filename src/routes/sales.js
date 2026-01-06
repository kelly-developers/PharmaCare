const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper to generate transaction ID
const generateTransactionId = () => {
  const date = new Date();
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${datePart}-${randomPart}`;
};

// GET /api/sales - Get all sales (paginated)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [sales] = await query(`
      SELECT s.*
      FROM sales s
      ORDER BY s.created_at DESC
      LIMIT $1 OFFSET $2
    `, [size, offset]);

    // Get sale items for each sale
    for (let sale of sales) {
      const [items] = await query(`
        SELECT si.*
        FROM sale_items si
        WHERE si.sale_id = $1
      `, [sale.id]);
      sale.items = items;
    }

    const [countResult] = await query('SELECT COUNT(*) as total FROM sales');
    const total = parseInt(countResult[0]?.total) || 0;

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
    const [summaryResult] = await query(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(total), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    const summary = summaryResult[0] || { transaction_count: 0, total_sales: 0, total_profit: 0 };

    res.json({
      success: true,
      data: {
        transactionCount: parseInt(summary.transaction_count) || 0,
        totalSales: parseFloat(summary.total_sales) || 0,
        totalProfit: parseFloat(summary.total_profit) || 0,
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
      SELECT s.*
      FROM sales s
      WHERE s.cashier_id = $1 AND DATE(s.created_at) = CURRENT_DATE
      ORDER BY s.created_at DESC
    `, [req.params.cashierId]);

    // Get items for each sale
    for (let sale of sales) {
      const [items] = await query(`
        SELECT si.*
        FROM sale_items si
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
      SELECT s.*
      FROM sales s
      WHERE s.cashier_id = $1
      ORDER BY s.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.params.cashierId, size, offset]);

    const [countResult] = await query(
      'SELECT COUNT(*) as total FROM sales WHERE cashier_id = $1',
      [req.params.cashierId]
    );
    const total = parseInt(countResult[0]?.total) || 0;

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
      dateFilter = 'WHERE DATE(created_at) BETWEEN $1 AND $2';
      params.push(startDate, endDate);
    }

    const [summaryResult] = await query(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(total), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(AVG(total), 0) as average_sale
      FROM sales
      ${dateFilter}
    `, params);

    const summary = summaryResult[0] || {};

    // Get daily breakdown
    const [dailyBreakdown] = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        SUM(total) as total_sales,
        SUM(profit) as total_profit
      FROM sales
      ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, params);

    res.json({
      success: true,
      data: {
        summary: {
          transaction_count: parseInt(summary.transaction_count) || 0,
          total_sales: parseFloat(summary.total_sales) || 0,
          total_profit: parseFloat(summary.total_profit) || 0,
          average_sale: parseFloat(summary.average_sale) || 0
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

    const [result] = await query(`
      SELECT 
        COALESCE(SUM(total), 0) as "totalSales",
        COUNT(*) as "transactionCount"
      FROM sales
      WHERE DATE(created_at) BETWEEN $1 AND $2
    `, [startDate, endDate]);

    const data = result[0] || {};

    res.json({ 
      success: true, 
      data: {
        totalSales: parseFloat(data.totalSales) || 0,
        transactionCount: parseInt(data.transactionCount) || 0
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
      SELECT s.*
      FROM sales s
      WHERE s.id = $1
    `, [req.params.id]);

    if (sales.length === 0) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    const [items] = await query(`
      SELECT si.*
      FROM sale_items si
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
    const transactionId = generateTransactionId();
    let subtotal = 0;
    let totalProfit = 0;
    let totalCogs = 0;

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
        try {
          const unitsData = typeof medicine.units === 'string' ? JSON.parse(medicine.units) : medicine.units;
          const unitConfig = unitsData.find(u => u.type === item.unit_type);
          if (unitConfig && unitConfig.quantity) {
            stockNeeded = item.quantity * unitConfig.quantity;
          }
        } catch (e) {
          // If units parsing fails, use quantity as-is
        }
      }

      if (medicine.stock_quantity < stockNeeded) {
        return res.status(400).json({ 
          success: false, 
          error: `Insufficient stock for ${medicine.name}. Available: ${medicine.stock_quantity}` 
        });
      }

      item.unit_price = parseFloat(item.unit_price) || parseFloat(medicine.unit_price) || 0;
      item.cost_price = parseFloat(medicine.cost_price) || 0;
      item.subtotal = item.unit_price * item.quantity;
      item.profit = (item.unit_price - item.cost_price) * item.quantity;
      item.cogs = item.cost_price * item.quantity;
      item.stock_deduction = stockNeeded;
      item.medicine_name = medicine.name;

      subtotal += item.subtotal;
      totalProfit += item.profit;
      totalCogs += item.cogs;
    }

    // Apply discount and calculate totals
    const discountAmount = parseFloat(discount) || 0;
    const tax = 0; // Set tax to 0 or calculate if needed
    const total = subtotal - discountAmount + tax;

    // Get cashier name
    const [userResult] = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const cashierName = userResult[0]?.name || 'Unknown';

    // Create sale record with all required fields
    await query(`
      INSERT INTO sales (
        id, transaction_id, cashier_id, cashier_name, subtotal, discount, tax, total,
        total_amount, final_amount, profit, cost_of_goods_sold, payment_method, 
        customer_name, customer_phone, notes, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
    `, [
      saleId, transactionId, req.user.id, cashierName, subtotal, discountAmount, tax, total,
      subtotal, total, totalProfit, totalCogs, payment_method || 'CASH', 
      customer_name || null, customer_phone || null, notes || null
    ]);

    // Create sale items and update stock
    for (const item of items) {
      const itemId = uuidv4();

      await query(`
        INSERT INTO sale_items (
          id, sale_id, medicine_id, medicine_name, quantity, unit_type, unit_label, 
          unit_price, subtotal, total_price, cost_price, cost_of_goods_sold
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        itemId, saleId, item.medicine_id, item.medicine_name, item.quantity, 
        item.unit_type || null, item.unit_label || null, item.unit_price, 
        item.subtotal, item.subtotal, item.cost_price, item.cogs
      ]);

      // Update medicine stock
      await query(
        'UPDATE medicines SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [item.stock_deduction, item.medicine_id]
      );

      // Record stock movement
      const movementId = uuidv4();
      await query(`
        INSERT INTO stock_movements (
          id, medicine_id, medicine_name, type, quantity, reference_id, 
          created_by, performed_by_name, performed_by_role, previous_stock, new_stock, created_at
        )
        VALUES ($1, $2, $3, 'SALE', $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      `, [
        movementId, item.medicine_id, item.medicine_name, item.stock_deduction, saleId, 
        req.user.id, cashierName, req.user.role,
        0, 0 // These would need to be calculated properly for full audit
      ]);
    }

    res.status(201).json({
      success: true,
      data: {
        id: saleId,
        transaction_id: transactionId,
        cashier_id: req.user.id,
        cashier_name: cashierName,
        subtotal,
        discount: discountAmount,
        tax,
        total,
        profit: totalProfit,
        payment_method: payment_method || 'CASH',
        items: items.map(i => ({
          medicine_id: i.medicine_id,
          medicine_name: i.medicine_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.subtotal
        }))
      }
    });
  } catch (error) {
    console.error('Create sale error:', error);
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

    res.json({ success: true, message: 'Sale voided successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
