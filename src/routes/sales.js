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

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

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
    const total = parseInt(getFirst(countResult).total) || 0;

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
        COALESCE(SUM(final_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    const summary = getFirst(summaryResult);

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
    const total = parseInt(getFirst(countResult).total) || 0;

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
        COALESCE(SUM(final_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(AVG(final_amount), 0) as average_sale
      FROM sales
      ${dateFilter}
    `, params);

    const summary = getFirst(summaryResult);

    // Get daily breakdown
    const [dailyBreakdown] = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        SUM(final_amount) as total_sales,
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
        COALESCE(SUM(final_amount), 0) as "totalSales",
        COUNT(*) as "transactionCount"
      FROM sales
      WHERE DATE(created_at) BETWEEN $1 AND $2
    `, [startDate, endDate]);

    const data = getFirst(result);

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
  const { pool } = require('../config/database');
  const client = await pool.connect();
  
  try {
    const { items, payment_method, customer_name, customer_phone, discount, notes } = req.body;

    console.log('Creating sale with items:', JSON.stringify(items, null, 2));

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Sale items are required' });
    }

    // Start transaction
    await client.query('BEGIN');
    await client.query(`SET search_path TO ${process.env.DB_SCHEMA || 'spotmedpharmacare'}, public`);

    const saleId = uuidv4();
    const transactionId = generateTransactionId();
    let subtotal = 0;
    let totalProfit = 0;
    let totalCost = 0;

    // Calculate totals and validate stock
    for (const item of items) {
      const medicineResult = await client.query(
        'SELECT id, name, unit_price, cost_price, stock_quantity, units FROM medicines WHERE id = $1',
        [item.medicine_id]
      );

      if (medicineResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: `Medicine not found: ${item.medicine_id}` });
      }

      const medicine = medicineResult.rows[0];
      console.log('Medicine found:', medicine.name, 'unit_price:', medicine.unit_price, 'cost_price:', medicine.cost_price);

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
          console.log('Units parsing error:', e.message);
        }
      }

      if (medicine.stock_quantity < stockNeeded) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: `Insufficient stock for ${medicine.name}. Available: ${medicine.stock_quantity}` 
        });
      }

      // Use item's unit_price if provided, otherwise use medicine's unit_price
      item.unit_price = parseFloat(item.unit_price) || parseFloat(medicine.unit_price) || 0;
      item.cost_price = parseFloat(medicine.cost_price) || 0;
      item.subtotal = item.unit_price * item.quantity;
      
      // Calculate profit per item (selling price - cost price) * quantity
      // For unit-based sales, multiply cost by stock units deducted
      const costForThisItem = item.cost_price * stockNeeded;
      item.profit = item.subtotal - costForThisItem;
      
      item.stock_deduction = stockNeeded;
      item.medicine_name = medicine.name;

      console.log(`Item: ${medicine.name}, qty: ${item.quantity}, stock_deduction: ${stockNeeded}, unit_price: ${item.unit_price}, cost_price: ${item.cost_price}, subtotal: ${item.subtotal}, profit: ${item.profit}`);

      subtotal += item.subtotal;
      totalProfit += item.profit;
      totalCost += costForThisItem;
    }

    // Apply discount and calculate totals
    const discountAmount = parseFloat(discount) || 0;
    const finalAmount = subtotal - discountAmount;
    // Adjust profit for discount
    const finalProfit = totalProfit - discountAmount;

    console.log('Sale totals - subtotal:', subtotal, 'discount:', discountAmount, 'final:', finalAmount, 'profit:', finalProfit);

    // Get cashier name
    const userResult = await client.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const cashierName = userResult.rows[0]?.name || 'Unknown';

    // Insert sale record
    await client.query(`
      INSERT INTO sales (
        id, cashier_id, cashier_name, total_amount, discount, final_amount,
        profit, payment_method, customer_name, customer_phone, notes, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
    `, [
      saleId, 
      req.user.id, 
      cashierName, 
      subtotal,
      discountAmount,
      finalAmount,
      finalProfit,
      payment_method || 'CASH', 
      customer_name || null, 
      customer_phone || null, 
      notes || null
    ]);

    console.log('Sale inserted with ID:', saleId);

    // Create sale items and update stock
    for (const item of items) {
      const itemId = uuidv4();

      // Insert sale item
      await client.query(`
        INSERT INTO sale_items (
          id, sale_id, medicine_id, medicine_name, quantity, unit_type, unit_label, 
          unit_price, cost_price, subtotal, profit
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        itemId, 
        saleId, 
        item.medicine_id, 
        item.medicine_name, 
        item.quantity, 
        item.unit_type || null, 
        item.unit_label || null, 
        item.unit_price, 
        item.cost_price, 
        item.subtotal, 
        item.profit
      ]);

      console.log('Sale item inserted:', itemId);

      // Get current stock before update
      const stockBefore = await client.query(
        'SELECT stock_quantity FROM medicines WHERE id = $1',
        [item.medicine_id]
      );
      const previousStock = parseInt(stockBefore.rows[0]?.stock_quantity) || 0;

      // Update medicine stock
      await client.query(
        'UPDATE medicines SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [item.stock_deduction, item.medicine_id]
      );

      const newStock = previousStock - item.stock_deduction;
      console.log('Stock updated for', item.medicine_name, ':', previousStock, '->', newStock);

      // Record stock movement
      const movementId = uuidv4();
      await client.query(`
        INSERT INTO stock_movements (
          id, medicine_id, medicine_name, type, quantity, reference_id,
          created_by, performed_by_name, performed_by_role,
          previous_stock, new_stock, created_at
        )
        VALUES ($1, $2, $3, 'SALE', $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      `, [
        movementId,
        item.medicine_id,
        item.medicine_name,
        -Math.abs(item.stock_deduction),
        saleId,
        req.user.id,
        cashierName,
        req.user.role,
        previousStock,
        newStock
      ]);

      console.log('Stock movement recorded:', movementId);
    }

    // Commit transaction
    await client.query('COMMIT');
    console.log('Transaction committed successfully');

    res.status(201).json({
      success: true,
      data: {
        id: saleId,
        transaction_id: transactionId,
        cashier_id: req.user.id,
        cashier_name: cashierName,
        total_amount: subtotal,
        discount: discountAmount,
        final_amount: finalAmount,
        profit: finalProfit,
        payment_method: payment_method || 'CASH',
        items: items.map(i => ({
          medicine_id: i.medicine_id,
          medicine_name: i.medicine_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.subtotal,
          profit: i.profit
        }))
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create sale error:', error);
    console.error('Error stack:', error.stack);
    next(error);
  } finally {
    client.release();
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