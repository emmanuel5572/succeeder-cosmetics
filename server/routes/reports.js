const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireAuth, requirePermission } = require('../middleware/authorize');

router.use(requireAuth, requirePermission('reports:view'));

function rangeStart(range) {
  const now = new Date();
  if (range === 'week') {
    now.setUTCDate(now.getUTCDate() - 7);
    now.setUTCHours(0, 0, 0, 0);
  } else if (range === 'month') {
    now.setUTCDate(now.getUTCDate() - 30);
    now.setUTCHours(0, 0, 0, 0);
  } else {
    now.setUTCHours(0, 0, 0, 0);
  }
  return now.toISOString();
}

router.get('/summary', async (req, res, next) => {
  try {
    const range = req.query.range || 'today';
    const since = rangeStart(range);

    const totals = await pool.query(
      `SELECT COUNT(*) as transactions, COALESCE(SUM(total),0) as revenue
       FROM sales WHERE created_at >= $1`, [since]
    );

    const cogsRow = await pool.query(
      `SELECT COALESCE(SUM(si.quantity * p.cost), 0) as cogs
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE s.created_at >= $1`, [since]
    );

    const byCashier = await pool.query(
      `SELECT u.name as cashier, COUNT(*) as transactions, COALESCE(SUM(s.total),0) as revenue
       FROM sales s JOIN users u ON u.id = s.cashier_id
       WHERE s.created_at >= $1 GROUP BY s.cashier_id, u.name ORDER BY revenue DESC`, [since]
    );

    const topProducts = await pool.query(
      `SELECT si.product_name, SUM(si.quantity) as qty_sold, SUM(si.subtotal) as revenue
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.created_at >= $1 GROUP BY si.product_id, si.product_name ORDER BY qty_sold DESC LIMIT 10`, [since]
    );

    const expenses = await pool.query(
      `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE created_at >= $1`, [since]
    );

    const lowStock = await pool.query(
      `SELECT id, name, stock_qty, low_stock_threshold FROM products
       WHERE active = 1 AND stock_qty <= low_stock_threshold ORDER BY stock_qty ASC`
    );

    const revenue = parseFloat(totals.rows[0].revenue);
    const cogs = parseFloat(cogsRow.rows[0].cogs);
    const expensesTotal = parseFloat(expenses.rows[0].total);

    res.json({
      range,
      revenue,
      transactions: parseInt(totals.rows[0].transactions, 10),
      expenses: expensesTotal,
      cogs,
      grossProfit: revenue - cogs,
      netProfit: revenue - cogs - expensesTotal,
      byCashier: byCashier.rows,
      topProducts: topProducts.rows,
      lowStock: lowStock.rows
    });
  } catch (e) { next(e); }
});

module.exports = router;
