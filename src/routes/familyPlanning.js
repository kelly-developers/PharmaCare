const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Family planning methods with their cycle days
const FP_METHODS = {
  DEPO: { name: 'Depo Injection', cycleDays: 84 }, // 3 months = 28 * 3 = 84 days
  HERBAL: { name: 'Herbal', cycleDays: 28 },
  FEMI_PLAN: { name: 'Femi Plan', cycleDays: 28 },
};

// GET /api/family-planning - Get all family planning records
router.get('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;

    // Filter by business_id
    if (req.user.business_id) {
      paramIndex++;
      whereClause += ` AND fp.business_id = $${paramIndex}`;
      params.push(req.user.business_id);
    }

    // Filter by status (upcoming, overdue, all)
    const { status, method } = req.query;
    
    if (method) {
      paramIndex++;
      whereClause += ` AND fp.method = $${paramIndex}`;
      params.push(method.toUpperCase());
    }

    const [records] = await query(`
      SELECT 
        fp.*,
        CASE 
          WHEN fp.next_due_date < CURRENT_DATE THEN 'overdue'
          WHEN fp.next_due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'upcoming'
          ELSE 'scheduled'
        END as due_status
      FROM family_planning fp
      WHERE ${whereClause}
      ORDER BY fp.next_due_date ASC
    `, params);

    // Apply status filter in memory after computing due_status
    let filteredRecords = records || [];
    if (status && status !== 'all') {
      filteredRecords = filteredRecords.filter(r => r.due_status === status);
    }

    res.json({
      success: true,
      data: filteredRecords
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/family-planning/due - Get due/upcoming appointments
router.get('/due', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    let whereClause = 'fp.next_due_date <= CURRENT_DATE + INTERVAL \'7 days\'';
    const params = [];

    if (req.user.business_id) {
      whereClause += ` AND fp.business_id = $1`;
      params.push(req.user.business_id);
    }

    const [records] = await query(`
      SELECT 
        fp.*,
        CASE 
          WHEN fp.next_due_date < CURRENT_DATE THEN 'overdue'
          ELSE 'upcoming'
        END as due_status,
        (fp.next_due_date - CURRENT_DATE) as days_until_due
      FROM family_planning fp
      WHERE ${whereClause} AND fp.status = 'ACTIVE'
      ORDER BY fp.next_due_date ASC
    `, params);

    res.json({
      success: true,
      data: records || []
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/family-planning/overdue - Get overdue appointments
router.get('/overdue', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    let whereClause = 'fp.next_due_date < CURRENT_DATE';
    const params = [];

    if (req.user.business_id) {
      whereClause += ` AND fp.business_id = $1`;
      params.push(req.user.business_id);
    }

    const [records] = await query(`
      SELECT 
        fp.*,
        (CURRENT_DATE - fp.next_due_date) as days_overdue
      FROM family_planning fp
      WHERE ${whereClause} AND fp.status = 'ACTIVE'
      ORDER BY fp.next_due_date ASC
    `, params);

    res.json({
      success: true,
      data: records || []
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/family-planning/summary - Get summary stats
router.get('/summary', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    let whereClause = '1=1';
    const params = [];

    if (req.user.business_id) {
      whereClause += ` AND business_id = $1`;
      params.push(req.user.business_id);
    }

    const [summary] = await query(`
      SELECT 
        COUNT(*) as total_clients,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_clients,
        COUNT(*) FILTER (WHERE next_due_date < CURRENT_DATE AND status = 'ACTIVE') as overdue_count,
        COUNT(*) FILTER (WHERE next_due_date <= CURRENT_DATE + INTERVAL '7 days' AND next_due_date >= CURRENT_DATE AND status = 'ACTIVE') as upcoming_count,
        COUNT(*) FILTER (WHERE method = 'DEPO') as depo_count,
        COUNT(*) FILTER (WHERE method = 'HERBAL') as herbal_count,
        COUNT(*) FILTER (WHERE method = 'FEMI_PLAN') as femi_plan_count
      FROM family_planning
      WHERE ${whereClause}
    `, params);

    const result = summary[0] || {};

    res.json({
      success: true,
      data: {
        totalClients: parseInt(result.total_clients) || 0,
        activeClients: parseInt(result.active_clients) || 0,
        overdueCount: parseInt(result.overdue_count) || 0,
        upcomingCount: parseInt(result.upcoming_count) || 0,
        depoCount: parseInt(result.depo_count) || 0,
        herbalCount: parseInt(result.herbal_count) || 0,
        femiPlanCount: parseInt(result.femi_plan_count) || 0,
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/family-planning/:id - Get single record
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [records] = await query(`
      SELECT 
        fp.*,
        CASE 
          WHEN fp.next_due_date < CURRENT_DATE THEN 'overdue'
          WHEN fp.next_due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'upcoming'
          ELSE 'scheduled'
        END as due_status
      FROM family_planning fp
      WHERE fp.id = $1
    `, [req.params.id]);

    if (!records || records.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    res.json({
      success: true,
      data: records[0]
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/family-planning - Create new family planning record
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const { 
      clientName, 
      clientPhone, 
      method, 
      lastAdministeredDate, 
      notes 
    } = req.body;

    if (!clientName || !clientPhone || !method || !lastAdministeredDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Client name, phone, method, and last administered date are required' 
      });
    }

    const methodUpper = method.toUpperCase();
    if (!FP_METHODS[methodUpper]) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid method. Must be DEPO, HERBAL, or FEMI_PLAN' 
      });
    }

    // Calculate next due date based on method
    const cycleDays = FP_METHODS[methodUpper].cycleDays;
    const lastDate = new Date(lastAdministeredDate);
    const nextDueDate = new Date(lastDate);
    nextDueDate.setDate(nextDueDate.getDate() + cycleDays);

    // Get user info
    const [userResult] = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const createdByName = userResult[0]?.name || 'Unknown';

    const id = uuidv4();

    await query(`
      INSERT INTO family_planning (
        id, business_id, client_name, client_phone, method, 
        last_administered_date, next_due_date, cycle_days,
        notes, status, created_by, created_by_name, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      id, 
      req.user.business_id || null, 
      clientName, 
      clientPhone, 
      methodUpper,
      lastAdministeredDate,
      nextDueDate.toISOString().split('T')[0],
      cycleDays,
      notes || null,
      req.user.id,
      createdByName
    ]);

    res.status(201).json({
      success: true,
      data: {
        id,
        clientName,
        clientPhone,
        method: methodUpper,
        methodName: FP_METHODS[methodUpper].name,
        lastAdministeredDate,
        nextDueDate: nextDueDate.toISOString().split('T')[0],
        cycleDays,
        notes,
        status: 'ACTIVE',
        createdBy: req.user.id,
        createdByName
      },
      message: `Family planning record created. Next due: ${nextDueDate.toDateString()}`
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/family-planning/:id/administer - Record new administration
router.put('/:id/administer', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const { administeredDate, notes } = req.body;
    
    if (!administeredDate) {
      return res.status(400).json({ success: false, error: 'Administered date is required' });
    }

    // Get current record
    const [records] = await query('SELECT * FROM family_planning WHERE id = $1', [req.params.id]);
    
    if (!records || records.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    const record = records[0];
    const cycleDays = record.cycle_days || FP_METHODS[record.method]?.cycleDays || 28;
    
    // Calculate new next due date
    const newDate = new Date(administeredDate);
    const nextDueDate = new Date(newDate);
    nextDueDate.setDate(nextDueDate.getDate() + cycleDays);

    // Get user info
    const [userResult] = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const updatedByName = userResult[0]?.name || 'Unknown';

    await query(`
      UPDATE family_planning SET 
        last_administered_date = $1,
        next_due_date = $2,
        notes = COALESCE($3, notes),
        updated_by = $4,
        updated_by_name = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [
      administeredDate,
      nextDueDate.toISOString().split('T')[0],
      notes,
      req.user.id,
      updatedByName,
      req.params.id
    ]);

    res.json({
      success: true,
      data: {
        id: req.params.id,
        lastAdministeredDate: administeredDate,
        nextDueDate: nextDueDate.toISOString().split('T')[0],
      },
      message: `Next appointment scheduled for ${nextDueDate.toDateString()}`
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/family-planning/:id - Update record
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { clientName, clientPhone, method, status, notes } = req.body;

    // Check if record exists
    const [existing] = await query('SELECT * FROM family_planning WHERE id = $1', [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    await query(`
      UPDATE family_planning SET 
        client_name = COALESCE($1, client_name),
        client_phone = COALESCE($2, client_phone),
        method = COALESCE($3, method),
        status = COALESCE($4, status),
        notes = COALESCE($5, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [clientName, clientPhone, method?.toUpperCase(), status, notes, req.params.id]);

    // Fetch updated record
    const [updated] = await query('SELECT * FROM family_planning WHERE id = $1', [req.params.id]);

    res.json({
      success: true,
      data: updated[0]
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/family-planning/:id - Delete/deactivate record
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    // Soft delete by setting status to INACTIVE
    await query(
      "UPDATE family_planning SET status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [req.params.id]
    );

    res.json({
      success: true,
      message: 'Record deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
