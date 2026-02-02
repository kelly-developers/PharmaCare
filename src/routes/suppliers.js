const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize, requireBusinessContext } = require('../middleware/auth');

const router = express.Router();

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// GET /api/suppliers/active - Get active suppliers (must be before /:id)
router.get('/active', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = '(is_active = true OR active = true)';
    const params = [];
    
    if (req.businessId) {
      whereClause += ' AND business_id = $1';
      params.push(req.businessId);
    }

    const [suppliers] = await query(
      `SELECT * FROM suppliers WHERE ${whereClause} ORDER BY name`,
      params
    );

    res.json({ success: true, data: suppliers });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/stats - Get supplier statistics
router.get('/stats', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = '1=1';
    const params = [];
    
    if (req.businessId) {
      whereClause = 'business_id = $1';
      params.push(req.businessId);
    }

    const [totalResult] = await query(`SELECT COUNT(*) as total FROM suppliers WHERE ${whereClause}`, params);
    const [activeResult] = await query(`SELECT COUNT(*) as active FROM suppliers WHERE ${whereClause} AND (is_active = true OR active = true)`, params);

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
router.get('/name/:name', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = 'name = $1';
    const params = [req.params.name];
    
    if (req.businessId) {
      whereClause += ' AND business_id = $2';
      params.push(req.businessId);
    }

    const [suppliers] = await query(`SELECT * FROM suppliers WHERE ${whereClause}`, params);

    if (suppliers.length === 0) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    res.json({ success: true, data: suppliers[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers - Get all suppliers (NO pagination - returns ALL suppliers)
// FIXED: Filter by business_id
router.get('/', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { search, active } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;
    
    // CRITICAL: Filter by business_id
    if (req.businessId) {
      paramIndex++;
      whereClause += ` AND business_id = $${paramIndex}`;
      params.push(req.businessId);
    }
    
    if (search) {
      paramIndex++;
      whereClause += ` AND (name ILIKE $${paramIndex} OR contact_person ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
    }
    
    if (active !== undefined) {
      paramIndex++;
      whereClause += ` AND (is_active = $${paramIndex} OR active = $${paramIndex})`;
      params.push(active === 'true');
    }

    const [suppliers] = await query(`
      SELECT * FROM suppliers
      WHERE ${whereClause}
      ORDER BY name
    `, params);

    const total = suppliers.length;

    res.json({
      success: true,
      data: {
        content: suppliers,
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

// GET /api/suppliers/:id - Get supplier by ID
router.get('/:id', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = 'id = $1';
    const params = [req.params.id];
    
    if (req.businessId) {
      whereClause += ' AND business_id = $2';
      params.push(req.businessId);
    }

    const [suppliers] = await query(`SELECT * FROM suppliers WHERE ${whereClause}`, params);

    if (suppliers.length === 0) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    res.json({ success: true, data: suppliers[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/suppliers - Create supplier
// FIXED: Include business_id
router.post('/', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { name, contact_person, email, phone, address, city, country, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Supplier name is required' });
    }

    const id = uuidv4();

    // FIXED: Include business_id
    await query(`
      INSERT INTO suppliers (id, business_id, name, contact_person, email, phone, address, city, country, notes, active, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [id, req.businessId || null, name.trim(), contact_person || null, email || null, phone || null, address || null, city || null, country || null, notes || null]);

    res.status(201).json({
      success: true,
      data: { id, name: name.trim(), contact_person, email, phone, address, city, country, notes, active: true, is_active: true }
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/suppliers/:id - Update supplier
router.put('/:id', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { name, contact_person, email, phone, address, city, country, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Supplier name is required' });
    }

    // Verify business ownership
    let checkQuery = 'SELECT id FROM suppliers WHERE id = $1';
    const checkParams = [req.params.id];
    
    if (req.businessId) {
      checkQuery += ' AND business_id = $2';
      checkParams.push(req.businessId);
    }

    const [existing] = await query(checkQuery, checkParams);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    await query(`
      UPDATE suppliers SET
        name = $1, contact_person = $2, email = $3, phone = $4, address = $5, city = $6, country = $7, notes = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
    `, [name.trim(), contact_person || null, email || null, phone || null, address || null, city || null, country || null, notes || null, req.params.id]);

    const [suppliers] = await query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: suppliers[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/suppliers/:id - Deactivate supplier
router.delete('/:id', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    // Verify business ownership
    let checkQuery = 'SELECT id FROM suppliers WHERE id = $1';
    const checkParams = [req.params.id];
    
    if (req.businessId) {
      checkQuery += ' AND business_id = $2';
      checkParams.push(req.businessId);
    }

    const [existing] = await query(checkQuery, checkParams);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    await query('UPDATE suppliers SET active = false, is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Supplier deactivated successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/suppliers/:id/activate - Activate supplier
router.patch('/:id/activate', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    // Verify business ownership
    let checkQuery = 'SELECT id FROM suppliers WHERE id = $1';
    const checkParams = [req.params.id];
    
    if (req.businessId) {
      checkQuery += ' AND business_id = $2';
      checkParams.push(req.businessId);
    }

    const [existing] = await query(checkQuery, checkParams);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    await query('UPDATE suppliers SET active = true, is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);

    const [suppliers] = await query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);

    res.json({ success: true, data: suppliers[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
