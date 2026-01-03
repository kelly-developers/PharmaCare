const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/purchase-orders/supplier/:supplierId - Get orders by supplier (must be before /:id)
router.get('/supplier/:supplierId', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [orders] = await query(`
      SELECT po.*, s.name as supplier_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
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
      SELECT po.*, s.name as supplier_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
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
    const [[{ total }]] = await query('SELECT COUNT(*) as total FROM purchase_orders');
    const [[{ pending }]] = await query("SELECT COUNT(*) as pending FROM purchase_orders WHERE status IN ('DRAFT', 'SUBMITTED')");
    const [[{ approved }]] = await query("SELECT COUNT(*) as approved FROM purchase_orders WHERE status = 'APPROVED'");
    const [[{ received }]] = await query("SELECT COUNT(*) as received FROM purchase_orders WHERE status = 'RECEIVED'");
    const [[{ totalvalue }]] = await query("SELECT COALESCE(SUM(total_amount), 0) as totalValue FROM purchase_orders WHERE status = 'RECEIVED'");

    res.json({
      success: true,
      data: { 
        totalOrders: parseInt(total), 
        pendingOrders: parseInt(pending), 
        approvedOrders: parseInt(approved), 
        receivedOrders: parseInt(received), 
        totalValue: parseFloat(totalvalue) 
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
      SELECT po.*, s.name as supplier_name, u.name as created_by_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN users u ON po.created_by = u.id
      ORDER BY po.created_at DESC
      LIMIT $1 OFFSET $2
    `, [size, offset]);

    // Get order items
    for (let order of orders) {
      const [items] = await query(`
        SELECT poi.*, m.name as medicine_name
        FROM purchase_order_items poi
        LEFT JOIN medicines m ON poi.medicine_id = m.id
        WHERE poi.purchase_order_id = $1
      `, [order.id]);
      order.items = items;
    }

    const [[{ total }]] = await query('SELECT COUNT(*) as total FROM purchase_orders');

    res.json({
      success: true,
      data: {
        content: orders,
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

// GET /api/purchase-orders/:id - Get order by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [orders] = await query(`
      SELECT po.*, s.name as supplier_name, u.name as created_by_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN users u ON po.created_by = u.id
      WHERE po.id = $1
    `, [req.params.id]);

    if (orders.length === 0) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }

    const [items] = await query(`
      SELECT poi.*, m.name as medicine_name
      FROM purchase_order_items poi
      LEFT JOIN medicines m ON poi.medicine_id = m.id
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
    const { supplier_id, items, notes, expected_delivery_date, total_amount } = req.body;

    if (!supplier_id || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Supplier and items are required' });
    }

    const id = uuidv4();
    const orderNumber = `PO-${Date.now()}`;

    // Calculate total if not provided
    let calculatedTotal = total_amount || 0;
    if (!total_amount) {
      calculatedTotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    }

    await query(`
      INSERT INTO purchase_orders (id, order_number, supplier_id, total_amount, status, notes, expected_delivery_date, created_by, created_at)
      VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, CURRENT_TIMESTAMP)
    `, [id, orderNumber, supplier_id, calculatedTotal, notes, expected_delivery_date, req.user.id]);

    // Create order items
    for (const item of items) {
      const itemId = uuidv4();
      await query(`
        INSERT INTO purchase_order_items (id, purchase_order_id, medicine_id, quantity, unit_price, subtotal)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [itemId, id, item.medicine_id, item.quantity, item.unit_price, item.quantity * item.unit_price]);
    }

    res.status(201).json({
      success: true,
      data: { id, order_number: orderNumber, supplier_id, total_amount: calculatedTotal, status: 'DRAFT', items }
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/purchase-orders/:id - Update purchase order
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { supplier_id, items, notes, expected_delivery_date, total_amount } = req.body;

    // Check if order is in editable state
    const [orders] = await query('SELECT status FROM purchase_orders WHERE id = $1', [req.params.id]);
    
    if (orders.length === 0) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }

    if (!['DRAFT', 'SUBMITTED'].includes(orders[0].status)) {
      return res.status(400).json({ success: false, error: 'Cannot edit order in current status' });
    }

    // Calculate total if not provided
    let calculatedTotal = total_amount || 0;
    if (!total_amount && items) {
      calculatedTotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    }

    await query(`
      UPDATE purchase_orders SET
        supplier_id = $1, total_amount = $2, notes = $3, expected_delivery_date = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [supplier_id, calculatedTotal, notes, expected_delivery_date, req.params.id]);

    // Update items if provided
    if (items && items.length > 0) {
      await query('DELETE FROM purchase_order_items WHERE purchase_order_id = $1', [req.params.id]);

      for (const item of items) {
        const itemId = uuidv4();
        await query(`
          INSERT INTO purchase_order_items (id, purchase_order_id, medicine_id, quantity, unit_price, subtotal)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [itemId, req.params.id, item.medicine_id, item.quantity, item.unit_price, item.quantity * item.unit_price]);
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
      SELECT poi.*, m.name as medicine_name
      FROM purchase_order_items poi
      LEFT JOIN medicines m ON poi.medicine_id = m.id
      WHERE poi.purchase_order_id = $1
    `, [req.params.id]);

    // Update medicine stock for each item
    for (const item of items) {
      await query(
        'UPDATE medicines SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [item.quantity, item.medicine_id]
      );

      // Record stock movement
      const movementId = uuidv4();
      await query(`
        INSERT INTO stock_movements (id, medicine_id, type, quantity, reference_id, notes, created_by, created_at)
        VALUES ($1, $2, 'PURCHASE', $3, $4, 'Received from purchase order', $5, CURRENT_TIMESTAMP)
      `, [movementId, item.medicine_id, item.quantity, req.params.id, req.user.id]);
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
      [reason, req.params.id]
    );

    const [orders] = await query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: orders[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
