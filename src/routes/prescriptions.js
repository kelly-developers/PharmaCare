const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/prescriptions - Get all prescriptions (paginated)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [prescriptions] = await db.query(`
      SELECT p.*, u.name as created_by_name, d.name as dispensed_by_name
      FROM prescriptions p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN users d ON p.dispensed_by = d.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [size, offset]);

    // Get prescription items
    for (let prescription of prescriptions) {
      const [items] = await db.query(`
        SELECT pi.*, m.name as medicine_name
        FROM prescription_items pi
        LEFT JOIN medicines m ON pi.medicine_id = m.id
        WHERE pi.prescription_id = ?
      `, [prescription.id]);
      prescription.items = items;
    }

    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM prescriptions');

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

// GET /api/prescriptions/pending - Get pending prescriptions
router.get('/pending', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [prescriptions] = await db.query(`
      SELECT p.*, u.name as created_by_name
      FROM prescriptions p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.status = 'PENDING'
      ORDER BY p.created_at DESC
    `);

    for (let prescription of prescriptions) {
      const [items] = await db.query(`
        SELECT pi.*, m.name as medicine_name
        FROM prescription_items pi
        LEFT JOIN medicines m ON pi.medicine_id = m.id
        WHERE pi.prescription_id = ?
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
    const [prescriptions] = await db.query(`
      SELECT p.*, u.name as created_by_name, d.name as dispensed_by_name
      FROM prescriptions p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN users d ON p.dispensed_by = d.id
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
    const [prescriptions] = await db.query(`
      SELECT p.*, u.name as created_by_name
      FROM prescriptions p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.patient_phone = ?
      ORDER BY p.created_at DESC
    `, [req.params.phone]);

    for (let prescription of prescriptions) {
      const [items] = await db.query(`
        SELECT pi.*, m.name as medicine_name
        FROM prescription_items pi
        LEFT JOIN medicines m ON pi.medicine_id = m.id
        WHERE pi.prescription_id = ?
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
    const [prescriptions] = await db.query(`
      SELECT p.*, u.name as created_by_name
      FROM prescriptions p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.created_by = ?
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
    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM prescriptions');
    const [[{ pending }]] = await db.query('SELECT COUNT(*) as pending FROM prescriptions WHERE status = ?', ['PENDING']);
    const [[{ dispensed }]] = await db.query('SELECT COUNT(*) as dispensed FROM prescriptions WHERE status = ?', ['DISPENSED']);

    res.json({
      success: true,
      data: { totalPrescriptions: total, pendingPrescriptions: pending, dispensedPrescriptions: dispensed }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/prescriptions/:id - Get prescription by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [prescriptions] = await db.query(`
      SELECT p.*, u.name as created_by_name, d.name as dispensed_by_name
      FROM prescriptions p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN users d ON p.dispensed_by = d.id
      WHERE p.id = ?
    `, [req.params.id]);

    if (prescriptions.length === 0) {
      return res.status(404).json({ success: false, error: 'Prescription not found' });
    }

    const [items] = await db.query(`
      SELECT pi.*, m.name as medicine_name
      FROM prescription_items pi
      LEFT JOIN medicines m ON pi.medicine_id = m.id
      WHERE pi.prescription_id = ?
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

    await db.query(`
      INSERT INTO prescriptions (id, patient_name, patient_phone, doctor_name, diagnosis, notes, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW())
    `, [id, patient_name, patient_phone, doctor_name, diagnosis, notes, req.user.id]);

    // Create prescription items
    for (const item of items) {
      const itemId = uuidv4();
      await db.query(`
        INSERT INTO prescription_items (id, prescription_id, medicine_id, quantity, dosage, frequency, duration, instructions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [itemId, id, item.medicine_id, item.quantity, item.dosage, item.frequency, item.duration, item.instructions]);
    }

    res.status(201).json({
      success: true,
      data: { id, patient_name, patient_phone, status: 'PENDING', items }
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/prescriptions/:id - Update prescription
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { patient_name, patient_phone, doctor_name, diagnosis, items, notes } = req.body;

    await db.query(`
      UPDATE prescriptions SET
        patient_name = ?, patient_phone = ?, doctor_name = ?, diagnosis = ?, notes = ?, updated_at = NOW()
      WHERE id = ?
    `, [patient_name, patient_phone, doctor_name, diagnosis, notes, req.params.id]);

    // Update items if provided
    if (items && items.length > 0) {
      await db.query('DELETE FROM prescription_items WHERE prescription_id = ?', [req.params.id]);

      for (const item of items) {
        const itemId = uuidv4();
        await db.query(`
          INSERT INTO prescription_items (id, prescription_id, medicine_id, quantity, dosage, frequency, duration, instructions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [itemId, req.params.id, item.medicine_id, item.quantity, item.dosage, item.frequency, item.duration, item.instructions]);
      }
    }

    const [prescriptions] = await db.query('SELECT * FROM prescriptions WHERE id = ?', [req.params.id]);

    res.json({ success: true, data: prescriptions[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/prescriptions/:id - Delete prescription
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    await db.query('DELETE FROM prescription_items WHERE prescription_id = ?', [req.params.id]);
    await db.query('DELETE FROM prescriptions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/prescriptions/:id/status - Update prescription status
router.patch('/:id/status', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const { status } = req.body;

    let query = 'UPDATE prescriptions SET status = ?, updated_at = NOW()';
    const params = [status];

    if (status === 'DISPENSED') {
      query += ', dispensed_by = ?, dispensed_at = NOW()';
      params.push(req.user.id);
    }

    query += ' WHERE id = ?';
    params.push(req.params.id);

    await db.query(query, params);

    const [prescriptions] = await db.query('SELECT * FROM prescriptions WHERE id = ?', [req.params.id]);

    res.json({ success: true, data: prescriptions[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
