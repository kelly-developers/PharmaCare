const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// GET /api/purchase-orders/supplier/:supplierId - Get orders by supplier (must be before /:id)
router.get('/supplier/:supplierId', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [orders] = await query(`
      SELECT po.*
      FROM purchase_orders po
      WHERE po.supplier_id = $1
      ORDER BY po.created_at DESC
    `, [req.params.supplierId]);

    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
});

// GET /api/purchase-orders/status/:status - Get orders by status
router.get('/status/:status', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [orders] = await query(`
      SELECT po.*
      FROM purchase_orders po
      WHERE po.status = $1
      ORDER BY po.created_at DESC
    `, [req.params.status.toUpperCase()]);

    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
});

// GET /api/purchase-orders/stats - Get purchase order statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [totalResult] = await query('SELECT COUNT(*) as total FROM purchase_orders');
    const [pendingResult] = await query("SELECT COUNT(*) as pending FROM purchase_orders WHERE status IN ('DRAFT', 'SUBMITTED')");
    const [approvedResult] = await query("SELECT COUNT(*) as approved FROM purchase_orders WHERE status = 'APPROVED'");
    const [receivedResult] = await query("SELECT COUNT(*) as received FROM purchase_orders WHERE status = 'RECEIVED'");
    const [valueResult] = await query("SELECT COALESCE(SUM(total), 0) as totalValue FROM purchase_orders WHERE status = 'RECEIVED'");

    res.json({
      success: true,
      data: { 
        totalOrders: parseInt(getFirst(totalResult).total) || 0, 
        pendingOrders: parseInt(getFirst(pendingResult).pending) || 0, 
        approvedOrders: parseInt(getFirst(approvedResult).approved) || 0, 
        receivedOrders: parseInt(getFirst(receivedResult).received) || 0, 
        totalValue: parseFloat(getFirst(valueResult).totalvalue) || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/purchase-orders - Get all purchase orders (paginated)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [orders] = await query(`
      SELECT po.*
      FROM purchase_orders po
      ORDER BY po.created_at DESC
      LIMIT $1 OFFSET $2
    `, [size, offset]);

    // Get order items
    for (let order of orders) {
      const [items] = await query(`
        SELECT poi.*
        FROM purchase_order_items poi
        WHERE poi.purchase_order_id = $1
      `, [order.id]);
      order.items = items;
    }

    const [countResult] = await query('SELECT COUNT(*) as total FROM purchase_orders');
    const total = parseInt(getFirst(countResult).total) || 0;

    res.json({
      success: true,
      data: {
        content: orders,
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

// GET /api/purchase-orders/:id - Get order by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [orders] = await query(`
      SELECT po.*
      FROM purchase_orders po
      WHERE po.id = $1
    `, [req.params.id]);

    if (orders.length === 0) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }

    const [items] = await query(`
      SELECT poi.*
      FROM purchase_order_items poi
      WHERE poi.purchase_order_id = $1
    `, [req.params.id]);

    orders[0].items = items;

    res.json({ success: true, data: orders[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/purchase-orders - Create purchase order
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { supplier_id, supplier_name, items, notes, expected_delivery_date, subtotal, tax, total } = req.body;

    if (!supplier_id || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Supplier and items are required' });
    }

    // Get user name
    const [userResult] = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const createdByName = getFirst(userResult).name || 'Unknown';

    const id = uuidv4();
    const orderNumber = `PO-${Date.now()}`;

    // Calculate totals if not provided
    const calculatedSubtotal = subtotal || items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_cost || item.unit_price || 0)), 0);
    const calculatedTax = tax || 0;
    const calculatedTotal = total || (calculatedSubtotal + calculatedTax);

    await query(`
      INSERT INTO purchase_orders (
        id, order_number, supplier_id, supplier_name, subtotal, tax, total, total_amount,
        status, notes, expected_delivery_date, created_by, created_by_name, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 'DRAFT', $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [id, orderNumber, supplier_id, supplier_name || null, calculatedSubtotal, calculatedTax, calculatedTotal, notes || null, expected_delivery_date || null, req.user.id, createdByName]);

    // Create order items
    for (const item of items) {
      const itemId = uuidv4();
      const unitCost = item.unit_cost || item.unit_price || 0;
      const itemTotal = (item.quantity || 0) * unitCost;
      
      await query(`
        INSERT INTO purchase_order_items (id, purchase_order_id, medicine_id, medicine_name, quantity, unit_price, unit_cost, subtotal, total_cost)
        VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $7)
      `, [itemId, id, item.medicine_id, item.medicine_name || '', item.quantity || 0, unitCost, itemTotal]);
    }

    res.status(201).json({
      success: true,
      data: { id, order_number: orderNumber, supplier_id, subtotal: calculatedSubtotal, tax: calculatedTax, total: calculatedTotal, status: 'DRAFT', items }
    });
  } catch (error) {
    console.error('Create purchase order error:', error);
    next(error);
  }
});

// PUT /api/purchase-orders/:id - Update purchase order
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { supplier_id, supplier_name, items, notes, expected_delivery_date, subtotal, tax, total } = req.body;

    // Check if order is in editable state
    const [orders] = await query('SELECT status FROM purchase_orders WHERE id = $1', [req.params.id]);
    
    if (orders.length === 0) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }

    if (!['DRAFT', 'SUBMITTED'].includes(orders[0].status)) {
      return res.status(400).json({ success: false, error: 'Cannot edit order in current status' });
    }

    // Calculate totals
    const calculatedSubtotal = subtotal || (items ? items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_cost || item.unit_price || 0)), 0) : 0);
    const calculatedTax = tax || 0;
    const calculatedTotal = total || (calculatedSubtotal + calculatedTax);

    await query(`
      UPDATE purchase_orders SET
        supplier_id = $1, supplier_name = $2, subtotal = $3, tax = $4, total = $5, total_amount = $5,
        notes = $6, expected_delivery_date = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `, [supplier_id, supplier_name || null, calculatedSubtotal, calculatedTax, calculatedTotal, notes || null, expected_delivery_date || null, req.params.id]);

    // Update items if provided
    if (items && items.length > 0) {
      await query('DELETE FROM purchase_order_items WHERE purchase_order_id = $1', [req.params.id]);

      for (const item of items) {
        const itemId = uuidv4();
        const unitCost = item.unit_cost || item.unit_price || 0;
        const itemTotal = (item.quantity || 0) * unitCost;
        
        await query(`
          INSERT INTO purchase_order_items (id, purchase_order_id, medicine_id, medicine_name, quantity, unit_price, unit_cost, subtotal, total_cost)
          VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $7)
        `, [itemId, req.params.id, item.medicine_id, item.medicine_name || '', item.quantity || 0, unitCost, itemTotal]);
      }
    }

    const [updatedOrders] = await query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: updatedOrders[0] });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/purchase-orders/:id/submit - Submit order
router.patch('/:id/submit', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await query(
      "UPDATE purchase_orders SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [req.params.id]
    );

    const [orders] = await query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: orders[0] });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/purchase-orders/:id/approve - Approve order
router.patch('/:id/approve', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await query(
      "UPDATE purchase_orders SET status = 'APPROVED', approved_by = $1, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [req.user.id, req.params.id]
    );

    const [orders] = await query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: orders[0] });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/purchase-orders/:id/receive - Receive order
router.patch('/:id/receive', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    // Get order items
    const [items] = await query(`
      SELECT poi.*
      FROM purchase_order_items poi
      WHERE poi.purchase_order_id = $1
    `, [req.params.id]);

    // Get user name
    const [userResult] = await query('SELECT name, role FROM users WHERE id = $1', [req.user.id]);
    const user = getFirst(userResult);

    // Update medicine stock for each item
    for (const item of items) {
      // Get current medicine info
      const [medicines] = await query('SELECT * FROM medicines WHERE id = $1', [item.medicine_id]);
      const medicine = getFirst(medicines);
      const previousStock = medicine.stock_quantity || 0;
      const newStock = previousStock + (item.quantity || 0);

      await query(
        'UPDATE medicines SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newStock, item.medicine_id]
      );

      // Record stock movement
      const movementId = uuidv4();
      await query(`
        INSERT INTO stock_movements (
          id, medicine_id, medicine_name, type, quantity, reference_id, notes, 
          created_by, performed_by_name, performed_by_role, previous_stock, new_stock, created_at
        )
        VALUES ($1, $2, $3, 'PURCHASE', $4, $5, 'Received from purchase order', $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      `, [movementId, item.medicine_id, item.medicine_name || medicine.name || '', item.quantity, req.params.id, req.user.id, user.name || 'Unknown', user.role || 'UNKNOWN', previousStock, newStock]);
    }

    await query(
      "UPDATE purchase_orders SET status = 'RECEIVED', received_by = $1, received_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [req.user.id, req.params.id]
    );

    const [orders] = await query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: orders[0] });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/purchase-orders/:id/cancel - Cancel order
router.patch('/:id/cancel', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { reason } = req.body;

    await query(
      "UPDATE purchase_orders SET status = 'CANCELLED', cancellation_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [reason || 'No reason provided', req.params.id]
    );

    const [orders] = await query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: orders[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
