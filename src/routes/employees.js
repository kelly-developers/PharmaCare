const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/employees/active - Get active employees (must be before /:id)
router.get('/active', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [employees] = await query(`
      SELECT e.*, u.username, u.email as user_email
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.active = true
      ORDER BY e.name
    `);

    res.json({ success: true, data: employees });
  } catch (error) {
    next(error);
  }
});

// GET /api/employees/stats - Get employee statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [[{ total }]] = await query('SELECT COUNT(*) as total FROM employees');
    const [[{ active }]] = await query('SELECT COUNT(*) as active FROM employees WHERE active = true');

    res.json({
      success: true,
      data: { totalEmployees: parseInt(total), activeEmployees: parseInt(active) }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/employees/user/:userId - Get employee by user ID
router.get('/user/:userId', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [employees] = await query(`
      SELECT e.*, u.username, u.email as user_email
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.user_id = $1
    `, [req.params.userId]);

    if (employees.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    res.json({ success: true, data: employees[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/employees/payroll - Create payroll entry (must be before /:id routes)
router.post('/payroll', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { 
      employee_id, pay_period, basic_salary, allowances, 
      deductions, net_salary, notes 
    } = req.body;

    if (!employee_id || !pay_period) {
      return res.status(400).json({ success: false, error: 'Employee and pay period are required' });
    }

    const id = uuidv4();

    await query(`
      INSERT INTO payroll (
        id, employee_id, pay_period, basic_salary, allowances, 
        deductions, net_salary, status, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, CURRENT_TIMESTAMP)
    `, [id, employee_id, pay_period, basic_salary, allowances || 0, deductions || 0, net_salary, notes]);

    res.status(201).json({
      success: true,
      data: { id, employee_id, pay_period, basic_salary, net_salary, status: 'PENDING' }
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/employees/payroll/:id/status - Update payroll status
router.patch('/payroll/:id/status', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { status } = req.body;

    let queryText = 'UPDATE payroll SET status = $1, updated_at = CURRENT_TIMESTAMP';
    const params = [status];

    if (status === 'PAID') {
      queryText += ', paid_at = CURRENT_TIMESTAMP, paid_by = $2 WHERE id = $3';
      params.push(req.user.id, req.params.id);
    } else {
      queryText += ' WHERE id = $2';
      params.push(req.params.id);
    }

    await query(queryText, params);

    const [payroll] = await query('SELECT * FROM payroll WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: payroll[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/employees - Get all employees (paginated)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [employees] = await query(`
      SELECT e.*, u.username, u.email as user_email, u.role as user_role
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      ORDER BY e.name
      LIMIT $1 OFFSET $2
    `, [size, offset]);

    const [[{ total }]] = await query('SELECT COUNT(*) as total FROM employees');

    res.json({
      success: true,
      data: {
        content: employees,
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

// GET /api/employees/:id - Get employee by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [employees] = await query(`
      SELECT e.*, u.username, u.email as user_email
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.id = $1
    `, [req.params.id]);

    if (employees.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    res.json({ success: true, data: employees[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/employees - Create employee
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { 
      user_id, name, email, phone, department, position, 
      hire_date, salary, bank_account, bank_name, tax_id, address 
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Employee name is required' });
    }

    const id = uuidv4();
    const employee_id = `EMP-${Date.now().toString().slice(-6)}`;

    await query(`
      INSERT INTO employees (
        id, employee_id, user_id, name, email, phone, department, position,
        hire_date, salary, bank_account, bank_name, tax_id, address, active, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, CURRENT_TIMESTAMP)
    `, [id, employee_id, user_id, name, email, phone, department, position, hire_date, salary, bank_account, bank_name, tax_id, address]);

    res.status(201).json({
      success: true,
      data: { id, employee_id, name, email, department, position, active: true }
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { 
      name, email, phone, department, position, 
      salary, bank_account, bank_name, tax_id, address 
    } = req.body;

    await query(`
      UPDATE employees SET
        name = $1, email = $2, phone = $3, department = $4, position = $5,
        salary = $6, bank_account = $7, bank_name = $8, tax_id = $9, address = $10, updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
    `, [name, email, phone, department, position, salary, bank_account, bank_name, tax_id, address, req.params.id]);

    const [employees] = await query('SELECT * FROM employees WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: employees[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/employees/:id - Deactivate employee
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await query('UPDATE employees SET active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/employees/:id/activate - Activate employee
router.patch('/:id/activate', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await query('UPDATE employees SET active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);

    const [employees] = await query('SELECT * FROM employees WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: employees[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/employees/:id/payroll - Get employee payroll (paginated)
router.get('/:id/payroll', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 12;
    const offset = page * size;

    const [payroll] = await query(`
      SELECT p.*, e.name as employee_name
      FROM payroll p
      LEFT JOIN employees e ON p.employee_id = e.id
      WHERE p.employee_id = $1
      ORDER BY p.pay_period DESC
      LIMIT $2 OFFSET $3
    `, [req.params.id, size, offset]);

    const [[{ total }]] = await query(
      'SELECT COUNT(*) as total FROM payroll WHERE employee_id = $1',
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        content: payroll,
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

module.exports = router;
