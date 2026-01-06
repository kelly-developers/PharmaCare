const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// GET /api/suppliers/active - Get active suppliers (must be before /:id)
router.get('/active', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [suppliers] = await query(
      'SELECT * FROM suppliers WHERE is_active = true OR active = true ORDER BY name'
    );

    res.json({ success: true, data: suppliers });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/stats - Get supplier statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [totalResult] = await query('SELECT COUNT(*) as total FROM suppliers');
    const [activeResult] = await query('SELECT COUNT(*) as active FROM suppliers WHERE is_active = true OR active = true');

    res.json({
      success: true,
      data: { 
        totalSuppliers: parseInt(getFirst(totalResult).total) || 0, 
        activeSuppliers: parseInt(getFirst(activeResult).active) || 0 
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/name/:name - Get supplier by name
router.get('/name/:name', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [suppliers] = await query('SELECT * FROM suppliers WHERE name = $1', [req.params.name]);

    if (suppliers.length === 0) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    res.json({ success: true, data: suppliers[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers - Get all suppliers (paginated)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const size = parseInt(req.query.size) || 20;
    const offset = page * size;

    const [suppliers] = await query(
      'SELECT * FROM suppliers ORDER BY name LIMIT $1 OFFSET $2',
      [size, offset]
    );

    const [countResult] = await query('SELECT COUNT(*) as total FROM suppliers');
    const total = parseInt(getFirst(countResult).total) || 0;

    res.json({
      success: true,
      data: {
        content: suppliers,
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

// GET /api/suppliers/:id - Get supplier by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [suppliers] = await query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);

    if (suppliers.length === 0) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    res.json({ success: true, data: suppliers[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/suppliers - Create supplier
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { name, contact_person, email, phone, address, city, country, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Supplier name is required' });
    }

    const id = uuidv4();

    await query(`
      INSERT INTO suppliers (id, name, contact_person, email, phone, address, city, country, notes, active, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [id, name.trim(), contact_person || null, email || null, phone || null, address || null, city || null, country || null, notes || null]);

    res.status(201).json({
      success: true,
      data: { id, name: name.trim(), contact_person, email, phone, address, city, country, notes, active: true, is_active: true }
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/suppliers/:id - Update supplier
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { name, contact_person, email, phone, address, city, country, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Supplier name is required' });
    }

    await query(`
      UPDATE suppliers SET
        name = $1, contact_person = $2, email = $3, phone = $4, address = $5, city = $6, country = $7, notes = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
    `, [name.trim(), contact_person || null, email || null, phone || null, address || null, city || null, country || null, notes || null, req.params.id]);

    const [suppliers] = await query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);

    if (suppliers.length === 0) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    res.json({ success: true, data: suppliers[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/suppliers/:id - Deactivate supplier
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await query('UPDATE suppliers SET active = false, is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Supplier deactivated successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/suppliers/:id/activate - Activate supplier
router.patch('/:id/activate', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await query('UPDATE suppliers SET active = true, is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);

    const [suppliers] = await query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: suppliers[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
