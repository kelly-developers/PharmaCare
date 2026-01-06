const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// GET /api/expenses/pending - Get pending expenses (must be before /:id)
router.get('/pending', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [expenses] = await query(`
      SELECT e.*
      FROM expenses e
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

    const [result] = await query(`
      SELECT COALESCE(SUM(amount), 0) as "totalExpenses"
      FROM expenses
      WHERE status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2
    `, [startDate, endDate]);

    res.json({ success: true, data: { totalExpenses: parseFloat(getFirst(result).totalExpenses) || 0 } });
  } catch (error) {
    next(error);
  }
});

// GET /api/expenses/stats - Get expense statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [totalResult] = await query('SELECT COUNT(*) as total FROM expenses');
    const [pendingResult] = await query("SELECT COUNT(*) as pending FROM expenses WHERE status = 'PENDING'");
    const [approvedResult] = await query("SELECT COUNT(*) as approved FROM expenses WHERE status = 'APPROVED'");
    const [amountResult] = await query("SELECT COALESCE(SUM(amount), 0) as totalAmount FROM expenses WHERE status = 'APPROVED'");

    res.json({
      success: true,
      data: { 
        totalExpenses: parseInt(getFirst(totalResult).total) || 0, 
        pendingExpenses: parseInt(getFirst(pendingResult).pending) || 0, 
        approvedExpenses: parseInt(getFirst(approvedResult).approved) || 0, 
        totalAmount: parseFloat(getFirst(amountResult).totalamount) || 0
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
      SELECT e.*
      FROM expenses e
      WHERE e.category = $1
      ORDER BY e.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.params.category, size, offset]);

    const [countResult] = await query(
      'SELECT COUNT(*) as total FROM expenses WHERE category = $1',
      [req.params.category]
    );
    const total = parseInt(getFirst(countResult).total) || 0;

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

// GET /api/expenses - Get all expenses (paginated)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [expenses] = await query(`
      SELECT e.*
      FROM expenses e
      ORDER BY e.created_at DESC
      LIMIT $1 OFFSET $2
    `, [size, offset]);

    const [countResult] = await query('SELECT COUNT(*) as total FROM expenses');
    const total = parseInt(getFirst(countResult).total) || 0;

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

// GET /api/expenses/:id - Get expense by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [expenses] = await query(`
      SELECT e.*
      FROM expenses e
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
    const { category, title, description, amount, date, vendor, receipt_number, receipt_url, notes } = req.body;

    if (!category || !amount) {
      return res.status(400).json({ success: false, error: 'Category and amount are required' });
    }

    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    // Get user name
    const [userResult] = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const createdByName = getFirst(userResult).name || 'Unknown';

    const id = uuidv4();
    const expenseDate = date || new Date().toISOString().split('T')[0];

    await query(`
      INSERT INTO expenses (
        id, category, title, description, amount, date, expense_date, vendor, 
        receipt_number, receipt_url, notes, status, created_by, created_by_name, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, 'PENDING', $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [id, category, title, description || null, amount, expenseDate, vendor || null, receipt_number || null, receipt_url || null, notes || null, req.user.id, createdByName]);

    res.status(201).json({
      success: true,
      data: { id, category, title, description, amount, date: expenseDate, status: 'PENDING', created_by: req.user.id, created_by_name: createdByName }
    });
  } catch (error) {
    console.error('Create expense error:', error);
    next(error);
  }
});

// PUT /api/expenses/:id - Update expense
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    const { category, title, description, amount, date, vendor, receipt_number, receipt_url, notes } = req.body;

    await query(`
      UPDATE expenses SET
        category = $1, title = $2, description = $3, amount = $4, date = $5, expense_date = $5,
        vendor = $6, receipt_number = $7, receipt_url = $8, notes = $9, updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
    `, [category, title, description, amount, date, vendor, receipt_number, receipt_url, notes, req.params.id]);

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
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/expenses/:id/approve - Approve expense
router.patch('/:id/approve', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    // Get approver name
    const [userResult] = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const approvedByName = getFirst(userResult).name || 'Unknown';

    await query(
      "UPDATE expenses SET status = 'APPROVED', approved_by = $1, approved_by_name = $2, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
      [req.user.id, approvedByName, req.params.id]
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
      "UPDATE expenses SET status = 'REJECTED', rejection_reason = $1, rejected_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
      [reason || 'No reason provided', req.user.id, req.params.id]
    );

    const [expenses] = await query('SELECT * FROM expenses WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: expenses[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
