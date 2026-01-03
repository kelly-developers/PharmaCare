const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/expenses - Get all expenses (paginated)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [expenses] = await db.query(`
      SELECT e.*, u.name as created_by_name, a.name as approved_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN users a ON e.approved_by = a.id
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `, [size, offset]);

    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM expenses');

    res.json({
      success: true,
      data: {
        content: expenses,
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

// GET /api/expenses/pending - Get pending expenses
router.get('/pending', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [expenses] = await db.query(`
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

// GET /api/expenses/category/:category - Get expenses by category
router.get('/category/:category', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [expenses] = await db.query(`
      SELECT e.*, u.name as created_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.category = ?
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.params.category, size, offset]);

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) as total FROM expenses WHERE category = ?',
      [req.params.category]
    );

    res.json({
      success: true,
      data: {
        content: expenses,
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

// GET /api/expenses/period-total - Get total expenses for period
router.get('/period-total', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const [[result]] = await db.query(`
      SELECT COALESCE(SUM(amount), 0) as totalExpenses
      FROM expenses
      WHERE status = 'APPROVED' AND DATE(expense_date) BETWEEN ? AND ?
    `, [startDate, endDate]);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// GET /api/expenses/stats - Get expense statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM expenses');
    const [[{ pending }]] = await db.query('SELECT COUNT(*) as pending FROM expenses WHERE status = ?', ['PENDING']);
    const [[{ approved }]] = await db.query('SELECT COUNT(*) as approved FROM expenses WHERE status = ?', ['APPROVED']);
    const [[{ totalAmount }]] = await db.query('SELECT COALESCE(SUM(amount), 0) as totalAmount FROM expenses WHERE status = ?', ['APPROVED']);

    res.json({
      success: true,
      data: { totalExpenses: total, pendingExpenses: pending, approvedExpenses: approved, totalAmount }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/expenses/:id - Get expense by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [expenses] = await db.query(`
      SELECT e.*, u.name as created_by_name, a.name as approved_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN users a ON e.approved_by = a.id
      WHERE e.id = ?
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

    await db.query(`
      INSERT INTO expenses (id, category, description, amount, expense_date, vendor, receipt_number, notes, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW())
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

    await db.query(`
      UPDATE expenses SET
        category = ?, description = ?, amount = ?, expense_date = ?, vendor = ?, receipt_number = ?, notes = ?, updated_at = NOW()
      WHERE id = ?
    `, [category, description, amount, expense_date, vendor, receipt_number, notes, req.params.id]);

    const [expenses] = await db.query('SELECT * FROM expenses WHERE id = ?', [req.params.id]);

    res.json({ success: true, data: expenses[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/expenses/:id - Delete expense
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    await db.query('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/expenses/:id/approve - Approve expense
router.patch('/:id/approve', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await db.query(
      'UPDATE expenses SET status = ?, approved_by = ?, approved_at = NOW(), updated_at = NOW() WHERE id = ?',
      ['APPROVED', req.user.id, req.params.id]
    );

    const [expenses] = await db.query('SELECT * FROM expenses WHERE id = ?', [req.params.id]);

    res.json({ success: true, data: expenses[0] });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/expenses/:id/reject - Reject expense
router.patch('/:id/reject', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { reason } = req.body;

    await db.query(
      'UPDATE expenses SET status = ?, rejection_reason = ?, approved_by = ?, updated_at = NOW() WHERE id = ?',
      ['REJECTED', reason, req.user.id, req.params.id]
    );

    const [expenses] = await db.query('SELECT * FROM expenses WHERE id = ?', [req.params.id]);

    res.json({ success: true, data: expenses[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
