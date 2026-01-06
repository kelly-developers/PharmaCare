const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories - Get all categories
router.get('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [categories] = await query(`
      SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM medicines m WHERE m.category = c.name) as medicine_count
      FROM categories c 
      ORDER BY c.name
    `);

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
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [countResult] = await query('SELECT COUNT(*) as total FROM categories');
    const totalCategories = parseInt(countResult[0]?.total) || 0;
    
    const [categoryBreakdown] = await query(`
      SELECT c.id as "categoryId", c.name, 
        (SELECT COUNT(*) FROM medicines m WHERE m.category = c.name) as "medicineCount"
      FROM categories c
      ORDER BY "medicineCount" DESC
    `);

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
router.get('/name/:name', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const [categories] = await query(`
      SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM medicines m WHERE m.category = c.name) as medicine_count
      FROM categories c 
      WHERE c.name = $1
    `, [req.params.name]);

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
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const [categories] = await query(`
      SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM medicines m WHERE m.category = c.name) as medicine_count
      FROM categories c 
      WHERE c.id = $1
    `, [req.params.id]);

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
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    // Check if category already exists
    const [existing] = await query('SELECT id FROM categories WHERE LOWER(name) = LOWER($1)', [name.trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: 'Category with this name already exists' });
    }

    const id = uuidv4();

    await query(
      'INSERT INTO categories (id, name, description, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [id, name.trim(), description || '']
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
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    // Check if category exists
    const [existing] = await query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    // Check if another category has the same name
    const [duplicate] = await query(
      'SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND id != $2', 
      [name.trim(), req.params.id]
    );
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

    // Update medicines that use this category name
    if (oldName !== newName) {
      await query(
        'UPDATE medicines SET category = $1 WHERE category = $2',
        [newName, oldName]
      );
    }

    // Get updated category
    const [updated] = await query(`
      SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM medicines m WHERE m.category = c.name) as medicine_count
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
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    // Get category to check if it exists and get its name
    const [existing] = await query('SELECT name FROM categories WHERE id = $1', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    // Check if category has medicines
    const [medicines] = await query(
      'SELECT COUNT(*) as count FROM medicines WHERE category = $1',
      [existing[0].name]
    );

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
