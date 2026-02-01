const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { validateAndFixDate } = require('../scripts/initDatabase'); // Import date validation

const router = express.Router();

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// Helper to fix date issues
const fixDateParameter = (dateStr) => {
  if (!dateStr) return null;
  
  try {
    // Remove timezone part if present
    const dateOnly = dateStr.split('T')[0];
    const parts = dateOnly.split('-');
    
    if (parts.length !== 3) return dateStr;
    
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const day = parseInt(parts[2]);
    
    // Fix invalid dates (like Feb 31)
    if (month === 2 && day > 28) {
      // Check for leap year
      const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      const maxDay = isLeapYear ? 29 : 28;
      const fixedDay = Math.min(day, maxDay);
      return `${year}-${month.toString().padStart(2, '0')}-${fixedDay.toString().padStart(2, '0')}`;
    }
    
    // Other months with 31 days
    const monthsWith31Days = [1, 3, 5, 7, 8, 10, 12];
    const monthsWith30Days = [4, 6, 9, 11];
    
    if (monthsWith30Days.includes(month) && day > 30) {
      return `${year}-${month.toString().padStart(2, '0')}-30`;
    }
    
    return dateStr;
  } catch (error) {
    console.warn('⚠️ Date fix error:', error.message);
    return dateStr;
  }
};

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
    
    // Fix date parameters if needed
    const fixedStartDate = fixDateParameter(startDate);
    const fixedEndDate = fixDateParameter(endDate);

    const [result] = await query(`
      SELECT COALESCE(SUM(amount), 0) as "totalExpenses"
      FROM expenses
      WHERE status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2
    `, [fixedStartDate || startDate, fixedEndDate || endDate]);

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

// GET /api/expenses - Get all expenses (NO pagination - returns ALL expenses)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate, status, category } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;
    
    if (startDate && endDate) {
      // Fix date parameters
      const fixedStartDate = fixDateParameter(startDate);
      const fixedEndDate = fixDateParameter(endDate);
      
      paramIndex++;
      whereClause += ` AND DATE(e.expense_date) >= $${paramIndex}`;
      params.push(fixedStartDate || startDate);
      paramIndex++;
      whereClause += ` AND DATE(e.expense_date) <= $${paramIndex}`;
      params.push(fixedEndDate || endDate);
    }
    
    if (status) {
      paramIndex++;
      whereClause += ` AND e.status = $${paramIndex}`;
      params.push(status.toUpperCase());
    }
    
    if (category) {
      paramIndex++;
      whereClause += ` AND e.category = $${paramIndex}`;
      params.push(category);
    }

    const [expenses] = await query(`
      SELECT e.*
      FROM expenses e
      WHERE ${whereClause}
      ORDER BY e.created_at DESC
    `, params);

    const total = expenses.length;

    res.json({
      success: true,
      data: {
        content: expenses,
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
// FIXED: Proper date handling and column names
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    const { category, title, description, amount, date, vendor, receipt_number, receipt_url, notes, createdBy, createdByRole } = req.body;

    console.log('📝 Expense creation request:', req.body);

    if (!category || !amount) {
      return res.status(400).json({ success: false, error: 'Category and amount are required' });
    }

    // Use description as title if title not provided (for backward compatibility)
    const expenseTitle = title || description || category;

    // Get user name
    const [userResult] = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const createdByName = createdBy || getFirst(userResult).name || 'Unknown';

    const id = uuidv4();
    
    // FIXED: Validate and fix the date
    let expenseDate;
    if (date) {
      expenseDate = validateAndFixDate(date);
    } else {
      expenseDate = new Date().toISOString().split('T')[0];
    }

    console.log('📝 Creating expense:', { 
      id, 
      category, 
      title: expenseTitle, 
      description, 
      amount, 
      date: expenseDate, 
      businessId: req.user.business_id 
    });

    // Check if we need to add the title column dynamically
    try {
      // First, check if title column exists
      await query(`
        INSERT INTO expenses (
          id, business_id, category, description, amount, expense_date, vendor, 
          receipt_number, receipt_url, notes, status, created_by, created_by_name, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'APPROVED', $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        id, 
        req.user.business_id || null,
        category, 
        description || expenseTitle, 
        parseFloat(amount), 
        expenseDate, 
        vendor || null, 
        receipt_number || null, 
        receipt_url || null, 
        notes || null, 
        req.user.id, 
        createdByName
      ]);
    } catch (insertError) {
      // If insert failed due to missing title column, try with title
      if (insertError.message.includes('title') && insertError.message.includes('column')) {
        console.log('⚠️ Trying insert with title column...');
        await query(`
          INSERT INTO expenses (
            id, business_id, category, title, description, amount, expense_date, vendor, 
            receipt_number, receipt_url, notes, status, created_by, created_by_name, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'APPROVED', $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
          id, 
          req.user.business_id || null,
          category, 
          expenseTitle, 
          description || expenseTitle, 
          parseFloat(amount), 
          expenseDate, 
          vendor || null, 
          receipt_number || null, 
          receipt_url || null, 
          notes || null, 
          req.user.id, 
          createdByName
        ]);
      } else {
        throw insertError;
      }
    }

    console.log('✅ Expense created successfully:', id);

    // Get the created expense
    const [expenses] = await query('SELECT * FROM expenses WHERE id = $1', [id]);
    const expense = expenses[0] || {};

    res.status(201).json({
      success: true,
      data: { 
        id, 
        category, 
        title: expense.title || expenseTitle,
        description: expense.description || description || expenseTitle, 
        amount: parseFloat(amount), 
        date: expenseDate,
        expense_date: expenseDate,
        status: 'APPROVED',
        createdAt: new Date().toISOString(),
        created_by: req.user.id, 
        created_by_name: createdByName,
        createdBy: createdByName,
        createdByRole: createdByRole || req.user.role,
        vendor: vendor || null,
        receipt_number: receipt_number || null,
        receipt_url: receipt_url || null,
        notes: notes || null
      }
    });
  } catch (error) {
    console.error('❌ Create expense error:', error);
    
    // Check if it's a column missing error
    if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
      console.log('⚠️ Detected missing column, trying to add it dynamically...');
      
      // Extract column name from error
      const columnMatch = error.message.match(/column "([^"]+)" of relation/);
      if (columnMatch) {
        const missingColumn = columnMatch[1];
        console.log(`🔄 Attempting to add missing column: ${missingColumn}`);
        
        // Try to add the missing column and retry
        try {
          const { checkAndAddMissingColumns } = require('../config/db-init');
          await checkAndAddMissingColumns('expenses', [
            { name: missingColumn, type: 'VARCHAR(255)' }
          ]);
          
          // Retry the request
          return router.post(req, res, next);
        } catch (addColumnError) {
          console.error('❌ Failed to add missing column:', addColumnError);
        }
      }
    }
    
    next(error);
  }
});

// PUT /api/expenses/:id - Update expense
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    const { category, title, description, amount, date, vendor, receipt_number, receipt_url, notes } = req.body;
    
    // Validate and fix date
    let expenseDate;
    if (date) {
      expenseDate = validateAndFixDate(date);
    } else {
      expenseDate = new Date().toISOString().split('T')[0];
    }

    await query(`
      UPDATE expenses SET
        category = $1, description = $2, amount = $3, expense_date = $4,
        vendor = $5, receipt_number = $6, receipt_url = $7, notes = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
    `, [category, description, amount, expenseDate, vendor, receipt_number, receipt_url, notes, req.params.id]);

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