const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query, pool } = require('../config/database');
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

// POST /api/sales - Create sale - FIXED VERSION
router.post('/', authenticate, authorize('ADMIN', 'CASHIER'), async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    const { items, payment_method, customer_name, customer_phone, discount, notes } = req.body;

    console.log('🚀 Creating sale with items:', JSON.stringify(items, null, 2));
    console.log('🚀 Payment method received:', payment_method, 'Type:', typeof payment_method);
    console.log('🚀 Customer phone received:', customer_phone, 'Type:', typeof customer_phone);

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Sale items are required' });
    }

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

    // Calculate totals and validate stock - FIXED: Handle both medicineId and medicine_id
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
      console.log('💊 Medicine found:', medicine.name, 'Stock:', medicine.stock_quantity);

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

      console.log('📦 Stock needed for', medicine.name, ':', stockNeeded, 'Available:', medicine.stock_quantity);

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
      item.medicine_id = medicineId; // Ensure medicine_id is set

      console.log(`💰 Item calculation: ${medicine.name}, qty: ${item.quantity}, stock: ${stockNeeded}, price: ${item.unit_price}, cost: ${item.cost_price}, subtotal: ${item.subtotal}, profit: ${item.profit}`);

      subtotal += item.subtotal;
      totalProfit += item.profit;
      totalCost += costForThisItem;
    }

    // Apply discount and calculate totals
    const discountAmount = parseFloat(discount) || 0;
    const finalAmount = subtotal - discountAmount;
    const finalProfit = totalProfit - discountAmount;

    console.log('📊 Sale totals:', {
      subtotal,
      discount: discountAmount,
      finalAmount,
      profit: finalProfit,
      totalCost
    });

    // Get cashier name
    const userResult = await client.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const cashierName = userResult.rows[0]?.name || 'Unknown';

    console.log('👤 Cashier:', cashierName, 'ID:', req.user.id);

    // FIXED: Ensure payment_method is safe before calling toUpperCase()
    const safePaymentMethod = (payment_method || 'CASH').toUpperCase();
    const safeCustomerPhone = customer_phone || ''; // Convert undefined to empty string
    const safeCustomerName = customer_name || 'Walk-in';

    console.log('✅ Safe values:', {
      paymentMethod: safePaymentMethod,
      customerPhone: safeCustomerPhone,
      customerName: safeCustomerName
    });

    // Insert sale record - FIXED: Ensure all required fields
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
      safePaymentMethod, // Use safe value
      safeCustomerName, 
      safeCustomerPhone, 
      notes || null
    ]);

    console.log('✅ Sale inserted with ID:', saleId);

    // Create sale items and update stock
    for (const item of items) {
      const itemId = uuidv4();
      const medicineId = item.medicine_id || item.medicineId;
      const quantity = item.quantity || 1;
      const unitType = item.unit_type || item.unitType || 'TABLET';
      const unitLabel = item.unit_label || item.unitLabel || unitType;

      console.log('➕ Adding sale item:', {
        itemId,
        saleId,
        medicineId,
        quantity,
        unitType,
        stockDeduction: item.stock_deduction
      });

      // Insert sale item - FIXED: Match database column names
      await client.query(`
        INSERT INTO sale_items (
          id, sale_id, medicine_id, medicine_name, quantity, unit_type, unit_label, 
          unit_price, cost_price, subtotal, profit
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        itemId, 
        saleId, 
        medicineId, 
        item.medicine_name, 
        quantity, 
        unitType, 
        unitLabel, 
        item.unit_price, 
        item.cost_price, 
        item.subtotal, 
        item.profit
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
      console.log('📊 Stock updated:', {
        medicine: item.medicine_name,
        before: previousStock,
        after: newStock,
        deduction: item.stock_deduction
      });

      // Record stock movement - FIXED: Use positive quantity for sales
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
        medicineId,
        item.medicine_name,
        item.stock_deduction, // POSITIVE quantity for sales (will be deducted)
        saleId,
        req.user.id,
        cashierName,
        req.user.role,
        previousStock,
        newStock
      ]);

      console.log('📝 Stock movement recorded:', movementId);
    }

    // Commit transaction
    await client.query('COMMIT');
    console.log('🎉 Transaction committed successfully!');

    // Fetch the complete sale record with items
    const saleResult = await client.query(`
      SELECT s.*, 
        json_agg(
          json_build_object(
            'id', si.id,
            'medicine_id', si.medicine_id,
            'medicine_name', si.medicine_name,
            'quantity', si.quantity,
            'unit_type', si.unit_type,
            'unit_label', si.unit_label,
            'unit_price', si.unit_price,
            'subtotal', si.subtotal,
            'profit', si.profit
          )
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
        created_at: createdSale.created_at,
        items: createdSale.items || []
      },
      message: 'Sale created successfully'
    });

  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK').catch(rollbackError => {
      console.error('❌ Rollback error:', rollbackError);
    });
    
    console.error('❌ Create sale error:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create sale'
    });
  } finally {
    client.release();
  }
});

// GET /api/sales - Get all sales (paginated) - FIXED VERSION
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

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
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT $1 OFFSET $2
    `, [size, offset]);

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

// GET /api/sales/today - Get today's sales summary - FIXED VERSION
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

    // Get today's sales with items
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

// GET /api/sales/cashier/:cashierId/today - FIXED VERSION
router.get('/cashier/:cashierId/today', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
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

    // Calculate summary
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

// GET /api/sales/:id - Get sale by ID - FIXED VERSION
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
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

// DELETE /api/sales/:id - Delete sale (void) - FIXED VERSION
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get sale items to reverse stock
    const itemsResult = await client.query('SELECT * FROM sale_items WHERE sale_id = $1', [req.params.id]);
    const items = itemsResult.rows;

    // Reverse stock changes
    for (const item of items) {
      await client.query(
        'UPDATE medicines SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [item.quantity, item.medicine_id]
      );
      
      // Record reversal movement
      const movementId = uuidv4();
      await client.query(`
        INSERT INTO stock_movements (
          id, medicine_id, medicine_name, type, quantity, reference_id, reason,
          created_by, created_at
        )
        VALUES ($1, $2, $3, 'ADJUSTMENT', $4, $5, $6, $7, CURRENT_TIMESTAMP)
      `, [
        movementId,
        item.medicine_id,
        item.medicine_name,
        item.quantity,
        req.params.id,
        'Sale voided',
        req.user.id
      ]);
    }

    // Delete sale itemsand sale
    await client.query('DELETE FROM sale_items WHERE sale_id = $1', [req.params.id]);
    await client.query('DELETE FROM sales WHERE id = $1', [req.params.id]);

    // Delete related stock movements
    await client.query('DELETE FROM stock_movements WHERE reference_id = $1', [req.params.id]);

    await client.query('COMMIT');

    res.json({ success: true, message: 'Sale voided successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

module.exports = router;