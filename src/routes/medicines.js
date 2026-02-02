const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, authorize, requireBusinessContext } = require('../middleware/auth');

const router = express.Router();

// GET /api/medicines - Get all medicines (NO pagination - returns ALL)
// FIXED: Filter by business_id for multi-tenant isolation
router.get('/', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const category = req.query.category || '';

    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;

    // CRITICAL: Filter by business_id for multi-tenancy
    if (req.businessId) {
      paramIndex++;
      whereClause += ` AND business_id = $${paramIndex}`;
      params.push(req.businessId);
    }

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
        units, image_url, created_at, updated_at, business_id,
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
router.get('/categories', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    let whereClause = "category IS NOT NULL AND category != ''";
    const params = [];
    
    if (req.businessId) {
      whereClause += ' AND business_id = $1';
      params.push(req.businessId);
    }

    const [categories] = await query(`
      SELECT DISTINCT category 
      FROM medicines 
      WHERE ${whereClause}
      ORDER BY category
    `, params);
    res.json({ 
      success: true, 
      data: categories.map(c => c.category).filter(Boolean) 
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/low-stock - Get low stock medicines
router.get('/low-stock', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = 'stock_quantity <= reorder_level';
    const params = [];
    
    if (req.businessId) {
      whereClause += ' AND business_id = $1';
      params.push(req.businessId);
    }

    const [medicines] = await query(`
      SELECT *
      FROM medicines
      WHERE ${whereClause}
      ORDER BY stock_quantity ASC
    `, params);

    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/expiring - Get expiring medicines
router.get('/expiring', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const params = [days];
    let paramIndex = 1;

    let whereClause = `expiry_date <= CURRENT_DATE + INTERVAL '1 day' * $1 AND expiry_date IS NOT NULL`;
    
    if (req.businessId) {
      paramIndex++;
      whereClause += ` AND business_id = $${paramIndex}`;
      params.push(req.businessId);
    }

    const [medicines] = await query(`
      SELECT *
      FROM medicines
      WHERE ${whereClause}
      ORDER BY expiry_date ASC
    `, params);

    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/stats - Get medicine statistics
router.get('/stats', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = '1=1';
    const params = [];
    
    if (req.businessId) {
      whereClause = 'business_id = $1';
      params.push(req.businessId);
    }

    const [totalResult] = await query(`SELECT COUNT(*) as total FROM medicines WHERE ${whereClause}`, params);
    const [lowStockResult] = await query(`SELECT COUNT(*) as count FROM medicines WHERE ${whereClause} AND stock_quantity <= reorder_level`, params);
    const [expiringResult] = await query(`SELECT COUNT(*) as count FROM medicines WHERE ${whereClause} AND expiry_date <= CURRENT_DATE + INTERVAL '90 days'`, params);
    const [outOfStockResult] = await query(`SELECT COUNT(*) as count FROM medicines WHERE ${whereClause} AND stock_quantity = 0`, params);

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
router.get('/:id', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    let whereClause = 'id = $1';
    const params = [req.params.id];
    
    // Ensure user can only access medicines from their business
    if (req.businessId) {
      whereClause += ' AND business_id = $2';
      params.push(req.businessId);
    }

    const [medicines] = await query(
      `SELECT * FROM medicines WHERE ${whereClause}`,
      params
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
// FIXED: Include business_id for multi-tenancy
router.post('/', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
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

    // FIXED: Include business_id in insert
    const insertData = [
      id, 
      req.businessId || null, // business_id for multi-tenancy
      name.trim(), 
      finalGenericName && finalGenericName.trim() ? finalGenericName.trim() : null,
      category.trim(),
      description && description.trim() ? description.trim() : null,
      manufacturer && manufacturer.trim() ? manufacturer.trim() : null,
      calculatedUnitPrice,
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
      business_id: req.businessId,
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
        id, business_id, name, generic_name, category, description, manufacturer,
        unit_price, cost_price, stock_quantity, reorder_level,
        expiry_date, batch_number, requires_prescription, product_type, 
        units, image_url, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
router.put('/:id', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
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

    // Check if medicine exists AND belongs to this business
    let whereClause = 'id = $1';
    const checkParams = [req.params.id];
    if (req.businessId) {
      whereClause += ' AND business_id = $2';
      checkParams.push(req.businessId);
    }

    const [existing] = await query(`SELECT id FROM medicines WHERE ${whereClause}`, checkParams);
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
router.delete('/:id', authenticate, requireBusinessContext, authorize('ADMIN'), async (req, res, next) => {
  try {
    // Check if medicine has sale items
    const [saleItems] = await query(
      'SELECT COUNT(*) as count FROM sale_items WHERE medicine_id = $1',
      [req.params.id]
    );

    if (parseInt(saleItems[0]?.count) > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete medicine with existing sales. Please archive instead.' 
      });
    }

    // Verify medicine belongs to this business
    let whereClause = 'id = $1';
    const params = [req.params.id];
    if (req.businessId) {
      whereClause += ' AND business_id = $2';
      params.push(req.businessId);
    }

    const result = await query(`DELETE FROM medicines WHERE ${whereClause}`, params);

    res.json({ success: true, message: 'Medicine deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
