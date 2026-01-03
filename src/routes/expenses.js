const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/expenses/pending - Get pending expenses (must be before /:id)
router.get('/pending', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [expenses] = await query(`
      SELECT e.*, u.name as created_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.status = 'PENDING'
      ORDER BY e.created_at DESC
    `);

    res.json({ success: true, data: expenses });
  } catch (error) {
    next(error);
  }
});

// GET /api/expenses/period-total - Get total expenses for period
router.get('/period-total', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const [[result]] = await query(`
      SELECT COALESCE(SUM(amount), 0) as "totalExpenses"
      FROM expenses
      WHERE status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2
    `, [startDate, endDate]);

    res.json({ success: true, data: { totalExpenses: parseFloat(result.totalExpenses) } });
  } catch (error) {
    next(error);
  }
});

// GET /api/expenses/stats - Get expense statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [[{ total }]] = await query('SELECT COUNT(*) as total FROM expenses');
    const [[{ pending }]] = await query("SELECT COUNT(*) as pending FROM expenses WHERE status = 'PENDING'");
    const [[{ approved }]] = await query("SELECT COUNT(*) as approved FROM expenses WHERE status = 'APPROVED'");
    const [[{ totalamount }]] = await query("SELECT COALESCE(SUM(amount), 0) as totalAmount FROM expenses WHERE status = 'APPROVED'");

    res.json({
      success: true,
      data: { 
        totalExpenses: parseInt(total), 
        pendingExpenses: parseInt(pending), 
        approvedExpenses: parseInt(approved), 
        totalAmount: parseFloat(totalamount)
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/expenses/category/:category - Get expenses by category
router.get('/category/:category', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [expenses] = await query(`
      SELECT e.*, u.name as created_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.category = $1
      ORDER BY e.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.params.category, size, offset]);

    const [[{ total }]] = await query(
      'SELECT COUNT(*) as total FROM expenses WHERE category = $1',
      [req.params.category]
    );

    res.json({
      success: true,
      data: {
        content: expenses,
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

// GET /api/expenses - Get all expenses (paginated)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [expenses] = await query(`
      SELECT e.*, u.name as created_by_name, a.name as approved_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN users a ON e.approved_by = a.id
      ORDER BY e.created_at DESC
      LIMIT $1 OFFSET $2
    `, [size, offset]);

    const [[{ total }]] = await query('SELECT COUNT(*) as total FROM expenses');

    res.json({
      success: true,
      data: {
        content: expenses,
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

// GET /api/expenses/:id - Get expense by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [expenses] = await query(`
      SELECT e.*, u.name as created_by_name, a.name as approved_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN users a ON e.approved_by = a.id
      WHERE e.id = $1
    `, [req.params.id]);

    if (expenses.length === 0) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }

    res.json({ success: true, data: expenses[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/expenses - Create expense
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    const { category, description, amount, expense_date, vendor, receipt_number, notes } = req.body;

    if (!category || !amount) {
      return res.status(400).json({ success: false, error: 'Category and amount are required' });
    }

    const id = uuidv4();

    await query(`
      INSERT INTO expenses (id, category, description, amount, expense_date, vendor, receipt_number, notes, status, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9, CURRENT_TIMESTAMP)
    `, [id, category, description, amount, expense_date || new Date(), vendor, receipt_number, notes, req.user.id]);

    res.status(201).json({
      success: true,
      data: { id, category, description, amount, expense_date, status: 'PENDING' }
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/expenses/:id - Update expense
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    const { category, description, amount, expense_date, vendor, receipt_number, notes } = req.body;

    await query(`
      UPDATE expenses SET
        category = $1, description = $2, amount = $3, expense_date = $4, vendor = $5, receipt_number = $6, notes = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `, [category, description, amount, expense_date, vendor, receipt_number, notes, req.params.id]);

    const [expenses] = await query('SELECT * FROM expenses WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: expenses[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/expenses/:id - Delete expense
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    await query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/expenses/:id/approve - Approve expense
router.patch('/:id/approve', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await query(
      "UPDATE expenses SET status = 'APPROVED', approved_by = $1, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [req.user.id, req.params.id]
    );

    const [expenses] = await query('SELECT * FROM expenses WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: expenses[0] });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/expenses/:id/reject - Reject expense
router.patch('/:id/reject', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { reason } = req.body;

    await query(
      "UPDATE expenses SET status = 'REJECTED', rejection_reason = $1, approved_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
      [reason, req.user.id, req.params.id]
    );

    const [expenses] = await query('SELECT * FROM expenses WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: expenses[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
