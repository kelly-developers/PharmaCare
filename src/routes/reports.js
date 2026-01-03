const express = require('express');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/reports/dashboard - Get dashboard summary
router.get('/dashboard', authenticate, authorize('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'), async (req, res, next) => {
  try {
    // Today's sales
    const [[salesData]] = await query(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    // Stock summary
    const [[stockData]] = await query(`
      SELECT 
        COUNT(*) as total_medicines,
        SUM(CASE WHEN stock_quantity <= reorder_level THEN 1 ELSE 0 END) as low_stock,
        SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) as out_of_stock,
        SUM(CASE WHEN expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 1 ELSE 0 END) as expiring_soon
      FROM medicines
    `);

    // Pending prescriptions
    const [[prescriptionData]] = await query(`
      SELECT COUNT(*) as pending FROM prescriptions WHERE status = 'PENDING'
    `);

    // Pending expenses
    const [[expenseData]] = await query(`
      SELECT COUNT(*) as pending FROM expenses WHERE status = 'PENDING'
    `);

    res.json({
      success: true,
      data: {
        todaySales: parseFloat(salesData.total_sales),
        todayTransactions: parseInt(salesData.transaction_count),
        todayProfit: parseFloat(salesData.total_profit),
        totalMedicines: parseInt(stockData.total_medicines),
        lowStockItems: parseInt(stockData.low_stock || 0),
        outOfStockItems: parseInt(stockData.out_of_stock || 0),
        expiringSoon: parseInt(stockData.expiring_soon || 0),
        pendingPrescriptions: parseInt(prescriptionData.pending),
        pendingExpenses: parseInt(expenseData.pending)
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

    const [[summary]] = await query(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(AVG(total_amount), 0) as average_sale
      FROM sales
      ${dateFilter}
    `, params);

    // Top selling medicines
    const topMedicinesQuery = `
      SELECT m.name, SUM(si.quantity) as total_sold, SUM(si.subtotal) as total_revenue
      FROM sale_items si
      JOIN medicines m ON si.medicine_id = m.id
      JOIN sales s ON si.sale_id = s.id
      ${dateFilter ? dateFilter.replace('created_at', 's.created_at') : ''}
      GROUP BY m.id, m.name
      ORDER BY total_sold DESC
      LIMIT 10
    `;
    const [topMedicines] = await query(topMedicinesQuery, params);

    // Sales by payment method
    const [paymentBreakdown] = await query(`
      SELECT payment_method, COUNT(*) as count, SUM(total_amount) as total
      FROM sales
      ${dateFilter}
      GROUP BY payment_method
    `, params);

    res.json({
      success: true,
      data: {
        summary: {
          total_transactions: parseInt(summary.total_transactions),
          total_sales: parseFloat(summary.total_sales),
          total_profit: parseFloat(summary.total_profit),
          average_sale: parseFloat(summary.average_sale)
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
        c.name as category,
        COUNT(m.id) as medicine_count,
        COALESCE(SUM(m.stock_quantity), 0) as total_stock,
        COALESCE(SUM(m.stock_quantity * m.cost_price), 0) as total_cost_value,
        COALESCE(SUM(m.stock_quantity * m.unit_price), 0) as total_retail_value
      FROM categories c
      LEFT JOIN medicines m ON m.category_id = c.id
      GROUP BY c.id, c.name
      ORDER BY total_retail_value DESC
    `);

    // Low stock items
    const [lowStock] = await query(`
      SELECT m.name, m.stock_quantity, m.reorder_level, c.name as category
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE m.stock_quantity <= m.reorder_level
      ORDER BY m.stock_quantity ASC
      LIMIT 20
    `);

    // Expiring soon
    const [expiring] = await query(`
      SELECT m.name, m.stock_quantity, m.expiry_date, c.name as category
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE m.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
      ORDER BY m.expiry_date ASC
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
    const [[inventoryValue]] = await query(`
      SELECT COALESCE(SUM(stock_quantity * cost_price), 0) as value FROM medicines
    `);

    // Assets - Cash from sales (simplified)
    const [[cashFromSales]] = await query(`
      SELECT COALESCE(SUM(total_amount), 0) as value 
      FROM sales 
      WHERE DATE(created_at) <= $1
    `, [date]);

    // Liabilities - Pending purchase orders
    const [[pendingPurchases]] = await query(`
      SELECT COALESCE(SUM(total_amount), 0) as value 
      FROM purchase_orders 
      WHERE status IN ('APPROVED', 'SUBMITTED') AND DATE(created_at) <= $1
    `, [date]);

    // Expenses
    const [[totalExpenses]] = await query(`
      SELECT COALESCE(SUM(amount), 0) as value 
      FROM expenses 
      WHERE status = 'APPROVED' AND DATE(expense_date) <= $1
    `, [date]);

    const inventoryVal = parseFloat(inventoryValue.value);
    const cashVal = parseFloat(cashFromSales.value);
    const purchasesVal = parseFloat(pendingPurchases.value);
    const expensesVal = parseFloat(totalExpenses.value);

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

    // Revenue
    const [[revenue]] = await query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as gross_sales,
        COALESCE(SUM(discount), 0) as discounts,
        COALESCE(SUM(total_amount - discount), 0) as net_sales
      FROM sales
      WHERE DATE(created_at) BETWEEN $1 AND $2
    `, [start, end]);

    // Cost of goods sold
    const [[cogs]] = await query(`
      SELECT COALESCE(SUM(si.quantity * m.cost_price), 0) as value
      FROM sale_items si
      JOIN medicines m ON si.medicine_id = m.id
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.created_at) BETWEEN $1 AND $2
    `, [start, end]);

    // Operating expenses by category
    const [expenseBreakdown] = await query(`
      SELECT category, COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2
      GROUP BY category
    `, [start, end]);

    const totalExpenses = expenseBreakdown.reduce((sum, e) => sum + parseFloat(e.total), 0);
    const netSales = parseFloat(revenue.net_sales);
    const cogsValue = parseFloat(cogs.value);
    const grossProfit = netSales - cogsValue;
    const netIncome = grossProfit - totalExpenses;

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        revenue: {
          grossSales: parseFloat(revenue.gross_sales),
          discounts: parseFloat(revenue.discounts),
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
    const [[totals]] = await query(`
      SELECT 
        COALESCE(SUM(stock_quantity * cost_price), 0) as cost_value,
        COALESCE(SUM(stock_quantity * unit_price), 0) as retail_value,
        COALESCE(SUM(stock_quantity), 0) as total_units
      FROM medicines
    `);

    const costValue = parseFloat(totals.cost_value);
    const retailValue = parseFloat(totals.retail_value);

    res.json({
      success: true,
      data: {
        costValue,
        retailValue,
        totalUnits: parseInt(totals.total_units),
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
        c.name as category,
        COUNT(m.id) as medicine_count,
        COALESCE(SUM(m.stock_quantity), 0) as total_stock,
        COALESCE(SUM(m.stock_quantity * m.cost_price), 0) as cost_value,
        COALESCE(SUM(m.stock_quantity * m.unit_price), 0) as retail_value
      FROM categories c
      LEFT JOIN medicines m ON m.category_id = c.id
      GROUP BY c.id, c.name
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
        m.id, m.name, m.stock_quantity, m.cost_price, m.unit_price,
        (m.stock_quantity * m.cost_price) as cost_value,
        (m.stock_quantity * m.unit_price) as retail_value,
        c.name as category
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE m.stock_quantity > 0
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
        m.id, m.name, m.stock_quantity, m.cost_price, m.unit_price,
        (m.stock_quantity * m.cost_price) as cost_value,
        (m.stock_quantity * m.unit_price) as retail_value,
        (m.unit_price - m.cost_price) as profit_margin,
        c.name as category
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
      ORDER BY m.name
    `);

    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
});

// Profit report endpoints
// GET /api/reports/profit/monthly/:yearMonth - Get monthly profit report
router.get('/profit/monthly/:yearMonth', async (req, res, next) => {
  try {
    const [year, month] = req.params.yearMonth.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-31`;

    const [[salesData]] = await query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as gross_profit
      FROM sales
      WHERE DATE(created_at) BETWEEN $1 AND $2
    `, [startDate, endDate]);

    const [[expenseData]] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE status = 'APPROVED' AND DATE(expense_date) BETWEEN $1 AND $2
    `, [startDate, endDate]);

    const grossProfit = parseFloat(salesData.gross_profit);
    const totalExpenses = parseFloat(expenseData.total_expenses);

    res.json({
      success: true,
      data: {
        yearMonth: req.params.yearMonth,
        totalSales: parseFloat(salesData.total_sales),
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
router.get('/profit/daily', async (req, res, next) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const [[salesData]] = await query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(profit), 0) as gross_profit
      FROM sales
      WHERE DATE(created_at) = $1
    `, [targetDate]);

    const [[expenseData]] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE status = 'APPROVED' AND DATE(expense_date) = $1
    `, [targetDate]);

    const grossProfit = parseFloat(salesData.gross_profit);
    const totalExpenses = parseFloat(expenseData.total_expenses);

    res.json({
      success: true,
      data: {
        date: targetDate,
        totalSales: parseFloat(salesData.total_sales),
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
router.get('/profit/range', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const [[result]] = await query(`
      SELECT COALESCE(SUM(profit), 0) as total_profit
      FROM sales
      WHERE DATE(created_at) BETWEEN $1 AND $2
    `, [startDate, endDate]);

    res.json({ success: true, data: parseFloat(result.total_profit) });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/profit/summary - Get profit summary
router.get('/profit/summary', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];

    const [[dailyProfit]] = await query(`
      SELECT COALESCE(SUM(profit), 0) as value FROM sales WHERE DATE(created_at) = $1
    `, [today]);

    const [[monthlyProfit]] = await query(`
      SELECT COALESCE(SUM(profit), 0) as value FROM sales WHERE DATE(created_at) >= $1
    `, [startOfMonth]);

    const [[yearlyProfit]] = await query(`
      SELECT COALESCE(SUM(profit), 0) as value FROM sales WHERE DATE(created_at) >= $1
    `, [startOfYear]);

    res.json({
      success: true,
      data: {
        daily: parseFloat(dailyProfit.value),
        monthly: parseFloat(monthlyProfit.value),
        yearly: parseFloat(yearlyProfit.value)
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
