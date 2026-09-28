const express = require('express');
const router = express.Router();
const { pool, logAction } = require('../db');
const { requireAuth, requirePermission } = require('../middleware/authorize');

router.use(requireAuth);

router.get('/', requirePermission('sales:create'), async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY name');
    res.json(result.rows);
  } catch (e) { next(e); }
});

router.post('/', requirePermission('sales:create'), async (req, res, next) => {
  try {
    const { name, phone, email, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Customer name is required.' });
    const result = await pool.query(
      'INSERT INTO customers (name, phone, email, notes) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, phone || null, email || null, notes || null]
    );
    await logAction(req.user.id, 'customer_created', { customerId: result.rows[0].id });
    res.status(201).json(result.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', requirePermission('customers:manage'), async (req, res, next) => {
  try {
    const cRes = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    const customer = cRes.rows[0];
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const { name, phone, email, notes } = req.body || {};
    const result = await pool.query(
      'UPDATE customers SET name=$1, phone=$2, email=$3, notes=$4 WHERE id=$5 RETURNING *',
      [name ?? customer.name, phone ?? customer.phone, email ?? customer.email, notes ?? customer.notes, customer.id]
    );
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', requirePermission('customers:manage'), async (req, res, next) => {
  try {
    const cRes = await pool.query('SELECT id FROM customers WHERE id = $1', [req.params.id]);
    if (!cRes.rows[0]) return res.status(404).json({ error: 'Customer not found.' });

    const hasSales = await pool.query('SELECT 1 FROM sales WHERE customer_id = $1 LIMIT 1', [req.params.id]);
    if (hasSales.rows[0]) {
      return res.status(409).json({
        error: 'Cannot delete a customer that has sales records. Remove their sales first or leave the record.'
      });
    }

    await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    await logAction(req.user.id, 'customer_deleted', { customerId: req.params.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
