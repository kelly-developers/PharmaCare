const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// GET /api/prescriptions/pending - Get pending prescriptions (must be before /:id)
router.get('/pending', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [prescriptions] = await query(`
      SELECT p.*
      FROM prescriptions p
      WHERE p.status = 'PENDING'
      ORDER BY p.created_at DESC
    `);

    for (let prescription of prescriptions) {
      const [items] = await query(`
        SELECT pi.*
        FROM prescription_items pi
        WHERE pi.prescription_id = $1
      `, [prescription.id]);
      prescription.items = items;
    }

    res.json({ success: true, data: prescriptions });
  } catch (error) {
    next(error);
  }
});

// GET /api/prescriptions/dispensed - Get dispensed prescriptions
router.get('/dispensed', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [prescriptions] = await query(`
      SELECT p.*
      FROM prescriptions p
      WHERE p.status = 'DISPENSED'
      ORDER BY p.dispensed_at DESC
    `);

    res.json({ success: true, data: prescriptions });
  } catch (error) {
    next(error);
  }
});

// GET /api/prescriptions/patient/:phone - Get prescriptions by patient phone
router.get('/patient/:phone', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [prescriptions] = await query(`
      SELECT p.*
      FROM prescriptions p
      WHERE p.patient_phone = $1
      ORDER BY p.created_at DESC
    `, [req.params.phone]);

    for (let prescription of prescriptions) {
      const [items] = await query(`
        SELECT pi.*
        FROM prescription_items pi
        WHERE pi.prescription_id = $1
      `, [prescription.id]);
      prescription.items = items;
    }

    res.json({ success: true, data: prescriptions });
  } catch (error) {
    next(error);
  }
});

// GET /api/prescriptions/creator/:userId - Get prescriptions by creator
router.get('/creator/:userId', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const [prescriptions] = await query(`
      SELECT p.*
      FROM prescriptions p
      WHERE p.created_by = $1
      ORDER BY p.created_at DESC
    `, [req.params.userId]);

    res.json({ success: true, data: prescriptions });
  } catch (error) {
    next(error);
  }
});

// GET /api/prescriptions/stats - Get prescription statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [totalResult] = await query('SELECT COUNT(*) as total FROM prescriptions');
    const [pendingResult] = await query("SELECT COUNT(*) as pending FROM prescriptions WHERE status = 'PENDING'");
    const [dispensedResult] = await query("SELECT COUNT(*) as dispensed FROM prescriptions WHERE status = 'DISPENSED'");

    res.json({
      success: true,
      data: { 
        totalPrescriptions: parseInt(getFirst(totalResult).total) || 0, 
        pendingPrescriptions: parseInt(getFirst(pendingResult).pending) || 0, 
        dispensedPrescriptions: parseInt(getFirst(dispensedResult).dispensed) || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/prescriptions - Get all prescriptions (paginated)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [prescriptions] = await query(`
      SELECT p.*
      FROM prescriptions p
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `, [size, offset]);

    // Get prescription items
    for (let prescription of prescriptions) {
      const [items] = await query(`
        SELECT pi.*
        FROM prescription_items pi
        WHERE pi.prescription_id = $1
      `, [prescription.id]);
      prescription.items = items;
    }

    const [countResult] = await query('SELECT COUNT(*) as total FROM prescriptions');
    const total = parseInt(getFirst(countResult).total) || 0;

    res.json({
      success: true,
      data: {
        content: prescriptions,
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

// GET /api/prescriptions/:id - Get prescription by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [prescriptions] = await query(`
      SELECT p.*
      FROM prescriptions p
      WHERE p.id = $1
    `, [req.params.id]);

    if (prescriptions.length === 0) {
      return res.status(404).json({ success: false, error: 'Prescription not found' });
    }

    const [items] = await query(`
      SELECT pi.*
      FROM prescription_items pi
      WHERE pi.prescription_id = $1
    `, [req.params.id]);

    prescriptions[0].items = items;

    res.json({ success: true, data: prescriptions[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/prescriptions - Create prescription
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { patient_name, patient_phone, doctor_name, diagnosis, items, notes } = req.body;

    if (!patient_name || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Patient name and items are required' });
    }

    const id = uuidv4();

    await query(`
      INSERT INTO prescriptions (id, patient_name, patient_phone, doctor_name, diagnosis, notes, status, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [id, patient_name, patient_phone || null, doctor_name || null, diagnosis || null, notes || null, req.user.id]);

    // Create prescription items
    for (const item of items) {
      const itemId = uuidv4();
      await query(`
        INSERT INTO prescription_items (id, prescription_id, medicine_id, medicine, quantity, dosage, frequency, duration, instructions)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [itemId, id, item.medicine_id, item.medicine || item.medicine_name || '', item.quantity, item.dosage || null, item.frequency || null, item.duration || null, item.instructions || null]);
    }

    res.status(201).json({
      success: true,
      data: { id, patient_name, patient_phone, status: 'PENDING', items }
    });
  } catch (error) {
    console.error('Create prescription error:', error);
    next(error);
  }
});

// PUT /api/prescriptions/:id - Update prescription
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { patient_name, patient_phone, doctor_name, diagnosis, items, notes } = req.body;

    await query(`
      UPDATE prescriptions SET
        patient_name = $1, patient_phone = $2, doctor_name = $3, diagnosis = $4, notes = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [patient_name, patient_phone, doctor_name, diagnosis, notes, req.params.id]);

    // Update items if provided
    if (items && items.length > 0) {
      await query('DELETE FROM prescription_items WHERE prescription_id = $1', [req.params.id]);

      for (const item of items) {
        const itemId = uuidv4();
        await query(`
          INSERT INTO prescription_items (id, prescription_id, medicine_id, medicine, quantity, dosage, frequency, duration, instructions)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [itemId, req.params.id, item.medicine_id, item.medicine || item.medicine_name || '', item.quantity, item.dosage || null, item.frequency || null, item.duration || null, item.instructions || null]);
      }
    }

    const [prescriptions] = await query('SELECT * FROM prescriptions WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: prescriptions[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/prescriptions/:id - Delete prescription
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    await query('DELETE FROM prescription_items WHERE prescription_id = $1', [req.params.id]);
    await query('DELETE FROM prescriptions WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Prescription deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/prescriptions/:id/status - Update prescription status
router.patch('/:id/status', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const { status } = req.body;

    let queryText = 'UPDATE prescriptions SET status = $1, updated_at = CURRENT_TIMESTAMP';
    const params = [status];

    if (status === 'DISPENSED') {
      queryText += ', dispensed_by = $2, dispensed_at = CURRENT_TIMESTAMP WHERE id = $3';
      params.push(req.user.id, req.params.id);
    } else {
      queryText += ' WHERE id = $2';
      params.push(req.params.id);
    }

    await query(queryText, params);

    const [prescriptions] = await query('SELECT * FROM prescriptions WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: prescriptions[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
