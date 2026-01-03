const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories - Get all categories
router.get('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const [categories] = await db.query(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM medicines m WHERE m.category_id = c.id) as medicine_count
      FROM categories c 
      ORDER BY c.name
    `);

    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/stats - Get category statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [[{ totalCategories }]] = await db.query('SELECT COUNT(*) as totalCategories FROM categories');
    
    const [categoryBreakdown] = await db.query(`
      SELECT c.id as categoryId, c.name, 
        (SELECT COUNT(*) FROM medicines m WHERE m.category_id = c.id) as medicineCount
      FROM categories c
      ORDER BY medicineCount DESC
    `);

    const categoriesWithMedicines = categoryBreakdown.filter(c => c.medicineCount > 0).length;

    res.json({
      success: true,
      data: {
        totalCategories,
        categoriesWithMedicines,
        categoryBreakdown
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/:id - Get category by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const [categories] = await db.query(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM medicines m WHERE m.category_id = c.id) as medicine_count
      FROM categories c 
      WHERE c.id = ?
    `, [req.params.id]);

    if (categories.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({ success: true, data: categories[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/name/:name - Get category by name
router.get('/name/:name', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const [categories] = await db.query(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM medicines m WHERE m.category_id = c.id) as medicine_count
      FROM categories c 
      WHERE c.name = ?
    `, [req.params.name]);

    if (categories.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({ success: true, data: categories[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/categories - Create category
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    const id = uuidv4();

    await db.query(
      'INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, NOW())',
      [id, name, description || '']
    );

    res.status(201).json({
      success: true,
      data: { id, name, description, medicine_count: 0, created_at: new Date() }
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/categories/:id - Update category
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { name, description } = req.body;

    await db.query(
      'UPDATE categories SET name = ?, description = ?, updated_at = NOW() WHERE id = ?',
      [name, description, req.params.id]
    );

    const [categories] = await db.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);

    res.json({ success: true, data: categories[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/categories/:id - Delete category
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    // Check if category has medicines
    const [[{ count }]] = await db.query(
      'SELECT COUNT(*) as count FROM medicines WHERE category_id = ?',
      [req.params.id]
    );

    if (count > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete category with associated medicines' 
      });
    }

    await db.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
