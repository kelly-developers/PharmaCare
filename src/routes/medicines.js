const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/medicines - Get all medicines (NO pagination - returns ALL)
router.get('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const category = req.query.category || '';

    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;

    if (search) {
      paramIndex++;
      whereClause += ` AND (name ILIKE $${paramIndex} OR generic_name ILIKE $${paramIndex} OR manufacturer ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
    }

    if (category) {
      paramIndex++;
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
    }

    // Get ALL medicines - no pagination
    const [medicines] = await query(`
      SELECT 
        id, name, generic_name, category, description, manufacturer,
        unit_price, cost_price, stock_quantity, reorder_level,
        expiry_date, batch_number, requires_prescription, product_type,
        units, image_url, created_at, updated_at,
        (stock_quantity * cost_price) as stock_value,
        CASE 
          WHEN stock_quantity = 0 THEN 'Out of Stock'
          WHEN stock_quantity <= reorder_level THEN 'Low Stock'
          ELSE 'In Stock'
        END as status
      FROM medicines
      WHERE ${whereClause}
      ORDER BY name
    `, params);

    const total = medicines.length;

    res.json({
      success: true,
      data: {
        content: medicines,
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

// GET /api/medicines/categories - Get all distinct categories
router.get('/categories', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [categories] = await query(`
      SELECT DISTINCT category 
      FROM medicines 
      WHERE category IS NOT NULL AND category != ''
      ORDER BY category
    `);
    res.json({ 
      success: true, 
      data: categories.map(c => c.category).filter(Boolean) 
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/low-stock - Get low stock medicines
router.get('/low-stock', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [medicines] = await query(`
      SELECT *
      FROM medicines
      WHERE stock_quantity <= reorder_level
      ORDER BY stock_quantity ASC
    `);

    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/expiring - Get expiring medicines
router.get('/expiring', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 90;

    const [medicines] = await query(`
      SELECT *
      FROM medicines
      WHERE expiry_date <= CURRENT_DATE + INTERVAL '1 day' * $1
        AND expiry_date IS NOT NULL
      ORDER BY expiry_date ASC
    `, [days]);

    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/stats - Get medicine statistics
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [totalResult] = await query('SELECT COUNT(*) as total FROM medicines');
    const [lowStockResult] = await query('SELECT COUNT(*) as count FROM medicines WHERE stock_quantity <= reorder_level');
    const [expiringResult] = await query("SELECT COUNT(*) as count FROM medicines WHERE expiry_date <= CURRENT_DATE + INTERVAL '90 days'");
    const [outOfStockResult] = await query('SELECT COUNT(*) as count FROM medicines WHERE stock_quantity = 0');

    res.json({
      success: true,
      data: { 
        totalMedicines: parseInt(totalResult[0]?.total) || 0, 
        lowStock: parseInt(lowStockResult[0]?.count) || 0, 
        expiringSoon: parseInt(expiringResult[0]?.count) || 0, 
        outOfStock: parseInt(outOfStockResult[0]?.count) || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/:id - Get medicine by ID
router.get('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const [medicines] = await query(
      'SELECT * FROM medicines WHERE id = $1',
      [req.params.id]
    );

    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    res.json({ success: true, data: medicines[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/medicines - Create medicine
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    console.log('📥 Received medicine data:', req.body);
    
    // Handle both naming conventions (frontend camelCase vs backend snake_case)
    const {
      name,
      category,
      generic_name,
      genericName, // from frontend
      description,
      manufacturer,
      unit_price,
      unitPrice, // from frontend
      cost_price,
      costPrice, // from frontend
      stock_quantity,
      stockQuantity, // from frontend
      reorder_level = 10,
      reorderLevel, // from frontend
      expiry_date,
      expiryDate, // from frontend
      batch_number,
      batchNumber, // from frontend
      requires_prescription = false,
      product_type,
      productType, // from frontend
      units,
      image_url,
      imageUrl, // from frontend
    } = req.body;

    // Use snake_case if provided, otherwise use camelCase from frontend
    const finalGenericName = generic_name || genericName;
    const finalUnitPrice = unit_price || unitPrice;
    const finalCostPrice = cost_price || costPrice;
    const finalStockQuantity = stock_quantity || stockQuantity;
    const finalReorderLevel = reorder_level || reorderLevel;
    const finalExpiryDate = expiry_date || expiryDate;
    const finalBatchNumber = batch_number || batchNumber;
    const finalProductType = product_type || productType;
    const finalImageUrl = image_url || imageUrl;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Medicine name is required' 
      });
    }

    if (!category || !category.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Category is required' 
      });
    }

    // Validate numeric fields with defaults
    const unitPriceValue = finalUnitPrice ? parseFloat(finalUnitPrice) : 0;
    const costPriceValue = finalCostPrice ? parseFloat(finalCostPrice) : 0;
    const stockQuantityValue = finalStockQuantity ? parseInt(finalStockQuantity) : 0;
    const reorderLevelValue = finalReorderLevel ? parseInt(finalReorderLevel) : 10;

    if (isNaN(unitPriceValue) || unitPriceValue < 0) {
      return res.status(400).json({
        success: false,
        error: 'Unit price must be a valid non-negative number'
      });
    }

    if (isNaN(costPriceValue) || costPriceValue < 0) {
      return res.status(400).json({
        success: false,
        error: 'Cost price must be a valid non-negative number'
      });
    }

    if (isNaN(stockQuantityValue) || stockQuantityValue < 0) {
      return res.status(400).json({
        success: false,
        error: 'Stock quantity must be a valid non-negative number'
      });
    }

    if (isNaN(reorderLevelValue) || reorderLevelValue < 0) {
      return res.status(400).json({
        success: false,
        error: 'Reorder level must be a valid non-negative number'
      });
    }

    // Validate expiry date if provided
    let expiryDateValue = null;
    if (finalExpiryDate && finalExpiryDate.trim() !== '') {
      const expiryDate = new Date(finalExpiryDate);
      if (isNaN(expiryDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Expiry date must be a valid date (YYYY-MM-DD)'
        });
      }
      expiryDateValue = finalExpiryDate;
    }

    // Calculate unit_price from units if not provided
    let calculatedUnitPrice = unitPriceValue;
    if (calculatedUnitPrice === 0 && units && Array.isArray(units) && units.length > 0) {
      // Find the first unit with a price
      const firstUnitWithPrice = units.find(unit => unit.price > 0);
      if (firstUnitWithPrice) {
        calculatedUnitPrice = parseFloat(firstUnitWithPrice.price);
        console.log(`🔢 Calculated unit price from units: ${calculatedUnitPrice}`);
      }
    }

    const id = uuidv4();

    // Prepare insert data with proper handling of empty strings
    const insertData = [
      id, 
      name.trim(), 
      finalGenericName && finalGenericName.trim() ? finalGenericName.trim() : null,
      category.trim(),
      description && description.trim() ? description.trim() : null,
      manufacturer && manufacturer.trim() ? manufacturer.trim() : null,
      calculatedUnitPrice, // Use calculated unit price
      costPriceValue,
      stockQuantityValue,
      reorderLevelValue,
      expiryDateValue,
      finalBatchNumber && finalBatchNumber.trim() ? finalBatchNumber.trim() : null,
      Boolean(requires_prescription),
      finalProductType && finalProductType.trim() ? finalProductType.trim() : null,
      units ? JSON.stringify(units) : null,
      finalImageUrl && finalImageUrl.trim() ? finalImageUrl.trim() : null,
    ];

    console.log('📦 Inserting medicine with data:', {
      id,
      name: name.trim(),
      generic_name: finalGenericName,
      category: category.trim(),
      unit_price: calculatedUnitPrice,
      cost_price: costPriceValue,
      stock_quantity: stockQuantityValue,
      reorder_level: reorderLevelValue,
      expiry_date: expiryDateValue,
      batch_number: finalBatchNumber,
      units: units ? JSON.stringify(units) : null,
    });

    await query(`
      INSERT INTO medicines (
        id, name, generic_name, category, description, manufacturer,
        unit_price, cost_price, stock_quantity, reorder_level,
        expiry_date, batch_number, requires_prescription, product_type, 
        units, image_url, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, insertData);

    // Get the created medicine
    const [medicines] = await query(
      'SELECT * FROM medicines WHERE id = $1',
      [id]
    );

    if (medicines.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve created medicine'
      });
    }

    const medicine = medicines[0];
    
    // Transform response to include calculated fields
    const responseData = {
      ...medicine,
      status: medicine.stock_quantity === 0 ? 'Out of Stock' : 
              medicine.stock_quantity <= medicine.reorder_level ? 'Low Stock' : 'In Stock',
      stock_value: medicine.stock_quantity * medicine.cost_price,
    };

    res.status(201).json({ 
      success: true, 
      data: responseData,
      message: 'Medicine created successfully'
    });
  } catch (error) {
    console.error('❌ Create medicine error:', error);
    
    if (error.code === '23502') { // NOT NULL violation
      return res.status(400).json({
        success: false,
        error: 'Missing required field: ' + (error.column || 'unknown')
      });
    }
    
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({
        success: false,
        error: 'Medicine with this name already exists'
      });
    }
    
    next(error);
  }
});

// PUT /api/medicines/:id - Update medicine
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    console.log('📝 Updating medicine:', req.params.id, req.body);
    
    // Handle both naming conventions
    const {
      name,
      category,
      generic_name,
      genericName,
      description,
      manufacturer,
      unit_price,
      unitPrice,
      cost_price,
      costPrice,
      stock_quantity,
      stockQuantity,
      reorder_level,
      reorderLevel,
      expiry_date,
      expiryDate,
      batch_number,
      batchNumber,
      requires_prescription,
      product_type,
      productType,
      units,
      image_url,
      imageUrl,
    } = req.body;

    // Use snake_case if provided, otherwise use camelCase
    const finalGenericName = generic_name || genericName;
    const finalUnitPrice = unit_price || unitPrice;
    const finalCostPrice = cost_price || costPrice;
    const finalStockQuantity = stock_quantity || stockQuantity;
    const finalReorderLevel = reorder_level || reorderLevel;
    const finalExpiryDate = expiry_date || expiryDate;
    const finalBatchNumber = batch_number || batchNumber;
    const finalProductType = product_type || productType;
    const finalImageUrl = image_url || imageUrl;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Medicine name is required' 
      });
    }

    if (!category || !category.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Category is required' 
      });
    }

    // Check if medicine exists
    const [existing] = await query('SELECT id FROM medicines WHERE id = $1', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    // Calculate unit_price from units if not provided
    let calculatedUnitPrice = finalUnitPrice ? parseFloat(finalUnitPrice) : 0;
    if (calculatedUnitPrice === 0 && units && Array.isArray(units) && units.length > 0) {
      const firstUnitWithPrice = units.find(unit => unit.price > 0);
      if (firstUnitWithPrice) {
        calculatedUnitPrice = parseFloat(firstUnitWithPrice.price);
      }
    }

    await query(`
      UPDATE medicines SET
        name = $1, 
        generic_name = $2, 
        category = $3, 
        description = $4, 
        manufacturer = $5,
        unit_price = $6, 
        cost_price = $7, 
        stock_quantity = $8, 
        reorder_level = $9,
        expiry_date = $10, 
        batch_number = $11, 
        requires_prescription = $12, 
        product_type = $13,
        units = $14, 
        image_url = $15,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $16
    `, [
      name.trim(), 
      finalGenericName || null, 
      category.trim(),
      description || null, 
      manufacturer || null,
      calculatedUnitPrice, 
      parseFloat(finalCostPrice) || 0, 
      parseInt(finalStockQuantity) || 0, 
      parseInt(finalReorderLevel) || 10,
      finalExpiryDate || null, 
      finalBatchNumber || null, 
      Boolean(requires_prescription),
      finalProductType || null,
      units ? JSON.stringify(units) : null, 
      finalImageUrl || null,
      req.params.id
    ]);

    const [medicines] = await query(
      'SELECT * FROM medicines WHERE id = $1',
      [req.params.id]
    );

    res.json({ success: true, data: medicines[0] });
  } catch (error) {
    console.error('Update medicine error:', error);
    next(error);
  }
});

// DELETE /api/medicines/:id - Delete medicine
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    // Check if medicine has sale items
    const [saleItems] = await query(
      'SELECT COUNT(*) as count FROM sale_items WHERE medicine_id = $1',
      [req.params.id]
    );

    if (parseInt(saleItems[0]?.count) > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete medicine with sales history' 
      });
    }

    await query('DELETE FROM medicines WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Medicine deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/medicines/:id/add-stock - Add stock
router.post('/:id/add-stock', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { quantity, batch_number, expiry_date, cost_price, notes, reason } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Valid quantity is required' });
    }

    // Get current medicine
    const [medicines] = await query('SELECT * FROM medicines WHERE id = $1', [req.params.id]);
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    const medicine = medicines[0];
    const previousStock = medicine.stock_quantity;
    const newStock = previousStock + parseInt(quantity);

    // Get user info for tracking
    const [userResult] = await query('SELECT name, role FROM users WHERE id = $1', [req.user.id]);
    const user = userResult && userResult.length > 0 ? userResult[0] : { name: 'Unknown', role: 'UNKNOWN' };

    // Update medicine stock and optionally update cost price and batch info
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    updateFields.push(`stock_quantity = $${paramIndex++}`);
    updateValues.push(newStock);

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    
    if (cost_price) {
      updateFields.push(`cost_price = $${paramIndex++}`);
      updateValues.push(parseFloat(cost_price));
    }
    
    if (batch_number) {
      updateFields.push(`batch_number = $${paramIndex++}`);
      updateValues.push(batch_number);
    }
    
    if (expiry_date) {
      updateFields.push(`expiry_date = $${paramIndex++}`);
      updateValues.push(expiry_date);
    }

    updateValues.push(req.params.id);

    await query(
      `UPDATE medicines SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      updateValues
    );

    // Record stock movement with all required fields
    const movementId = uuidv4();
    await query(`
      INSERT INTO stock_movements (
        id, medicine_id, medicine_name, type, quantity, batch_number, 
        reason, notes, created_by, performed_by_name, performed_by_role,
        previous_stock, new_stock, created_at
      )
      VALUES ($1, $2, $3, 'ADDITION', $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
    `, [
      movementId, 
      req.params.id, 
      medicine.name, 
      parseInt(quantity), 
      batch_number || null, 
      reason || 'Stock addition',
      notes || null, 
      req.user.id, 
      user.name || 'Unknown',
      user.role || 'UNKNOWN',
      previousStock, 
      newStock
    ]);

    res.json({
      success: true,
      data: {
        medicine_id: req.params.id,
        quantity_added: quantity,
        previous_stock: previousStock,
        new_stock: newStock,
        batch_number: batch_number || medicine.batch_number,
        expiry_date: expiry_date || medicine.expiry_date,
        cost_price: cost_price || medicine.cost_price
      },
      message: 'Stock added successfully'
    });
  } catch (error) {
    console.error('Add stock error:', error);
    next(error);
  }
});

// POST /api/medicines/:id/deduct-stock - Deduct stock
router.post('/:id/deduct-stock', authenticate, authorize('ADMIN', 'CASHIER'), async (req, res, next) => {
  try {
    const { quantity, notes, reference_id } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Valid quantity is required' });
    }

    // Check available stock
    const [medicines] = await query('SELECT * FROM medicines WHERE id = $1', [req.params.id]);
    
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    const medicine = medicines[0];

    if (medicine.stock_quantity < quantity) {
      return res.status(400).json({ success: false, error: 'Insufficient stock' });
    }

    const previousStock = medicine.stock_quantity;
    const newStock = previousStock - parseInt(quantity);

    // Update medicine stock
    await query(
      'UPDATE medicines SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newStock, req.params.id]
    );

    res.json({
      success: true,
      data: {
        medicine_id: req.params.id,
        quantity_deducted: quantity,
        previous_stock: previousStock,
        new_stock: newStock
      }
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/medicines/:id/stock - Update stock quantity directly
router.patch('/:id/stock', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { stock_quantity } = req.body;

    if (stock_quantity === undefined || stock_quantity === null) {
      return res.status(400).json({ success: false, error: 'Stock quantity is required' });
    }

    if (parseInt(stock_quantity) < 0) {
      return res.status(400).json({ success: false, error: 'Stock quantity cannot be negative' });
    }

    await query(
      'UPDATE medicines SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [parseInt(stock_quantity), req.params.id]
    );

    const [medicines] = await query(
      'SELECT * FROM medicines WHERE id = $1',
      [req.params.id]
    );

    res.json({ 
      success: true, 
      data: medicines[0],
      message: 'Stock updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/medicines/:id/update-batch - Update batch information
router.post('/:id/update-batch', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { batch_number, expiry_date } = req.body;

    const [medicines] = await query('SELECT * FROM medicines WHERE id = $1', [req.params.id]);
    if (medicines.length === 0) {
      return res.status(404).json({ success: false, error: 'Medicine not found' });
    }

    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (batch_number !== undefined) {
      updateFields.push(`batch_number = $${paramIndex++}`);
      updateValues.push(batch_number || null);
    }

    if (expiry_date !== undefined) {
      updateFields.push(`expiry_date = $${paramIndex++}`);
      updateValues.push(expiry_date || null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(req.params.id);

    await query(
      `UPDATE medicines SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      updateValues
    );

    const [updatedMedicine] = await query(
      'SELECT * FROM medicines WHERE id = $1',
      [req.params.id]
    );

    res.json({ 
      success: true, 
      data: updatedMedicine[0],
      message: 'Batch information updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;