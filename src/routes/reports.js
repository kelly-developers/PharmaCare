const express = require('express');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper to safely get first result
const getFirst = (results) => results[0] || {};

// GET /api/reports/dashboard - Get dashboard summary
router.get('/dashboard', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    // Today's sales - FIXED: using final_amount instead of total
    const [salesResult] = await query(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(final_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    const salesData = getFirst(salesResult);

    // Stock summary
    const [stockResult] = await query(`
      SELECT 
        COUNT(*) as total_medicines,
        SUM(CASE WHEN stock_quantity <= reorder_level THEN 1 ELSE 0 END) as low_stock,
        SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) as out_of_stock,
        SUM(CASE WHEN expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 1 ELSE 0 END) as expiring_soon
      FROM medicines
    `);
    const stockData = getFirst(stockResult);

    // Pending prescriptions
    const [prescriptionResult] = await query(`
      SELECT COUNT(*) as pending FROM prescriptions WHERE status = 'PENDING'
    `);
    const prescriptionData = getFirst(prescriptionResult);

    // Pending expenses
    const [expenseResult] = await query(`
      SELECT COUNT(*) as pending FROM expenses WHERE status = 'PENDING'
    `);
    const expenseData = getFirst(expenseResult);

    // Stock value (selling price)
    const [stockValueResult] = await query(`
      SELECT COALESCE(SUM(stock_quantity * unit_price), 0) as stock_value
      FROM medicines
    `);
    const stockValue = parseFloat(getFirst(stockValueResult).stock_value) || 0;

    // Inventory value (cost price)
    const [inventoryValueResult] = await query(`
      SELECT COALESCE(SUM(stock_quantity * cost_price), 0) as inventory_value
      FROM medicines
    `);
    const inventoryValue = parseFloat(getFirst(inventoryValueResult).inventory_value) || 0;

    // Monthly profit data (current month and last month)
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    // Current month profit
    const [currentMonthProfitResult] = await query(`
      SELECT COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE EXTRACT(YEAR FROM created_at) = $1 
        AND EXTRACT(MONTH FROM created_at) = $2
    `, [currentYear, currentMonth]);
    const currentMonthProfit = parseFloat(getFirst(currentMonthProfitResult).total_profit) || 0;

    // Last month profit
    let lastMonth = currentMonth - 1;
    let lastYear = currentYear;
    if (lastMonth === 0) {
      lastMonth = 12;
      lastYear = currentYear - 1;
    }
    
    const [lastMonthProfitResult] = await query(`
      SELECT COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE EXTRACT(YEAR FROM created_at) = $1 
        AND EXTRACT(MONTH FROM created_at) = $2
    `, [lastYear, lastMonth]);
    const lastMonthProfit = parseFloat(getFirst(lastMonthProfitResult).total_profit) || 0;

    res.json({
      success: true,
      data: {
        // Today's metrics
        todaySales: parseFloat(salesData.total_sales) || 0,
        todayTransactions: parseInt(salesData.transaction_count) || 0,
        todayProfit: parseFloat(salesData.total_profit) || 0,
        
        // Monthly profit data
        thisMonthProfit: currentMonthProfit,
        lastMonthProfit: lastMonthProfit,
        
        // Inventory data
        inventoryValue: inventoryValue, // cost value
        stockValue: stockValue, // selling price value
        totalStockItems: parseInt(stockData.total_medicines) || 0,
        lowStockCount: parseInt(stockData.low_stock) || 0,
        outOfStockCount: parseInt(stockData.out_of_stock) || 0,
        expiringSoonCount: parseInt(stockData.expiring_soon) || 0,
        
        // Pending items
        pendingPrescriptions: parseInt(prescriptionData.pending) || 0,
        pendingExpenses: parseInt(expenseData.pending) || 0,
        
        // Additional data for compatibility
        todayExpenses: 0, // You can add this if you have daily expenses tracking
        pendingOrders: 0 // You can add this if you have purchase orders
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/sales-summary - Get sales summary
router.get('/sales-summary', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = 'WHERE DATE(created_at) BETWEEN $1 AND $2';
      params.push(startDate, endDate);
    }

    // FIXED: Using final_amount instead of total
    const [summaryResult] = await query(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(final_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(AVG(final_amount), 0) as average_sale
      FROM sales
      ${dateFilter}
    `, params);
    const summary = getFirst(summaryResult);

    // Top selling medicines
    const [topMedicines] = await query(`
      SELECT si.medicine_name as name, SUM(si.quantity) as total_sold, SUM(si.subtotal) as total_revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      ${dateFilter ? dateFilter.replace('created_at', 's.created_at') : ''}
      GROUP BY si.medicine_name
      ORDER BY total_sold DESC
      LIMIT 10
    `, params);

    // Sales by payment method
    const [paymentBreakdown] = await query(`
      SELECT payment_method, COUNT(*) as count, SUM(final_amount) as total
      FROM sales
      ${dateFilter}
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
router.get('/stock-summary', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    // Stock by category
    const [categoryBreakdown] = await query(`
      SELECT 
        category,
        COUNT(*) as medicine_count,
        COALESCE(SUM(stock_quantity), 0) as total_stock,
        COALESCE(SUM(stock_quantity * cost_price), 0) as total_cost_value,
        COALESCE(SUM(stock_quantity * unit_price), 0) as total_retail_value
      FROM medicines
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY total_retail_value DESC
    `);

    // Low stock items
    const [lowStock] = await query(`
      SELECT name, stock_quantity, reorder_level, category, batch_number, expiry_date
      FROM medicines
      WHERE stock_quantity <= reorder_level
      ORDER BY stock_quantity ASC
      LIMIT 20
    `);

    // Expiring soon
    const [expiring] = await query(`
      SELECT name, stock_quantity, expiry_date, category, batch_number
      FROM medicines
      WHERE expiry_date <= CURRENT_DATE + INTERVAL '90 days'
      ORDER BY expiry_date ASC
      LIMIT 20
    `);

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
router.get('/balance-sheet', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { asOfDate } = req.query;
    const date = asOfDate || new Date().toISOString().split('T')[0];

    // Assets - Inventory value
    const [inventoryResult] = await query(`
      SELECT COALESCE(SUM(stock_quantity * cost_price), 0) as value FROM medicines
    `);
    const inventoryVal = parseFloat(getFirst(inventoryResult).value) || 0;

    // Assets - Cash from sales
    const [cashResult] = await query(`
      SELECT COALESCE(SUM(final_amount), 0) as value 
      FROM sales 
      WHERE DATE(created_at) <= $1
    `, [date]);
    const cashVal = parseFloat(getFirst(cashResult).value) || 0;

    // Liabilities - Pending purchase orders
    const [purchaseResult] = await query(`
      SELECT COALESCE(SUM(total), 0) as value 
      FROM purchase_orders 
      WHERE status IN ('APPROVED', 'SUBMITTED') AND DATE(created_at) <= $1
    `, [date]);
    const purchasesVal = parseFloat(getFirst(purchaseResult).value) || 0;

    // Expenses - use expense_date column
    const [expenseResult] = await query(`
      SELECT COALESCE(SUM(amount), 0) as value 
      FROM expenses 
      WHERE status = 'APPROVED' AND DATE(expense_date) <= $1
    `, [date]);
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
router.get('/income-statement', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    // Revenue - FIXED: using subtotal for gross sales (from sale_items)
    const [revenueResult] = await query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as gross_sales,
        COALESCE(SUM(discount), 0) as discounts,
        COALESCE(SUM(final_amount), 0) as net_sales
      FROM sales
      WHERE DATE(created_at) BETWEEN $1 AND $2
    `, [start, end]);
    const revenue = getFirst(revenueResult);

    // Cost of goods sold - FIXED: need to calculate from sale_items
    const [cogsResult] = await query(`
      SELECT COALESCE(SUM(si.quantity * si.cost_price), 0) as value
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.created_at) BETWEEN $1 AND $2
    `, [start, end]);
    const cogsValue = parseFloat(getFirst(cogsResult).value) || 0;

    // Operating expenses by category
    const [expenseBreakdown] = await query(`
      SELECT category, COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2
      GROUP BY category
    `, [start, end]);

    const totalExpenses = expenseBreakdown.reduce((sum, e) => sum + parseFloat(e.total), 0);
    const netSales = parseFloat(revenue.net_sales) || 0;
    const grossProfit = netSales - cogsValue;
    const netIncome = grossProfit - totalExpenses;

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        revenue: {
          grossSales: parseFloat(revenue.gross_sales) || 0,
          discounts: parseFloat(revenue.discounts) || 0,
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
router.get('/inventory-value', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [totalsResult] = await query(`
      SELECT 
        COALESCE(SUM(stock_quantity * cost_price), 0) as cost_value,
        COALESCE(SUM(stock_quantity * unit_price), 0) as retail_value,
        COALESCE(SUM(stock_quantity), 0) as total_units
      FROM medicines
    `);
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
router.get('/stock-breakdown', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [breakdown] = await query(`
      SELECT 
        category,
        COUNT(*) as medicine_count,
        COALESCE(SUM(stock_quantity), 0) as total_stock,
        COALESCE(SUM(stock_quantity * cost_price), 0) as cost_value,
        COALESCE(SUM(stock_quantity * unit_price), 0) as retail_value
      FROM medicines
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY retail_value DESC
    `);

    res.json({ success: true, data: breakdown });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/inventory-breakdown - Get inventory breakdown
router.get('/inventory-breakdown', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [breakdown] = await query(`
      SELECT 
        id, name, stock_quantity, cost_price, unit_price, batch_number, expiry_date,
        (stock_quantity * cost_price) as cost_value,
        (stock_quantity * unit_price) as retail_value,
        category
      FROM medicines
      WHERE stock_quantity > 0
      ORDER BY retail_value DESC
    `);

    res.json({ success: true, data: breakdown });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/medicine-values - Get medicine values
router.get('/medicine-values', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const [medicines] = await query(`
      SELECT 
        id, name, stock_quantity, cost_price, unit_price, batch_number, expiry_date,
        (stock_quantity * cost_price) as cost_value,
        (stock_quantity * unit_price) as retail_value,
        (unit_price - cost_price) as profit_margin,
        category
      FROM medicines
      ORDER BY name
    `);

    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/profit/monthly/:yearMonth - Get monthly profit report
router.get('/profit/monthly/:yearMonth', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const [year, month] = req.params.yearMonth.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-31`;

    const [salesResult] = await query(`
      SELECT 
        COALESCE(SUM(final_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as gross_profit
      FROM sales
      WHERE DATE(created_at) BETWEEN $1 AND $2
    `, [startDate, endDate]);
    const salesData = getFirst(salesResult);

    const [expenseResult] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2
    `, [startDate, endDate]);
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

// GET /api/reports/profit/daily - Get daily profit
router.get('/profit/daily', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const [salesResult] = await query(`
      SELECT 
        COALESCE(SUM(final_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as gross_profit
      FROM sales
      WHERE DATE(created_at) = $1
    `, [targetDate]);
    const salesData = getFirst(salesResult);

    const [expenseResult] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE status = 'APPROVED' AND DATE(expense_date) = $1
    `, [targetDate]);
    const expenseData = getFirst(expenseResult);

    const grossProfit = parseFloat(salesData.gross_profit) || 0;
    const totalExpenses = parseFloat(expenseData.total_expenses) || 0;

    res.json({
      success: true,
      data: {
        date: targetDate,
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

// GET /api/reports/profit/range - Get profit for date range
router.get('/profit/range', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const [result] = await query(`
      SELECT COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE DATE(created_at) BETWEEN $1 AND $2
    `, [startDate, endDate]);

    res.json({ success: true, data: parseFloat(getFirst(result).total_profit) || 0 });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/profit/summary - Get profit summary
router.get('/profit/summary', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];

    const [dailyResult] = await query(`
      SELECT COALESCE(SUM(profit), 0) as value FROM sales WHERE DATE(created_at) = $1
    `, [today]);

    const [monthlyResult] = await query(`
      SELECT COALESCE(SUM(profit), 0) as value FROM sales WHERE DATE(created_at) >= $1
    `, [startOfMonth]);

    const [yearlyResult] = await query(`
      SELECT COALESCE(SUM(profit), 0) as value FROM sales WHERE DATE(created_at) >= $1
    `, [startOfYear]);

    res.json({
      success: true,
      data: {
        daily: parseFloat(getFirst(dailyResult).value) || 0,
        monthly: parseFloat(getFirst(monthlyResult).value) || 0,
        yearly: parseFloat(getFirst(yearlyResult).value) || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/annual-summary - Get annual summary
router.get('/annual-summary', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { year } = req.query;
    const targetYear = year || new Date().getFullYear();

    // Monthly breakdown
    const [monthlyBreakdown] = await query(`
      SELECT 
        EXTRACT(MONTH FROM created_at) as month,
        COALESCE(SUM(final_amount), 0) as revenue,
        COALESCE(SUM(profit), 0) as profit,
        COUNT(*) as transactions
      FROM sales
      WHERE EXTRACT(YEAR FROM created_at) = $1
      GROUP BY EXTRACT(MONTH FROM created_at)
      ORDER BY month
    `, [targetYear]);

    // Annual totals
    const [annualResult] = await query(`
      SELECT 
        COALESCE(SUM(final_amount), 0) as total_revenue,
        COALESCE(SUM(profit), 0) as total_profit,
        COUNT(*) as total_transactions
      FROM sales
      WHERE EXTRACT(YEAR FROM created_at) = $1
    `, [targetYear]);
    const annualTotals = getFirst(annualResult);

    // Annual expenses
    const [expenseResult] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE status = 'APPROVED' AND EXTRACT(YEAR FROM expense_date) = $1
    `, [targetYear]);

    res.json({
      success: true,
      data: {
        year: parseInt(targetYear),
        totalRevenue: parseFloat(annualTotals.total_revenue) || 0,
        totalProfit: parseFloat(annualTotals.total_profit) || 0,
        totalExpenses: parseFloat(getFirst(expenseResult).total) || 0,
        netProfit: (parseFloat(annualTotals.total_profit) || 0) - (parseFloat(getFirst(expenseResult).total) || 0),
        totalTransactions: parseInt(annualTotals.total_transactions) || 0,
        monthlyBreakdown: monthlyBreakdown.map(m => ({
          month: parseInt(m.month),
          revenue: parseFloat(m.revenue) || 0,
          profit: parseFloat(m.profit) || 0,
          transactions: parseInt(m.transactions) || 0
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/medicine-details - Get all medicine details including batch, expiry, etc.
router.get('/medicine-details', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST'), async (req, res, next) => {
  try {
    const [medicines] = await query(`
      SELECT 
        id, name, category, batch_number, expiry_date, 
        stock_quantity, cost_price, unit_price,
        (stock_quantity * cost_price) as stock_value,
        CASE 
          WHEN stock_quantity = 0 THEN 'Out of Stock'
          WHEN stock_quantity <= reorder_level THEN 'Low Stock'
          ELSE 'In Stock'
        END as status
      FROM medicines
      ORDER BY name
    `);

    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
});

module.exports = router;