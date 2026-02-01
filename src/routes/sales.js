const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query, pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// In-memory idempotency store (in production, use Redis)
const processedTransactions = new Map();
const IDEMPOTENCY_TTL = 60000; // 1 minute

// Clean up old idempotency keys periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of processedTransactions.entries()) {
    if (now - timestamp > IDEMPOTENCY_TTL) {
      processedTransactions.delete(key);
    }
  }
}, 30000);

// Helper to generate transaction ID
const generateTransactionId = () => {
  const date = new Date();
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${datePart}-${randomPart}`;
};

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// POST /api/sales - Create sale with idempotency protection
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    const { items, payment_method, customer_name, customer_phone, discount, notes, idempotency_key, due_date } = req.body;

    console.log('🚀 Creating sale request received');
    console.log('📦 Items count:', items?.length || 0);
    console.log('💳 Payment method:', payment_method);

    // Check for duplicate request using idempotency key
    const requestKey = idempotency_key || `${req.user.id}-${JSON.stringify(items)}-${Date.now()}`;
    
    if (processedTransactions.has(requestKey)) {
      console.log('⚠️ Duplicate request detected, returning cached response');
      return res.status(409).json({ 
        success: false, 
        error: 'Duplicate request - sale may have already been processed' 
      });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Sale items are required' });
    }

    // Validate credit sales require customer info
    const isCredit = (payment_method || 'CASH').toUpperCase() === 'CREDIT';
    if (isCredit && (!customer_name || !customer_phone)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Customer name and phone are required for credit sales' 
      });
    }

    // Mark this request as processing
    processedTransactions.set(requestKey, Date.now());

    // Start transaction
    await client.query('BEGIN');
    
    // Set schema
    const config = require('../config/database').config;
    await client.query(`SET search_path TO ${config.schema}, public`);

    const saleId = uuidv4();
    const transactionId = generateTransactionId();
    let subtotal = 0;
    let totalProfit = 0;
    let totalCost = 0;

    // Calculate totals and validate stock
    for (const item of items) {
      const medicineId = item.medicine_id || item.medicineId;
      if (!medicineId) {
        throw new Error('Medicine ID is required for each item');
      }

      const medicineResult = await client.query(
        'SELECT id, name, unit_price, cost_price, stock_quantity, units FROM medicines WHERE id = $1',
        [medicineId]
      );

      if (medicineResult.rows.length === 0) {
        throw new Error(`Medicine not found: ${medicineId}`);
      }

      const medicine = medicineResult.rows[0];
      console.log('💊 Medicine:', medicine.name, 'Stock:', medicine.stock_quantity);

      // Calculate stock needed based on unit type
      let stockNeeded = item.quantity || 1;
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
        throw new Error(`Insufficient stock for ${medicine.name}. Available: ${medicine.stock_quantity}, Needed: ${stockNeeded}`);
      }

      // Use item's unit_price if provided, otherwise use medicine's unit_price
      item.unit_price = parseFloat(item.unit_price || item.unitPrice || medicine.unit_price) || 0;
      item.cost_price = parseFloat(medicine.cost_price) || 0;
      item.subtotal = item.unit_price * (item.quantity || 1);
      
      // Calculate profit per item (selling price - cost price) * quantity
      const costForThisItem = item.cost_price * stockNeeded;
      item.profit = item.subtotal - costForThisItem;
      
      item.stock_deduction = stockNeeded;
      item.medicine_name = medicine.name;
      item.medicine_id = medicineId;

      subtotal += item.subtotal;
      totalProfit += item.profit;
      totalCost += costForThisItem;
    }

    // Apply discount and calculate totals
    const discountAmount = parseFloat(discount) || 0;
    const finalAmount = subtotal - discountAmount;
    const finalProfit = totalProfit - discountAmount;

    console.log('📊 Sale totals:', { subtotal, discount: discountAmount, finalAmount, profit: finalProfit });

    // Get cashier name
    const userResult = await client.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const cashierName = userResult.rows[0]?.name || 'Unknown';

    const safePaymentMethod = (payment_method || 'CASH').toUpperCase();
    const safeCustomerPhone = customer_phone || '';
    const safeCustomerName = customer_name || 'Walk-in';

    // Insert sale record
    await client.query(`
      INSERT INTO sales (
        id, cashier_id, cashier_name, total_amount, discount, final_amount,
        profit, payment_method, customer_name, customer_phone, notes, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
    `, [
      saleId, req.user.id, cashierName, subtotal, discountAmount, finalAmount,
      finalProfit, safePaymentMethod, safeCustomerName, safeCustomerPhone, notes || null
    ]);

    console.log('✅ Sale inserted:', saleId);

    // Create sale items and update stock
    for (const item of items) {
      const itemId = uuidv4();
      const medicineId = item.medicine_id || item.medicineId;
      const quantity = item.quantity || 1;
      const unitType = item.unit_type || item.unitType || 'TABLET';
      const unitLabel = item.unit_label || item.unitLabel || unitType;

      // Insert sale item
      await client.query(`
        INSERT INTO sale_items (
          id, sale_id, medicine_id, medicine_name, quantity, unit_type, unit_label, 
          unit_price, cost_price, subtotal, profit
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        itemId, saleId, medicineId, item.medicine_name, quantity, unitType, unitLabel, 
        item.unit_price, item.cost_price, item.subtotal, item.profit
      ]);

      // Get current stock before update
      const stockBefore = await client.query(
        'SELECT stock_quantity FROM medicines WHERE id = $1',
        [medicineId]
      );
      const previousStock = parseInt(stockBefore.rows[0]?.stock_quantity) || 0;

      // Update medicine stock
      await client.query(
        'UPDATE medicines SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [item.stock_deduction, medicineId]
      );

      const newStock = previousStock - item.stock_deduction;
      console.log('📦 Stock updated:', item.medicine_name, previousStock, '->', newStock);

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
        movementId, medicineId, item.medicine_name, item.stock_deduction, saleId,
        req.user.id, cashierName, req.user.role, previousStock, newStock
      ]);
    }

    // If this is a credit sale, create credit record
    let creditSaleId = null;
    if (isCredit) {
      creditSaleId = uuidv4();
      const dueDateValue = due_date ? new Date(due_date) : null;
      
      await client.query(`
        INSERT INTO credit_sales (
          id, business_id, sale_id, customer_name, customer_phone,
          total_amount, paid_amount, balance_amount, status, due_date, notes, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 0, $6, 'PENDING', $7, $8, CURRENT_TIMESTAMP)
      `, [
        creditSaleId,
        req.user.business_id || null,
        saleId,
        safeCustomerName,
        safeCustomerPhone,
        finalAmount,
        dueDateValue,
        notes || null
      ]);
      
      console.log('📋 Credit sale record created:', creditSaleId);
    }

    // Commit transaction
    await client.query('COMMIT');
    console.log('🎉 Transaction committed!');

    // Fetch the complete sale record
    const saleResult = await client.query(`
      SELECT s.*, 
        COALESCE(
          json_agg(
            json_build_object(
              'id', si.id,
              'medicine_id', si.medicine_id,
              'medicine_name', si.medicine_name,
              'quantity', si.quantity,
              'unit_type', si.unit_type,
              'unit_label', si.unit_label,
              'unit_price', si.unit_price,
              'cost_price', si.cost_price,
              'subtotal', si.subtotal,
              'profit', si.profit
            )
          ) FILTER (WHERE si.id IS NOT NULL), '[]'
        ) as items
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE s.id = $1
      GROUP BY s.id
    `, [saleId]);

    const createdSale = saleResult.rows[0];

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
        payment_method: safePaymentMethod,
        customer_name: safeCustomerName,
        customer_phone: safeCustomerPhone,
        notes: notes || null,
        created_at: createdSale?.created_at,
        items: createdSale?.items || [],
        is_credit: isCredit,
        credit_sale_id: creditSaleId
      },
      message: isCredit ? 'Credit sale created successfully' : 'Sale created successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(e => console.error('Rollback error:', e));
    console.error('❌ Create sale error:', error.message);
    
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create sale'
    });
  } finally {
    client.release();
  }
});

// GET /api/sales - Get all sales (NO pagination - returns ALL sales)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    // Optional date filters
    const { startDate, endDate, cashierId, paymentMethod } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;
    
    if (startDate && endDate) {
      paramIndex++;
      whereClause += ` AND DATE(s.created_at) >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
      whereClause += ` AND DATE(s.created_at) <= $${paramIndex}`;
      params.push(endDate);
    }
    
    if (cashierId) {
      paramIndex++;
      whereClause += ` AND s.cashier_id = $${paramIndex}`;
      params.push(cashierId);
    }
    
    if (paymentMethod) {
      paramIndex++;
      whereClause += ` AND s.payment_method = $${paramIndex}`;
      params.push(paymentMethod.toUpperCase());
    }

    const [sales] = await query(`
      SELECT 
        s.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', si.id,
              'medicine_id', si.medicine_id,
              'medicine_name', si.medicine_name,
              'quantity', si.quantity,
              'unit_type', si.unit_type,
              'unit_label', si.unit_label,
              'unit_price', si.unit_price,
              'cost_price', si.cost_price,
              'subtotal', si.subtotal,
              'profit', si.profit
            )
          ) FILTER (WHERE si.id IS NOT NULL), '[]'
        ) as items
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE ${whereClause}
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `, params);

    const total = sales.length;

    res.json({
      success: true,
      data: {
        content: sales,
        totalElements: total,
        totalPages: 1,
        page: 0,
        size: total
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/today - Get today's sales summary
router.get('/today', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
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

    const [todaySales] = await query(`
      SELECT 
        s.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', si.id,
              'medicine_id', si.medicine_id,
              'medicine_name', si.medicine_name,
              'quantity', si.quantity,
              'unit_type', si.unit_type,
              'unit_label', si.unit_label,
              'unit_price', si.unit_price,
              'cost_price', si.cost_price,
              'subtotal', si.subtotal,
              'profit', si.profit
            )
          ) FILTER (WHERE si.id IS NOT NULL), '[]'
        ) as items
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE DATE(s.created_at) = CURRENT_DATE
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);

    res.json({
      success: true,
      data: {
        date: new Date().toISOString().split('T')[0],
        transactionCount: parseInt(summary.transaction_count) || 0,
        totalSales: parseFloat(summary.total_sales) || 0,
        totalProfit: parseFloat(summary.total_profit) || 0,
        sales: todaySales || []
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/cashier/:cashierId/today
router.get('/cashier/:cashierId/today', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const cashierId = req.params.cashierId;
    
    const [sales] = await query(`
      SELECT 
        s.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', si.id,
              'medicine_id', si.medicine_id,
              'medicine_name', si.medicine_name,
              'quantity', si.quantity,
              'unit_type', si.unit_type,
              'unit_label', si.unit_label,
              'unit_price', si.unit_price,
              'cost_price', si.cost_price,
              'subtotal', si.subtotal,
              'profit', si.profit
            )
          ) FILTER (WHERE si.id IS NOT NULL), '[]'
        ) as items
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE s.cashier_id = $1 AND DATE(s.created_at) = CURRENT_DATE
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `, [cashierId]);

    const summary = sales.reduce((acc, sale) => {
      acc.transaction_count = (acc.transaction_count || 0) + 1;
      acc.total_sales = (acc.total_sales || 0) + parseFloat(sale.final_amount);
      acc.total_profit = (acc.total_profit || 0) + parseFloat(sale.profit);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        cashierId,
        date: new Date().toISOString().split('T')[0],
        transactionCount: summary.transaction_count || 0,
        totalSales: summary.total_sales || 0,
        totalProfit: summary.total_profit || 0,
        sales: sales || []
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/stats - Get sales statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [todayResult] = await query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(final_amount), 0) as total,
        COALESCE(SUM(profit), 0) as profit
      FROM sales WHERE DATE(created_at) = CURRENT_DATE
    `);

    const [monthResult] = await query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(final_amount), 0) as total,
        COALESCE(SUM(profit), 0) as profit
      FROM sales WHERE DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE)
    `);

    const today = getFirst(todayResult);
    const month = getFirst(monthResult);

    res.json({
      success: true,
      data: {
        today: {
          count: parseInt(today.count) || 0,
          total: parseFloat(today.total) || 0,
          profit: parseFloat(today.profit) || 0
        },
        month: {
          count: parseInt(month.count) || 0,
          total: parseFloat(month.total) || 0,
          profit: parseFloat(month.profit) || 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/:id - Get sale by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [sales] = await query(`
      SELECT 
        s.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', si.id,
              'medicine_id', si.medicine_id,
              'medicine_name', si.medicine_name,
              'quantity', si.quantity,
              'unit_type', si.unit_type,
              'unit_label', si.unit_label,
              'unit_price', si.unit_price,
              'cost_price', si.cost_price,
              'subtotal', si.subtotal,
              'profit', si.profit
            )
          ) FILTER (WHERE si.id IS NOT NULL), '[]'
        ) as items
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE s.id = $1
      GROUP BY s.id
    `, [req.params.id]);

    if (sales.length === 0) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    res.json({ success: true, data: sales[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/sales/:id - Delete sale (void)
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const config = require('../config/database').config;
    await client.query(`SET search_path TO ${config.schema}, public`);
    
    // Get sale items to reverse stock
    const itemsResult = await client.query('SELECT * FROM sale_items WHERE sale_id = $1', [req.params.id]);
    const items = itemsResult.rows;

    // Get user info
    const userResult = await client.query('SELECT name, role FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0] || { name: 'Unknown', role: 'UNKNOWN' };

    // Reverse stock changes
    for (const item of items) {
      // Get current stock
      const stockResult = await client.query(
        'SELECT stock_quantity FROM medicines WHERE id = $1',
        [item.medicine_id]
      );
      const previousStock = parseInt(stockResult.rows[0]?.stock_quantity) || 0;
      const newStock = previousStock + item.quantity;

      await client.query(
        'UPDATE medicines SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newStock, item.medicine_id]
      );
      
      // Record reversal    movement
      const movementId = uuidv4();
      await client.query(`
        INSERT INTO stock_movements (
          id, medicine_id, medicine_name, type, quantity, reference_id, reason,
          created_by, performed_by_name, performed_by_role, previous_stock, new_stock, created_at
        )
        VALUES ($1, $2, $3, 'ADJUSTMENT', $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
      `, [
        movementId, item.medicine_id, item.medicine_name, item.quantity,
        req.params.id, 'Sale voided', req.user.id, user.name, user.role,
        previousStock, newStock
      ]);
    }

    // Delete sale items and sale
    await client.query('DELETE FROM sale_items WHERE sale_id = $1', [req.params.id]);
    await client.query('DELETE FROM sales WHERE id = $1', [req.params.id]);
    
    // Delete related stock movements for the original sale
    await client.query("DELETE FROM stock_movements WHERE reference_id = $1 AND type = 'SALE'", [req.params.id]);

    await client.query('COMMIT');

    res.json({ success: true, message: 'Sale voided successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// =================== CREDIT SALES ENDPOINTS ===================

// GET /api/sales/credit - Get all credit sales
router.get('/credit', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { status, customerId } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;
    
    // Add business_id filter if user has one
    if (req.user.business_id) {
      paramIndex++;
      whereClause += ` AND cs.business_id = $${paramIndex}`;
      params.push(req.user.business_id);
    }
    
    if (status) {
      paramIndex++;
      whereClause += ` AND cs.status = $${paramIndex}`;
      params.push(status.toUpperCase());
    }
    
    if (customerId) {
      paramIndex++;
      whereClause += ` AND cs.customer_phone = $${paramIndex}`;
      params.push(customerId);
    }

    const [credits] = await query(`
      SELECT 
        cs.*,
        s.cashier_name,
        s.created_at as sale_created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', cp.id,
              'amount', cp.amount,
              'payment_method', cp.payment_method,
              'received_by_name', cp.received_by_name,
              'created_at', cp.created_at,
              'notes', cp.notes
            )
          ) FILTER (WHERE cp.id IS NOT NULL), '[]'
        ) as payments
      FROM credit_sales cs
      LEFT JOIN sales s ON cs.sale_id = s.id
      LEFT JOIN credit_payments cp ON cs.id = cp.credit_sale_id
      WHERE ${whereClause}
      GROUP BY cs.id, s.cashier_name, s.created_at
      ORDER BY cs.created_at DESC
    `, params);

    res.json({
      success: true,
      data: {
        content: credits || [],
        total: credits?.length || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/credit/summary - Get credit sales summary
router.get('/credit/summary', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = '1=1';
    const params = [];
    
    if (req.user.business_id) {
      whereClause += ` AND business_id = $1`;
      params.push(req.user.business_id);
    }

    const [summary] = await query(`
      SELECT 
        COALESCE(SUM(balance_amount), 0) as total_outstanding,
        COUNT(*) as total_credits,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
        COUNT(*) FILTER (WHERE status = 'PARTIAL') as partial_count,
        COUNT(*) FILTER (WHERE status = 'PAID') as paid_count
      FROM credit_sales
      WHERE ${whereClause}
    `, params);

    const result = summary[0] || {};

    res.json({
      success: true,
      data: {
        total_outstanding: parseFloat(result.total_outstanding) || 0,
        total_credits: parseInt(result.total_credits) || 0,
        pending_count: parseInt(result.pending_count) || 0,
        partial_count: parseInt(result.partial_count) || 0,
        paid_count: parseInt(result.paid_count) || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/credit/customer/:phone - Get customer credit history
router.get('/credit/customer/:phone', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    let whereClause = 'cs.customer_phone = $1';
    const params = [req.params.phone];
    
    if (req.user.business_id) {
      whereClause += ` AND cs.business_id = $2`;
      params.push(req.user.business_id);
    }

    const [credits] = await query(`
      SELECT 
        cs.*,
        s.cashier_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', cp.id,
              'amount', cp.amount,
              'payment_method', cp.payment_method,
              'received_by_name', cp.received_by_name,
              'created_at', cp.created_at
            )
          ) FILTER (WHERE cp.id IS NOT NULL), '[]'
        ) as payments
      FROM credit_sales cs
      LEFT JOIN sales s ON cs.sale_id = s.id
      LEFT JOIN credit_payments cp ON cs.id = cp.credit_sale_id
      WHERE ${whereClause}
      GROUP BY cs.id, s.cashier_name
      ORDER BY cs.created_at DESC
    `, params);

    res.json({
      success: true,
      data: credits || []
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/credit/:id - Get credit sale by ID
router.get('/credit/:id', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    const [credits] = await query(`
      SELECT 
        cs.*,
        s.cashier_name,
        s.total_amount as sale_total,
        COALESCE(
          json_agg(
            json_build_object(
              'id', cp.id,
              'amount', cp.amount,
              'payment_method', cp.payment_method,
              'received_by_name', cp.received_by_name,
              'created_at', cp.created_at,
              'notes', cp.notes
            )
          ) FILTER (WHERE cp.id IS NOT NULL), '[]'
        ) as payments
      FROM credit_sales cs
      LEFT JOIN sales s ON cs.sale_id = s.id
      LEFT JOIN credit_payments cp ON cs.id = cp.credit_sale_id
      WHERE cs.id = $1
      GROUP BY cs.id, s.cashier_name, s.total_amount
    `, [req.params.id]);

    if (!credits || credits.length === 0) {
      return res.status(404).json({ success: false, error: 'Credit sale not found' });
    }

    res.json({
      success: true,
      data: credits[0]
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/sales/credit/payment - Record a payment for a credit sale
router.post('/credit/payment', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    const { credit_sale_id, amount, payment_method, notes } = req.body;
    
    if (!credit_sale_id || !amount) {
      return res.status(400).json({ success: false, error: 'Credit sale ID and amount are required' });
    }
    
    if (amount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });
    }

    await client.query('BEGIN');
    
    const config = require('../config/database').config;
    await client.query(`SET search_path TO ${config.schema}, public`);

    // Get current credit sale
    const creditResult = await client.query(
      'SELECT * FROM credit_sales WHERE id = $1',
      [credit_sale_id]
    );

    if (creditResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Credit sale not found' });
    }

    const credit = creditResult.rows[0];
    const paymentAmount = parseFloat(amount);
    
    if (paymentAmount > parseFloat(credit.balance_amount)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: `Payment amount (${paymentAmount}) exceeds balance (${credit.balance_amount})` 
      });
    }

    // Get user info
    const userResult = await client.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const userName = userResult.rows[0]?.name || 'Unknown';

    // Create payment record
    const paymentId = uuidv4();
    await client.query(`
      INSERT INTO credit_payments (id, credit_sale_id, amount, payment_method, received_by, received_by_name, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      paymentId,
      credit_sale_id,
      paymentAmount,
      (payment_method || 'CASH').toUpperCase(),
      req.user.id,
      userName,
      notes || null
    ]);

    // Update credit sale balances
    const newPaidAmount = parseFloat(credit.paid_amount) + paymentAmount;
    const newBalanceAmount = parseFloat(credit.total_amount) - newPaidAmount;
    const newStatus = newBalanceAmount <= 0 ? 'PAID' : (newPaidAmount > 0 ? 'PARTIAL' : 'PENDING');

    await client.query(`
      UPDATE credit_sales 
      SET paid_amount = $1, balance_amount = $2, status = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [newPaidAmount, newBalanceAmount, newStatus, credit_sale_id]);

    await client.query('COMMIT');

    // Fetch updated credit sale
    const [updatedCredits] = await query(`
      SELECT 
        cs.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', cp.id,
              'amount', cp.amount,
              'payment_method', cp.payment_method,
              'received_by_name', cp.received_by_name,
              'created_at', cp.created_at
            )
          ) FILTER (WHERE cp.id IS NOT NULL), '[]'
        ) as payments
      FROM credit_sales cs
      LEFT JOIN credit_payments cp ON cs.id = cp.credit_sale_id
      WHERE cs.id = $1
      GROUP BY cs.id
    `, [credit_sale_id]);

    res.json({
      success: true,
      data: updatedCredits[0],
      message: newStatus === 'PAID' ? 'Credit fully paid!' : 'Payment recorded successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(e => console.error('Rollback error:', e));
    next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
