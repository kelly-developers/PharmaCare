const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query, pool } = require('../config/database');
const { authenticate, authorize, requireBusinessContext } = require('../middleware/auth');

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
// FIXED: Include business_id for multi-tenancy
router.post('/', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    const { items, payment_method, customer_name, customer_phone, discount, notes, idempotency_key, due_date } = req.body;

    console.log('🚀 Creating sale request received');
    console.log('📦 Items count:', items?.length || 0);
    console.log('💳 Payment method:', payment_method);
    console.log('🏢 Business ID:', req.businessId);

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

    // Calculate totals and validate stock - ONLY from this business's medicines
    for (const item of items) {
      const medicineId = item.medicine_id || item.medicineId;
      if (!medicineId) {
        throw new Error('Medicine ID is required for each item');
      }

      // FIXED: Filter by business_id
      let medicineQuery = 'SELECT id, name, unit_price, cost_price, stock_quantity, units FROM medicines WHERE id = $1';
      const medicineParams = [medicineId];
      
      if (req.businessId) {
        medicineQuery += ' AND business_id = $2';
        medicineParams.push(req.businessId);
      }

      const medicineResult = await client.query(medicineQuery, medicineParams);

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

    // FIXED: Insert sale record with business_id
    await client.query(`
      INSERT INTO sales (
        id, business_id, cashier_id, cashier_name, total_amount, discount, final_amount,
        profit, payment_method, customer_name, customer_phone, notes, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
    `, [
      saleId, req.businessId || null, req.user.id, cashierName, subtotal, discountAmount, finalAmount,
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

      // FIXED: Record stock movement with business_id
      const movementId = uuidv4();
      await client.query(`
        INSERT INTO stock_movements (
          id, business_id, medicine_id, medicine_name, type, quantity, reference_id,
          created_by, performed_by_name, performed_by_role,
          previous_stock, new_stock, created_at
        )
        VALUES ($1, $2, $3, $4, 'SALE', $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
      `, [
        movementId, req.businessId || null, medicineId, item.medicine_name, item.stock_deduction, saleId,
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
        req.businessId || null,
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
// FIXED: Filter by business_id
router.get('/', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    // Optional date filters
    const { startDate, endDate, cashierId, paymentMethod } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;
    
    // CRITICAL: Filter by business_id
    if (req.businessId) {
      paramIndex++;
      whereClause += ` AND s.business_id = $${paramIndex}`;
      params.push(req.businessId);
    }
    
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
// FIXED: Filter by business_id
router.get('/today', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    let whereClause = "DATE(s.created_at) = CURRENT_DATE";
    const params = [];
    
    if (req.businessId) {
      whereClause += " AND s.business_id = $1";
      params.push(req.businessId);
    }

    const [summaryResult] = await query(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(
          CASE 
            WHEN s.payment_method = 'CREDIT' THEN 0
            ELSE s.final_amount 
          END
        ), 0) as total_sales,
        COALESCE(SUM(
          CASE 
            WHEN s.payment_method = 'CREDIT' THEN 0
            ELSE s.profit 
          END
        ), 0) as total_profit,
        COALESCE(SUM(
          CASE WHEN s.payment_method = 'CREDIT' THEN s.final_amount ELSE 0 END
        ), 0) as total_credit_sales
      FROM sales s
      WHERE ${whereClause}
    `, params);

    // Add paid credit sales from today - filter by business_id
    let creditWhereClause = "DATE(cp.created_at) = CURRENT_DATE";
    const creditParams = [];
    
    if (req.businessId) {
      creditWhereClause += " AND cs.business_id = $1";
      creditParams.push(req.businessId);
    }

    const [paidCreditResult] = await query(`
      SELECT COALESCE(SUM(cp.amount), 0) as paid_credit_today
      FROM credit_payments cp
      JOIN credit_sales cs ON cp.credit_sale_id = cs.id
      WHERE ${creditWhereClause}
    `, creditParams);

    const summary = getFirst(summaryResult);
    const paidCredit = parseFloat(getFirst(paidCreditResult).paid_credit_today) || 0;

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
      WHERE ${whereClause}
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `, params);

    res.json({
      success: true,
      data: {
        date: new Date().toISOString().split('T')[0],
        transactionCount: parseInt(summary.transaction_count) || 0,
        totalSales: (parseFloat(summary.total_sales) || 0) + paidCredit,
        totalProfit: parseFloat(summary.total_profit) || 0,
        totalCreditSales: parseFloat(summary.total_credit_sales) || 0,
        paidCreditToday: paidCredit,
        sales: todaySales || []
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/cashier/:cashierId/today
router.get('/cashier/:cashierId/today', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const cashierId = req.params.cashierId;
    
    let whereClause = 's.cashier_id = $1 AND DATE(s.created_at) = CURRENT_DATE';
    const params = [cashierId];
    
    if (req.businessId) {
      whereClause += ' AND s.business_id = $2';
      params.push(req.businessId);
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

    const summary = sales.reduce((acc, sale) => {
      acc.transaction_count = (acc.transaction_count || 0) + 1;
      acc.total_sales = (acc.total_sales || 0) + parseFloat(sale.final_amount);
      acc.total_profit = (acc.total_profit || 0) + parseFloat(sale.profit || 0);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        date: new Date().toISOString().split('T')[0],
        cashierId,
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

// GET /api/sales/credit - Get credit sales
router.get('/credit', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { status } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;
    
    if (req.businessId) {
      paramIndex++;
      whereClause += ` AND cs.business_id = $${paramIndex}`;
      params.push(req.businessId);
    }
    
    if (status) {
      paramIndex++;
      whereClause += ` AND cs.status = $${paramIndex}`;
      params.push(status.toUpperCase());
    }

    const [creditSales] = await query(`
      SELECT cs.*, s.created_at as sale_date
      FROM credit_sales cs
      LEFT JOIN sales s ON cs.sale_id = s.id
      WHERE ${whereClause}
      ORDER BY cs.created_at DESC
    `, params);

    res.json({
      success: true,
      data: creditSales
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/credit/:id - Get credit sale by ID
router.get('/credit/:id', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = 'cs.id = $1';
    const params = [req.params.id];
    
    if (req.businessId) {
      whereClause += ' AND cs.business_id = $2';
      params.push(req.businessId);
    }

    const [creditSales] = await query(`
      SELECT cs.*, s.created_at as sale_date
      FROM credit_sales cs
      LEFT JOIN sales s ON cs.sale_id = s.id
      WHERE ${whereClause}
    `, params);

    if (creditSales.length === 0) {
      return res.status(404).json({ success: false, error: 'Credit sale not found' });
    }

    // Get sale items
    const [items] = await query(`
      SELECT si.* FROM sale_items si WHERE si.sale_id = $1
    `, [creditSales[0].sale_id]);

    // Get payments
    const [payments] = await query(`
      SELECT * FROM credit_payments WHERE credit_sale_id = $1 ORDER BY created_at DESC
    `, [req.params.id]);

    res.json({
      success: true,
      data: {
        ...creditSales[0],
        items,
        payments
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/sales/credit/:id/payment - Record credit payment
router.post('/credit/:id/payment', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    const { amount, payment_method, notes } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid payment amount is required' });
    }

    await client.query('BEGIN');
    
    const config = require('../config/database').config;
    await client.query(`SET search_path TO ${config.schema}, public`);

    // Get credit sale - verify business ownership
    let creditQuery = 'SELECT * FROM credit_sales WHERE id = $1';
    const creditParams = [req.params.id];
    
    if (req.businessId) {
      creditQuery += ' AND business_id = $2';
      creditParams.push(req.businessId);
    }

    const creditResult = await client.query(creditQuery, creditParams);
    
    if (creditResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Credit sale not found' });
    }

    const creditSale = creditResult.rows[0];
    const currentBalance = parseFloat(creditSale.balance_amount);
    const paymentAmount = Math.min(parseFloat(amount), currentBalance);
    const newBalance = currentBalance - paymentAmount;
    const newPaidAmount = parseFloat(creditSale.paid_amount) + paymentAmount;
    const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';

    // Record payment
    const paymentId = uuidv4();
    const userResult = await client.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const receivedByName = userResult.rows[0]?.name || 'Unknown';

    await client.query(`
      INSERT INTO credit_payments (
        id, credit_sale_id, amount, payment_method, received_by, received_by_name, notes, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `, [paymentId, req.params.id, paymentAmount, payment_method || 'CASH', req.user.id, receivedByName, notes || null]);

    // Update credit sale
    await client.query(`
      UPDATE credit_sales SET
        paid_amount = $1,
        balance_amount = $2,
        status = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [newPaidAmount, newBalance, newStatus, req.params.id]);

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        payment_id: paymentId,
        amount_paid: paymentAmount,
        new_balance: newBalance,
        status: newStatus
      },
      message: newBalance <= 0 ? 'Credit fully paid' : 'Payment recorded successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(e => console.error('Rollback error:', e));
    console.error('❌ Credit payment error:', error.message);
    next(error);
  } finally {
    client.release();
  }
});

// GET /api/sales/:id - Get sale by ID
router.get('/:id', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    let whereClause = 's.id = $1';
    const params = [req.params.id];
    
    if (req.businessId) {
      whereClause += ' AND s.business_id = $2';
      params.push(req.businessId);
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
    `, params);

    if (sales.length === 0) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    res.json({ success: true, data: sales[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/sales/:id - Void/cancel sale (admin only)
router.delete('/:id', authenticate, requireBusinessContext, authorize('ADMIN'), async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const config = require('../config/database').config;
    await client.query(`SET search_path TO ${config.schema}, public`);

    // Verify business ownership
    let saleQuery = 'SELECT * FROM sales WHERE id = $1';
    const saleParams = [req.params.id];
    
    if (req.businessId) {
      saleQuery += ' AND business_id = $2';
      saleParams.push(req.businessId);
    }

    const saleResult = await client.query(saleQuery, saleParams);
    
    if (saleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    // Get sale items to restore stock
    const itemsResult = await client.query(
      'SELECT * FROM sale_items WHERE sale_id = $1',
      [req.params.id]
    );

    // Restore stock for each item
    for (const item of itemsResult.rows) {
      await client.query(
        'UPDATE medicines SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [item.quantity, item.medicine_id]
      );
    }

    // Delete sale items
    await client.query('DELETE FROM sale_items WHERE sale_id = $1', [req.params.id]);
    
    // Delete credit sale if exists
    await client.query('DELETE FROM credit_sales WHERE sale_id = $1', [req.params.id]);
    
    // Delete the sale
    await client.query('DELETE FROM sales WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');

    res.json({ success: true, message: 'Sale voided and stock restored' });
  } catch (error) {
    await client.query('ROLLBACK').catch(e => console.error('Rollback error:', e));
    next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
