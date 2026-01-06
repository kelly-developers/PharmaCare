const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// GET /api/employees/active - Get active employees (must be before /:id)
router.get('/active', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [employees] = await query(`
      SELECT e.*
      FROM employees e
      WHERE e.is_active = true OR e.active = true
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
    const [totalResult] = await query('SELECT COUNT(*) as total FROM employees');
    const [activeResult] = await query('SELECT COUNT(*) as active FROM employees WHERE is_active = true OR active = true');

    res.json({
      success: true,
      data: { 
        totalEmployees: parseInt(getFirst(totalResult).total) || 0, 
        activeEmployees: parseInt(getFirst(activeResult).active) || 0 
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/employees/user/:userId - Get employee by user ID
router.get('/user/:userId', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [employees] = await query(`
      SELECT e.*
      FROM employees e
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
      employee_id, pay_period, month, basic_salary, allowances, 
      deductions, net_salary, payment_method, payment_date, notes 
    } = req.body;

    if (!employee_id || (!pay_period && !month)) {
      return res.status(400).json({ success: false, error: 'Employee and pay period/month are required' });
    }

    const id = uuidv4();

    await query(`
      INSERT INTO payroll (
        id, employee_id, pay_period, month, basic_salary, allowances, 
        deductions, net_salary, payment_method, payment_date, status, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [id, employee_id, pay_period || month, month || pay_period, basic_salary || 0, allowances || 0, deductions || 0, net_salary || 0, payment_method || null, payment_date || null, notes || null]);

    res.status(201).json({
      success: true,
      data: { id, employee_id, pay_period: pay_period || month, basic_salary, net_salary, status: 'PENDING' }
    });
  } catch (error) {
    console.error('Create payroll error:', error);
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
      SELECT e.*
      FROM employees e
      ORDER BY e.name
      LIMIT $1 OFFSET $2
    `, [size, offset]);

    const [countResult] = await query('SELECT COUNT(*) as total FROM employees');
    const total = parseInt(getFirst(countResult).total) || 0;

    res.json({
      success: true,
      data: {
        content: employees,
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

// GET /api/employees/:id - Get employee by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [employees] = await query(`
      SELECT e.*
      FROM employees e
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
      hire_date, salary, bank_account, bank_name, tax_id, kra_pin, nhif_number, nssf_number, address 
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Employee name is required' });
    }

    const id = uuidv4();
    const employee_id = `EMP-${Date.now().toString().slice(-6)}`;

    await query(`
      INSERT INTO employees (
        id, employee_id, user_id, name, email, phone, department, position,
        hire_date, salary, bank_account, bank_name, tax_id, kra_pin, nhif_number, nssf_number, address, 
        active, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [id, employee_id, user_id || null, name.trim(), email || null, phone || null, department || null, position || null, hire_date || null, salary || null, bank_account || null, bank_name || null, tax_id || null, kra_pin || null, nhif_number || null, nssf_number || null, address || null]);

    res.status(201).json({
      success: true,
      data: { id, employee_id, name: name.trim(), email, department, position, active: true, is_active: true }
    });
  } catch (error) {
    console.error('Create employee error:', error);
    next(error);
  }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { 
      name, email, phone, department, position, 
      salary, bank_account, bank_name, tax_id, kra_pin, nhif_number, nssf_number, address 
    } = req.body;

    await query(`
      UPDATE employees SET
        name = $1, email = $2, phone = $3, department = $4, position = $5,
        salary = $6, bank_account = $7, bank_name = $8, tax_id = $9, kra_pin = $10, 
        nhif_number = $11, nssf_number = $12, address = $13, updated_at = CURRENT_TIMESTAMP
      WHERE id = $14
    `, [name, email, phone, department, position, salary, bank_account, bank_name, tax_id, kra_pin, nhif_number, nssf_number, address, req.params.id]);

    const [employees] = await query('SELECT * FROM employees WHERE id = $1', [req.params.id]);

    if (employees.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    res.json({ success: true, data: employees[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/employees/:id - Deactivate employee
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await query('UPDATE employees SET active = false, is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Employee deactivated successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/employees/:id/activate - Activate employee
router.patch('/:id/activate', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await query('UPDATE employees SET active = true, is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);

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
      SELECT p.*
      FROM payroll p
      WHERE p.employee_id = $1
      ORDER BY p.pay_period DESC
      LIMIT $2 OFFSET $3
    `, [req.params.id, size, offset]);

    const [countResult] = await query(
      'SELECT COUNT(*) as total FROM payroll WHERE employee_id = $1',
      [req.params.id]
    );
    const total = parseInt(getFirst(countResult).total) || 0;

    res.json({
      success: true,
      data: {
        content: payroll,
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

module.exports = router;
