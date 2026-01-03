const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/suppliers/active - Get active suppliers (must be before /:id)
router.get('/active', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [suppliers] = await query(
      'SELECT * FROM suppliers WHERE active = true ORDER BY name'
    );

    res.json({ success: true, data: suppliers });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/stats - Get supplier statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [[{ total }]] = await query('SELECT COUNT(*) as total FROM suppliers');
    const [[{ active }]] = await query('SELECT COUNT(*) as active FROM suppliers WHERE active = true');

    res.json({
      success: true,
      data: { totalSuppliers: parseInt(total), activeSuppliers: parseInt(active) }
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

    const [[{ total }]] = await query('SELECT COUNT(*) as total FROM suppliers');

    res.json({
      success: true,
      data: {
        content: suppliers,
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

    if (!name) {
      return res.status(400).json({ success: false, error: 'Supplier name is required' });
    }

    const id = uuidv4();

    await query(`
      INSERT INTO suppliers (id, name, contact_person, email, phone, address, city, country, notes, active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, CURRENT_TIMESTAMP)
    `, [id, name, contact_person, email, phone, address, city, country, notes]);

    res.status(201).json({
      success: true,
      data: { id, name, contact_person, email, phone, address, city, country, notes, active: true }
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/suppliers/:id - Update supplier
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { name, contact_person, email, phone, address, city, country, notes } = req.body;

    await query(`
      UPDATE suppliers SET
        name = $1, contact_person = $2, email = $3, phone = $4, address = $5, city = $6, country = $7, notes = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
    `, [name, contact_person, email, phone, address, city, country, notes, req.params.id]);

    const [suppliers] = await query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: suppliers[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/suppliers/:id - Deactivate supplier
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await query('UPDATE suppliers SET active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/suppliers/:id/activate - Activate supplier
router.patch('/:id/activate', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await query('UPDATE suppliers SET active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);

    const [suppliers] = await query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: suppliers[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
