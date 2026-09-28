const express = require('express');
const router = express.Router();
const { pool, logAction } = require('../db');
const { requireAuth, requirePermission } = require('../middleware/authorize');

router.use(requireAuth, requirePermission('expenses:manage'));

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.name as created_by_name FROM expenses e
       JOIN users u ON u.id = e.created_by ORDER BY e.created_at DESC LIMIT 500`
    );
    res.json(result.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { description, amount, category } = req.body || {};
    if (!description || amount === undefined) {
      return res.status(400).json({ error: 'Description and amount are required.' });
    }
    const result = await pool.query(
      'INSERT INTO expenses (description, amount, category, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [description, Number(amount), category || null, req.user.id]
    );
    await logAction(req.user.id, 'expense_created', { expenseId: result.rows[0].id });
    res.status(201).json(result.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const eRes = await pool.query('SELECT id FROM expenses WHERE id = $1', [req.params.id]);
    if (!eRes.rows[0]) return res.status(404).json({ error: 'Expense not found.' });
    await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    await logAction(req.user.id, 'expense_deleted', { expenseId: req.params.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
