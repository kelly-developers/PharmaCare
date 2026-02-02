const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize, requireBusinessContext } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories - Get all categories
// FIXED: Filter by business_id to ensure unique categories per business
router.get('/', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;

    // CRITICAL: Filter by business_id - only show categories for the user's business
    if (req.businessId) {
      paramIndex++;
      whereClause += ` AND c.business_id = $${paramIndex}`;
      params.push(req.businessId);
    }

    const [categories] = await query(`
      SELECT c.id, c.name, c.description, c.business_id, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM medicines m WHERE m.category = c.name AND m.business_id = c.business_id) as medicine_count
      FROM categories c 
      WHERE ${whereClause}
      ORDER BY c.name
    `, params);

    // Transform to camelCase for frontend
    const transformedCategories = categories.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      medicineCount: parseInt(c.medicine_count) || 0,
      createdAt: c.created_at,
      updatedAt: c.updated_at
    }));

    res.json({ success: true, data: transformedCategories });
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/stats - Get category statistics
router.get('/stats', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = '1=1';
    const params = [];
    
    if (req.businessId) {
      whereClause = 'business_id = $1';
      params.push(req.businessId);
    }

    const [countResult] = await query(`SELECT COUNT(*) as total FROM categories WHERE ${whereClause}`, params);
    const totalCategories = parseInt(countResult[0]?.total) || 0;
    
    const [categoryBreakdown] = await query(`
      SELECT c.id as "categoryId", c.name, 
        (SELECT COUNT(*) FROM medicines m WHERE m.category = c.name AND m.business_id = c.business_id) as "medicineCount"
      FROM categories c
      WHERE ${whereClause}
      ORDER BY "medicineCount" DESC
    `, params);

    const totalMedicines = categoryBreakdown.reduce((sum, c) => sum + parseInt(c.medicineCount || 0), 0);

    res.json({
      success: true,
      data: {
        totalCategories,
        totalMedicines,
        categoryBreakdown: categoryBreakdown.map(c => ({
          categoryId: c.categoryId,
          name: c.name,
          medicineCount: parseInt(c.medicineCount) || 0
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/name/:name - Get category by name
router.get('/name/:name', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    let whereClause = 'c.name = $1';
    const params = [req.params.name];
    
    if (req.businessId) {
      whereClause += ' AND c.business_id = $2';
      params.push(req.businessId);
    }

    const [categories] = await query(`
      SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM medicines m WHERE m.category = c.name AND m.business_id = c.business_id) as medicine_count
      FROM categories c 
      WHERE ${whereClause}
    `, params);

    if (categories.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    const c = categories[0];
    res.json({ 
      success: true, 
      data: {
        id: c.id,
        name: c.name,
        description: c.description,
        medicineCount: parseInt(c.medicine_count) || 0,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/:id - Get category by ID
router.get('/:id', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    let whereClause = 'c.id = $1';
    const params = [req.params.id];
    
    if (req.businessId) {
      whereClause += ' AND c.business_id = $2';
      params.push(req.businessId);
    }

    const [categories] = await query(`
      SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM medicines m WHERE m.category = c.name AND m.business_id = c.business_id) as medicine_count
      FROM categories c 
      WHERE ${whereClause}
    `, params);

    if (categories.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    const c = categories[0];
    res.json({ 
      success: true, 
      data: {
        id: c.id,
        name: c.name,
        description: c.description,
        medicineCount: parseInt(c.medicine_count) || 0,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/categories - Create category
// FIXED: Include business_id
router.post('/', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    // Check if category already exists FOR THIS BUSINESS
    let checkQuery = 'SELECT id FROM categories WHERE LOWER(name) = LOWER($1)';
    const checkParams = [name.trim()];
    
    if (req.businessId) {
      checkQuery += ' AND business_id = $2';
      checkParams.push(req.businessId);
    }

    const [existing] = await query(checkQuery, checkParams);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: 'Category with this name already exists' });
    }

    const id = uuidv4();

    // FIXED: Include business_id
    await query(
      'INSERT INTO categories (id, business_id, name, description, created_at, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [id, req.businessId || null, name.trim(), description || '']
    );

    res.status(201).json({
      success: true,
      data: { 
        id, 
        name: name.trim(), 
        description: description || '', 
        medicineCount: 0, 
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Category with this name already exists' });
    }
    next(error);
  }
});

// PUT /api/categories/:id - Update category
router.put('/:id', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    // Check if category exists AND belongs to this business
    let existingQuery = 'SELECT * FROM categories WHERE id = $1';
    const existingParams = [req.params.id];
    
    if (req.businessId) {
      existingQuery += ' AND business_id = $2';
      existingParams.push(req.businessId);
    }

    const [existing] = await query(existingQuery, existingParams);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    // Check if another category has the same name IN THIS BUSINESS
    let duplicateQuery = 'SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND id != $2';
    const duplicateParams = [name.trim(), req.params.id];
    
    if (req.businessId) {
      duplicateQuery += ' AND business_id = $3';
      duplicateParams.push(req.businessId);
    }

    const [duplicate] = await query(duplicateQuery, duplicateParams);
    if (duplicate.length > 0) {
      return res.status(409).json({ success: false, error: 'Another category with this name already exists' });
    }

    const oldName = existing[0].name;
    const newName = name.trim();

    // Update category
    await query(
      'UPDATE categories SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [newName, description || '', req.params.id]
    );

    // Update medicines that use this category name (only for this business)
    if (oldName !== newName) {
      let updateMedicinesQuery = 'UPDATE medicines SET category = $1 WHERE category = $2';
      const updateMedicinesParams = [newName, oldName];
      
      if (req.businessId) {
        updateMedicinesQuery += ' AND business_id = $3';
        updateMedicinesParams.push(req.businessId);
      }
      
      await query(updateMedicinesQuery, updateMedicinesParams);
    }

    // Get updated category
    const [updated] = await query(`
      SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM medicines m WHERE m.category = c.name AND m.business_id = c.business_id) as medicine_count
      FROM categories c 
      WHERE c.id = $1
    `, [req.params.id]);

    const c = updated[0];
    res.json({ 
      success: true, 
      data: {
        id: c.id,
        name: c.name,
        description: c.description,
        medicineCount: parseInt(c.medicine_count) || 0,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Category with this name already exists' });
    }
    next(error);
  }
});

// DELETE /api/categories/:id - Delete category
router.delete('/:id', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    // Get category - verify business ownership
    let existingQuery = 'SELECT name, business_id FROM categories WHERE id = $1';
    const existingParams = [req.params.id];
    
    if (req.businessId) {
      existingQuery += ' AND business_id = $2';
      existingParams.push(req.businessId);
    }

    const [existing] = await query(existingQuery, existingParams);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    // Check if category has medicines (only for this business)
    let medicinesQuery = 'SELECT COUNT(*) as count FROM medicines WHERE category = $1';
    const medicinesParams = [existing[0].name];
    
    if (req.businessId) {
      medicinesQuery += ' AND business_id = $2';
      medicinesParams.push(req.businessId);
    }

    const [medicines] = await query(medicinesQuery, medicinesParams);

    if (parseInt(medicines[0]?.count) > 0) {
      return res.status(400).json({ 
        success: false, 
        error: `Cannot delete category with ${medicines[0].count} associated medicines. Please reassign or delete them first.`
      });
    }

    await query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
