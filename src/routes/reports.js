const express = require('express');
const { query } = require('../config/database');
const { authenticate, authorize, requireBusinessContext } = require('../middleware/auth');

const router = express.Router();

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// Helper to build business filter
const buildBusinessFilter = (alias, businessId, existingParams = []) => {
  if (!businessId) return { whereClause: '', params: existingParams };
  
  const paramIndex = existingParams.length + 1;
  return {
    whereClause: `${alias ? alias + '.' : ''}business_id = $${paramIndex}`,
    params: [...existingParams, businessId]
  };
};

// GET /api/reports/dashboard - Get dashboard summary
// FIXED: Filter by business_id
router.get('/dashboard', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    let salesFilter = "DATE(created_at) = CURRENT_DATE";
    let creditFilter = "DATE(cp.created_at) = CURRENT_DATE";
    let stockFilter = "1=1";
    let prescriptionFilter = "status = 'PENDING'";
    let expenseFilter = "status = 'PENDING'";
    
    const params = [];
    
    if (req.businessId) {
      salesFilter += " AND business_id = $1";
      creditFilter += " AND cs.business_id = $1";
      stockFilter = "business_id = $1";
      prescriptionFilter += " AND business_id = $1";
      expenseFilter += " AND business_id = $1";
      params.push(req.businessId);
    }

    // Today's sales - Exclude CREDIT sales from totals until paid
    const [salesResult] = await query(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(CASE WHEN payment_method != 'CREDIT' THEN final_amount ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN payment_method != 'CREDIT' THEN profit ELSE 0 END), 0) as total_profit,
        COALESCE(SUM(CASE WHEN payment_method = 'CREDIT' THEN final_amount ELSE 0 END), 0) as credit_sales
      FROM sales
      WHERE ${salesFilter}
    `, params);
    const salesData = getFirst(salesResult);
    
    // Add paid credit sales from today
    const [paidCreditResult] = await query(`
      SELECT COALESCE(SUM(cp.amount), 0) as paid_credit_today
      FROM credit_payments cp
      JOIN credit_sales cs ON cp.credit_sale_id = cs.id
      WHERE ${creditFilter}
    `, params);
    const paidCreditToday = parseFloat(getFirst(paidCreditResult).paid_credit_today) || 0;

    // Stock summary
    const [stockResult] = await query(`
      SELECT 
        COUNT(*) as total_medicines,
        SUM(CASE WHEN stock_quantity <= reorder_level THEN 1 ELSE 0 END) as low_stock,
        SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) as out_of_stock,
        SUM(CASE WHEN expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 1 ELSE 0 END) as expiring_soon
      FROM medicines
      WHERE ${stockFilter}
    `, params);
    const stockData = getFirst(stockResult);

    // Pending prescriptions
    const [prescriptionResult] = await query(`
      SELECT COUNT(*) as pending FROM prescriptions WHERE ${prescriptionFilter}
    `, params);
    const prescriptionData = getFirst(prescriptionResult);

    // Pending expenses
    const [expenseResult] = await query(`
      SELECT COUNT(*) as pending FROM expenses WHERE ${expenseFilter}
    `, params);
    const expenseData = getFirst(expenseResult);

    // Stock value (selling price)
    const [stockValueResult] = await query(`
      SELECT COALESCE(SUM(stock_quantity * unit_price), 0) as stock_value
      FROM medicines
      WHERE ${stockFilter}
    `, params);
    const stockValue = parseFloat(getFirst(stockValueResult).stock_value) || 0;

    // Inventory value (cost price)
    const [inventoryValueResult] = await query(`
      SELECT COALESCE(SUM(stock_quantity * cost_price), 0) as inventory_value
      FROM medicines
      WHERE ${stockFilter}
    `, params);
    const inventoryValue = parseFloat(getFirst(inventoryValueResult).inventory_value) || 0;

    // Monthly profit data (current month and last month)
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    let monthFilter = `EXTRACT(YEAR FROM created_at) = $1 AND EXTRACT(MONTH FROM created_at) = $2`;
    let monthParams = [currentYear, currentMonth];
    
    if (req.businessId) {
      monthFilter += ` AND business_id = $3`;
      monthParams.push(req.businessId);
    }
    
    // Current month profit
    const [currentMonthProfitResult] = await query(`
      SELECT COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE ${monthFilter}
    `, monthParams);
    const currentMonthProfit = parseFloat(getFirst(currentMonthProfitResult).total_profit) || 0;

    // Last month profit
    let lastMonth = currentMonth - 1;
    let lastYear = currentYear;
    if (lastMonth === 0) {
      lastMonth = 12;
      lastYear = currentYear - 1;
    }
    
    let lastMonthParams = [lastYear, lastMonth];
    if (req.businessId) {
      lastMonthParams.push(req.businessId);
    }
    
    const [lastMonthProfitResult] = await query(`
      SELECT COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE ${monthFilter.replace('$1', '$1').replace('$2', '$2')}
    `, lastMonthParams);
    const lastMonthProfit = parseFloat(getFirst(lastMonthProfitResult).total_profit) || 0;

    res.json({
      success: true,
      data: {
        // Today's metrics - Include paid credit sales in totals
        todaySales: (parseFloat(salesData.total_sales) || 0) + paidCreditToday,
        todayTransactions: parseInt(salesData.transaction_count) || 0,
        todayProfit: parseFloat(salesData.total_profit) || 0,
        todayCreditSales: parseFloat(salesData.credit_sales) || 0,
        paidCreditToday: paidCreditToday,
        
        // Monthly profit data
        thisMonthProfit: currentMonthProfit,
        lastMonthProfit: lastMonthProfit,
        
        // Inventory data
        inventoryValue: inventoryValue,
        stockValue: stockValue,
        totalStockItems: parseInt(stockData.total_medicines) || 0,
        lowStockCount: parseInt(stockData.low_stock) || 0,
        outOfStockCount: parseInt(stockData.out_of_stock) || 0,
        expiringSoonCount: parseInt(stockData.expiring_soon) || 0,
        
        // Pending items
        pendingPrescriptions: parseInt(prescriptionData.pending) || 0,
        pendingExpenses: parseInt(expenseData.pending) || 0,
        
        todayExpenses: 0,
        pendingOrders: 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/sales-summary - Get sales summary
router.get('/sales-summary', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;

    if (req.businessId) {
      paramIndex++;
      whereClause += ` AND business_id = $${paramIndex}`;
      params.push(req.businessId);
    }

    if (startDate && endDate) {
      paramIndex++;
      whereClause += ` AND DATE(created_at) >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
      whereClause += ` AND DATE(created_at) <= $${paramIndex}`;
      params.push(endDate);
    }

    const [summaryResult] = await query(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(final_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(AVG(final_amount), 0) as average_sale
      FROM sales
      WHERE ${whereClause}
    `, params);
    const summary = getFirst(summaryResult);

    // Top selling medicines
    let topMedicinesWhere = '1=1';
    if (req.businessId) {
      topMedicinesWhere = 's.business_id = $1';
    }
    if (startDate && endDate) {
      const dateParamStart = req.businessId ? '$2' : '$1';
      const dateParamEnd = req.businessId ? '$3' : '$2';
      topMedicinesWhere += ` AND DATE(s.created_at) >= ${dateParamStart} AND DATE(s.created_at) <= ${dateParamEnd}`;
    }

    const [topMedicines] = await query(`
      SELECT si.medicine_name as name, SUM(si.quantity) as total_sold, SUM(si.subtotal) as total_revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE ${topMedicinesWhere}
      GROUP BY si.medicine_name
      ORDER BY total_sold DESC
      LIMIT 10
    `, params);

    // Sales by payment method
    const [paymentBreakdown] = await query(`
      SELECT payment_method, COUNT(*) as count, SUM(final_amount) as total
      FROM sales
      WHERE ${whereClause}
      GROUP BY payment_method
    `, params);

    res.json({
      success: true,
      data: {
        summary: {
          total_transactions: parseInt(summary.total_transactions) || 0,
          total_sales: parseFloat(summary.total_sales) || 0,
          total_profit: parseFloat(summary.total_profit) || 0,
          average_sale: parseFloat(summary.average_sale) || 0
        },
        topMedicines,
        paymentBreakdown
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/stock-summary - Get stock summary
router.get('/stock-summary', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = "category IS NOT NULL AND category != ''";
    const params = [];
    
    if (req.businessId) {
      whereClause += ' AND business_id = $1';
      params.push(req.businessId);
    }

    // Stock by category
    const [categoryBreakdown] = await query(`
      SELECT 
        category,
        COUNT(*) as medicine_count,
        COALESCE(SUM(stock_quantity), 0) as total_stock,
        COALESCE(SUM(stock_quantity * cost_price), 0) as total_cost_value,
        COALESCE(SUM(stock_quantity * unit_price), 0) as total_retail_value
      FROM medicines
      WHERE ${whereClause}
      GROUP BY category
      ORDER BY total_retail_value DESC
    `, params);

    // Low stock items
    let lowStockWhere = 'stock_quantity <= reorder_level';
    if (req.businessId) {
      lowStockWhere += ' AND business_id = $1';
    }
    
    const [lowStock] = await query(`
      SELECT name, stock_quantity, reorder_level, category, batch_number, expiry_date
      FROM medicines
      WHERE ${lowStockWhere}
      ORDER BY stock_quantity ASC
      LIMIT 20
    `, params);

    // Expiring soon
    let expiringWhere = "expiry_date <= CURRENT_DATE + INTERVAL '90 days'";
    if (req.businessId) {
      expiringWhere += ' AND business_id = $1';
    }
    
    const [expiring] = await query(`
      SELECT name, stock_quantity, expiry_date, category, batch_number
      FROM medicines
      WHERE ${expiringWhere}
      ORDER BY expiry_date ASC
      LIMIT 20
    `, params);

    res.json({
      success: true,
      data: {
        categoryBreakdown,
        lowStock,
        expiring
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/balance-sheet - Get balance sheet
router.get('/balance-sheet', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { asOfDate } = req.query;
    const date = asOfDate || new Date().toISOString().split('T')[0];

    let inventoryWhere = '1=1';
    let salesWhere = 'DATE(created_at) <= $1';
    let purchaseWhere = "status IN ('APPROVED', 'SUBMITTED') AND DATE(created_at) <= $1";
    let expenseWhere = "status = 'APPROVED' AND DATE(expense_date) <= $1";
    
    const dateParams = [date];
    
    if (req.businessId) {
      inventoryWhere = 'business_id = $1';
      salesWhere += ' AND business_id = $2';
      purchaseWhere += ' AND business_id = $2';
      expenseWhere += ' AND business_id = $2';
      dateParams.push(req.businessId);
    }

    // Assets - Inventory value
    const inventoryParams = req.businessId ? [req.businessId] : [];
    const [inventoryResult] = await query(`
      SELECT COALESCE(SUM(stock_quantity * cost_price), 0) as value FROM medicines WHERE ${inventoryWhere}
    `, inventoryParams);
    const inventoryVal = parseFloat(getFirst(inventoryResult).value) || 0;

    // Assets - Cash from sales
    const [cashResult] = await query(`
      SELECT COALESCE(SUM(final_amount), 0) as value 
      FROM sales 
      WHERE ${salesWhere}
    `, dateParams);
    const cashVal = parseFloat(getFirst(cashResult).value) || 0;

    // Liabilities - Pending purchase orders
    const [purchaseResult] = await query(`
      SELECT COALESCE(SUM(total), 0) as value 
      FROM purchase_orders 
      WHERE ${purchaseWhere}
    `, dateParams);
    const purchasesVal = parseFloat(getFirst(purchaseResult).value) || 0;

    // Expenses
    const [expenseResult] = await query(`
      SELECT COALESCE(SUM(amount), 0) as value 
      FROM expenses 
      WHERE ${expenseWhere}
    `, dateParams);
    const expensesVal = parseFloat(getFirst(expenseResult).value) || 0;

    res.json({
      success: true,
      data: {
        asOfDate: date,
        assets: {
          inventory: inventoryVal,
          cash: cashVal,
          total: inventoryVal + cashVal
        },
        liabilities: {
          accountsPayable: purchasesVal,
          total: purchasesVal
        },
        expenses: expensesVal,
        equity: inventoryVal + cashVal - purchasesVal - expensesVal
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/income-statement - Get income statement
// FIXED: Use profit field from sales to match dashboard calculation
router.get('/income-statement', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    let salesWhere = 'DATE(created_at) BETWEEN $1 AND $2';
    let creditWhere = 'DATE(cp.created_at) BETWEEN $1 AND $2';
    let expenseWhere = "status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2";
    
    const params = [start, end];
    
    if (req.businessId) {
      salesWhere += ' AND business_id = $3';
      creditWhere += ' AND cs.business_id = $3';
      expenseWhere += ' AND business_id = $3';
      params.push(req.businessId);
    }

    // Revenue and Profit - Use the 'profit' field from sales table (same as dashboard)
    // Exclude CREDIT sales from totals until paid
    const [salesResult] = await query(`
      SELECT 
        COALESCE(SUM(CASE WHEN payment_method != 'CREDIT' THEN total_amount ELSE 0 END), 0) as gross_sales,
        COALESCE(SUM(CASE WHEN payment_method != 'CREDIT' THEN discount ELSE 0 END), 0) as discounts,
        COALESCE(SUM(CASE WHEN payment_method != 'CREDIT' THEN final_amount ELSE 0 END), 0) as net_sales,
        COALESCE(SUM(CASE WHEN payment_method != 'CREDIT' THEN profit ELSE 0 END), 0) as gross_profit,
        COALESCE(SUM(CASE WHEN payment_method = 'CREDIT' THEN final_amount ELSE 0 END), 0) as credit_sales
      FROM sales
      WHERE ${salesWhere}
    `, params);
    const salesData = getFirst(salesResult);

    // Add paid credit payments and their profit for the period
    const [paidCreditResult] = await query(`
      SELECT COALESCE(SUM(cp.amount), 0) as paid_credit
      FROM credit_payments cp
      JOIN credit_sales cs ON cp.credit_sale_id = cs.id
      WHERE ${creditWhere}
    `, params);
    const paidCredit = parseFloat(getFirst(paidCreditResult).paid_credit) || 0;

    // Operating expenses by category
    const [expenseBreakdown] = await query(`
      SELECT category, COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE ${expenseWhere}
      GROUP BY category
    `, params);

    const totalExpenses = expenseBreakdown.reduce((sum, e) => sum + parseFloat(e.total), 0);
    const netSales = (parseFloat(salesData.net_sales) || 0) + paidCredit;
    const grossProfit = parseFloat(salesData.gross_profit) || 0; // Use profit field from sales
    const netIncome = grossProfit - totalExpenses;
    
    // Calculate COGS from gross profit: COGS = Revenue - Gross Profit
    const cogsValue = netSales - grossProfit;

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        revenue: {
          grossSales: parseFloat(salesData.gross_sales) || 0,
          discounts: parseFloat(salesData.discounts) || 0,
          netSales
        },
        costOfGoodsSold: cogsValue,
        grossProfit,
        operatingExpenses: {
          breakdown: expenseBreakdown,
          total: totalExpenses
        },
        netIncome
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/inventory-value - Get inventory value
router.get('/inventory-value', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = '1=1';
    const params = [];
    
    if (req.businessId) {
      whereClause = 'business_id = $1';
      params.push(req.businessId);
    }

    const [totalsResult] = await query(`
      SELECT 
        COALESCE(SUM(stock_quantity * cost_price), 0) as cost_value,
        COALESCE(SUM(stock_quantity * unit_price), 0) as retail_value,
        COALESCE(SUM(stock_quantity), 0) as total_units
      FROM medicines
      WHERE ${whereClause}
    `, params);
    const totals = getFirst(totalsResult);

    const costValue = parseFloat(totals.cost_value) || 0;
    const retailValue = parseFloat(totals.retail_value) || 0;

    res.json({
      success: true,
      data: {
        costValue,
        retailValue,
        totalUnits: parseInt(totals.total_units) || 0,
        potentialProfit: retailValue - costValue
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/stock-breakdown - Get stock breakdown
router.get('/stock-breakdown', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = "category IS NOT NULL AND category != ''";
    const params = [];
    
    if (req.businessId) {
      whereClause += ' AND business_id = $1';
      params.push(req.businessId);
    }

    const [breakdown] = await query(`
      SELECT 
        category,
        COUNT(*) as medicine_count,
        COALESCE(SUM(stock_quantity), 0) as total_stock,
        COALESCE(SUM(stock_quantity * cost_price), 0) as cost_value,
        COALESCE(SUM(stock_quantity * unit_price), 0) as retail_value
      FROM medicines
      WHERE ${whereClause}
      GROUP BY category
      ORDER BY retail_value DESC
    `, params);

    res.json({ success: true, data: breakdown });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/inventory-breakdown - Get inventory breakdown
router.get('/inventory-breakdown', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    let whereClause = 'stock_quantity > 0';
    const params = [];
    
    if (req.businessId) {
      whereClause += ' AND business_id = $1';
      params.push(req.businessId);
    }

    const [breakdown] = await query(`
      SELECT 
        id, name, stock_quantity, cost_price, unit_price, batch_number, expiry_date,
        (stock_quantity * cost_price) as cost_value,
        (stock_quantity * unit_price) as retail_value,
        category
      FROM medicines
      WHERE ${whereClause}
      ORDER BY retail_value DESC
    `, params);

    res.json({ success: true, data: breakdown });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/medicine-values - Get medicine values
router.get('/medicine-values', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    let whereClause = '1=1';
    const params = [];
    
    if (req.businessId) {
      whereClause = 'business_id = $1';
      params.push(req.businessId);
    }

    const [medicines] = await query(`
      SELECT 
        id, name, stock_quantity, cost_price, unit_price, batch_number, expiry_date,
        (stock_quantity * cost_price) as cost_value,
        (stock_quantity * unit_price) as retail_value,
        (unit_price - cost_price) as profit_margin,
        category
      FROM medicines
      WHERE ${whereClause}
      ORDER BY name
    `, params);

    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/profit/monthly/:yearMonth - Get monthly profit report
router.get('/profit/monthly/:yearMonth', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [year, month] = req.params.yearMonth.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-31`;

    let salesWhere = 'DATE(created_at) BETWEEN $1 AND $2';
    let expenseWhere = "status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2";
    
    const params = [startDate, endDate];
    
    if (req.businessId) {
      salesWhere += ' AND business_id = $3';
      expenseWhere += ' AND business_id = $3';
      params.push(req.businessId);
    }

    const [salesResult] = await query(`
      SELECT 
        COALESCE(SUM(final_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as gross_profit
      FROM sales
      WHERE ${salesWhere}
    `, params);
    const salesData = getFirst(salesResult);

    const [expenseResult] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE ${expenseWhere}
    `, params);
    const expenseData = getFirst(expenseResult);

    const grossProfit = parseFloat(salesData.gross_profit) || 0;
    const totalExpenses = parseFloat(expenseData.total_expenses) || 0;

    res.json({
      success: true,
      data: {
        yearMonth: req.params.yearMonth,
        totalSales: parseFloat(salesData.total_sales) || 0,
        grossProfit,
        totalExpenses,
        netProfit: grossProfit - totalExpenses
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/profit/yearly/:year - Get yearly profit report
router.get('/profit/yearly/:year', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const year = req.params.year;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    let salesWhere = 'DATE(created_at) BETWEEN $1 AND $2';
    let expenseWhere = "status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2";
    
    const params = [startDate, endDate];
    
    if (req.businessId) {
      salesWhere += ' AND business_id = $3';
      expenseWhere += ' AND business_id = $3';
      params.push(req.businessId);
    }

    const [salesResult] = await query(`
      SELECT 
        COALESCE(SUM(final_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as gross_profit
      FROM sales
      WHERE ${salesWhere}
    `, params);
    const salesData = getFirst(salesResult);

    const [expenseResult] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE ${expenseWhere}
    `, params);
    const expenseData = getFirst(expenseResult);

    const grossProfit = parseFloat(salesData.gross_profit) || 0;
    const totalExpenses = parseFloat(expenseData.total_expenses) || 0;

    res.json({
      success: true,
      data: {
        year: parseInt(year),
        totalSales: parseFloat(salesData.total_sales) || 0,
        grossProfit,
        totalExpenses,
        netProfit: grossProfit - totalExpenses
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/cashier-sales - Get cashier sales report
router.get('/cashier-sales', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate, cashierId } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;
    
    if (req.businessId) {
      paramIndex++;
      whereClause += ` AND s.business_id = $${paramIndex}`;
      params.push(req.businessId);
    }
    
    if (startDate && endDate) {
      paramIndex++;
      whereClause += ` AND DATE(s.created_at) >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
      whereClause += ` AND DATE(s.created_at) <= $${paramIndex}`;
      params.push(endDate);
    }
    
    if (cashierId) {
      paramIndex++;
      whereClause += ` AND s.cashier_id = $${paramIndex}`;
      params.push(cashierId);
    }

    const [cashierSales] = await query(`
      SELECT 
        s.cashier_id,
        s.cashier_name,
        COUNT(*) as transaction_count,
        COALESCE(SUM(s.final_amount), 0) as total_sales,
        COALESCE(SUM(s.profit), 0) as total_profit,
        COALESCE(AVG(s.final_amount), 0) as average_sale
      FROM sales s
      WHERE ${whereClause}
      GROUP BY s.cashier_id, s.cashier_name
      ORDER BY total_sales DESC
    `, params);

    res.json({
      success: true,
      data: cashierSales
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/daily-summary - Get daily summary for date range
router.get('/daily-summary', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'Start and end dates are required' });
    }

    let salesWhere = 'DATE(created_at) BETWEEN $1 AND $2';
    let expenseWhere = "status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2";
    
    const params = [startDate, endDate];
    
    if (req.businessId) {
      salesWhere += ' AND business_id = $3';
      expenseWhere += ' AND business_id = $3';
      params.push(req.businessId);
    }

    const [dailySales] = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(final_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE ${salesWhere}
      GROUP BY DATE(created_at)
      ORDER BY date
    `, params);

    const [dailyExpenses] = await query(`
      SELECT 
        DATE(expense_date) as date,
        COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE ${expenseWhere}
      GROUP BY DATE(expense_date)
      ORDER BY date
    `, params);

    // Combine sales and expenses by date
    const expenseMap = new Map();
    dailyExpenses.forEach(e => {
      expenseMap.set(e.date?.toISOString?.().split('T')[0] || e.date, parseFloat(e.total_expenses) || 0);
    });

    const combined = dailySales.map(s => {
      const dateStr = s.date?.toISOString?.().split('T')[0] || s.date;
      const expenses = expenseMap.get(dateStr) || 0;
      return {
        date: dateStr,
        transactionCount: parseInt(s.transaction_count) || 0,
        totalSales: parseFloat(s.total_sales) || 0,
        totalProfit: parseFloat(s.total_profit) || 0,
        totalExpenses: expenses,
        netProfit: (parseFloat(s.total_profit) || 0) - expenses
      };
    });

    res.json({
      success: true,
      data: combined
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/sales-trend - Get sales trend for charts
router.get('/sales-trend', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    
    let daysBack = 30;
    switch (period) {
      case 'week': daysBack = 7; break;
      case 'month': daysBack = 30; break;
      case 'quarter': daysBack = 90; break;
      case 'year': daysBack = 365; break;
    }
    
    let whereClause = `DATE(created_at) >= CURRENT_DATE - INTERVAL '${daysBack} days'`;
    const params = [];
    
    if (req.businessId) {
      whereClause += ' AND business_id = $1';
      params.push(req.businessId);
    }

    const [salesTrend] = await query(`
      SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(final_amount), 0) as sales,
        COALESCE(SUM(final_amount - profit), 0) as cost,
        COALESCE(SUM(profit), 0) as profit
      FROM sales
      WHERE ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, params);

    // Format dates for frontend
    const formattedData = salesTrend.map(item => ({
      date: item.date?.toISOString?.().split('T')[0] || item.date,
      sales: parseFloat(item.sales) || 0,
      cost: parseFloat(item.cost) || 0,
      profit: parseFloat(item.profit) || 0
    }));

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/sales-by-category - Get sales by category
router.get('/sales-by-category', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 0;
    
    if (req.businessId) {
      paramIndex++;
      whereClause += ` AND s.business_id = $${paramIndex}`;
      params.push(req.businessId);
    }
    
    if (startDate && endDate) {
      paramIndex++;
      whereClause += ` AND DATE(s.created_at) >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
      whereClause += ` AND DATE(s.created_at) <= $${paramIndex}`;
      params.push(endDate);
    }

    const [categoryData] = await query(`
      SELECT 
        COALESCE(m.category, 'Uncategorized') as category,
        COUNT(DISTINCT s.id) as transaction_count,
        COALESCE(SUM(si.subtotal), 0) as total
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN medicines m ON si.medicine_id = m.id
      WHERE ${whereClause}
      GROUP BY m.category
      ORDER BY total DESC
      LIMIT 10
    `, params);

    res.json({
      success: true,
      data: categoryData.map(c => ({
        category: c.category || 'Other',
        count: parseInt(c.transaction_count) || 0,
        total: parseFloat(c.total) || 0
      }))
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/annual-summary - Get annual summary
router.get('/annual-summary', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    
    let salesWhere = 'DATE(created_at) BETWEEN $1 AND $2';
    let expenseWhere = "status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2";
    
    const params = [startDate, endDate];
    
    if (req.businessId) {
      salesWhere += ' AND business_id = $3';
      expenseWhere += ' AND business_id = $3';
      params.push(req.businessId);
    }

    // Total revenue and profit for the year
    const [yearTotals] = await query(`
      SELECT 
        COALESCE(SUM(final_amount), 0) as total_revenue,
        COALESCE(SUM(profit), 0) as total_profit,
        COUNT(*) as total_orders
      FROM sales
      WHERE ${salesWhere}
    `, params);
    const totals = getFirst(yearTotals);

    // Monthly breakdown
    const [monthlyData] = await query(`
      SELECT 
        TO_CHAR(created_at, 'Mon') as month,
        EXTRACT(MONTH FROM created_at) as month_num,
        COALESCE(SUM(final_amount), 0) as revenue,
        COALESCE(SUM(profit), 0) as profit,
        COUNT(*) as orders
      FROM sales
      WHERE ${salesWhere}
      GROUP BY TO_CHAR(created_at, 'Mon'), EXTRACT(MONTH FROM created_at)
      ORDER BY month_num
    `, params);

    res.json({
      success: true,
      data: {
        totalRevenue: parseFloat(totals.total_revenue) || 0,
        totalProfit: parseFloat(totals.total_profit) || 0,
        totalOrders: parseInt(totals.total_orders) || 0,
        sellerPayments: 0,
        monthlyData: monthlyData.map(m => ({
          month: m.month,
          revenue: parseFloat(m.revenue) || 0,
          profit: parseFloat(m.profit) || 0,
          orders: parseInt(m.orders) || 0
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/cash-flow - Get cash flow statement
router.get('/cash-flow', authenticate, requireBusinessContext, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'Start and end dates are required' });
    }
    
    let salesWhere = 'DATE(created_at) BETWEEN $1 AND $2';
    let expenseWhere = "status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2";
    let purchaseWhere = "status IN ('APPROVED', 'SUBMITTED') AND DATE(created_at) BETWEEN $1 AND $2";
    
    const params = [startDate, endDate];
    
    if (req.businessId) {
      salesWhere += ' AND business_id = $3';
      expenseWhere += ' AND business_id = $3';
      purchaseWhere += ' AND business_id = $3';
      params.push(req.businessId);
    }

    // Cash inflows from sales
    const [salesResult] = await query(`
      SELECT COALESCE(SUM(final_amount), 0) as value FROM sales WHERE ${salesWhere}
    `, params);
    const salesInflow = parseFloat(getFirst(salesResult).value) || 0;

    // Cash outflows from expenses
    const [expenseResult] = await query(`
      SELECT COALESCE(SUM(amount), 0) as value FROM expenses WHERE ${expenseWhere}
    `, params);
    const expenseOutflow = parseFloat(getFirst(expenseResult).value) || 0;

    // Cash outflows from purchases
    const [purchaseResult] = await query(`
      SELECT COALESCE(SUM(total), 0) as value FROM purchase_orders WHERE ${purchaseWhere}
    `, params);
    const purchaseOutflow = parseFloat(getFirst(purchaseResult).value) || 0;

    res.json({
      success: true,
      data: {
        period: { startDate, endDate },
        operatingActivities: {
          salesReceipts: salesInflow,
          expensePayments: expenseOutflow,
          netOperating: salesInflow - expenseOutflow
        },
        investingActivities: {
          inventoryPurchases: purchaseOutflow,
          netInvesting: -purchaseOutflow
        },
        netCashFlow: salesInflow - expenseOutflow - purchaseOutflow
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
