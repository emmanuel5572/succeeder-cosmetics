const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool, logAction } = require('../db');
const { requireAuth, requirePermission } = require('../middleware/authorize');

router.use(requireAuth);

function generateReceiptNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `RCPT-${stamp}-${rand}`;
}

router.post('/', requirePermission('sales:create'), async (req, res, next) => {
  const { items, payment_method, customer_id } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one product line is required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let subtotal = 0;
    const lines = [];

    for (const line of items) {
      const pRes = await client.query(
        'SELECT * FROM products WHERE id = $1 AND active = 1', [line.product_id]
      );
      const product = pRes.rows[0];
      if (!product) throw new Error(`Product ${line.product_id} not found.`);
      const qty = Number(line.quantity);
      if (!qty || qty <= 0) throw new Error(`Invalid quantity for ${product.name}.`);
      if (product.stock_qty < qty) throw new Error(`Not enough stock for ${product.name} (have ${product.stock_qty}).`);

      const lineSubtotal = product.price * qty;
      subtotal += lineSubtotal;
      lines.push({ product, qty, unit_price: product.price, lineSubtotal });
    }

    const total = subtotal;
    const receipt_number = generateReceiptNumber();

    const saleRes = await client.query(
      `INSERT INTO sales (receipt_number, cashier_id, customer_id, subtotal, total, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [receipt_number, req.user.id, customer_id || null, subtotal, total, payment_method || 'cash']
    );
    const sale = saleRes.rows[0];

    for (const l of lines) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sale.id, l.product.id, l.product.name, l.qty, l.unit_price, l.lineSubtotal]
      );
      await client.query(
        'UPDATE products SET stock_qty = stock_qty - $1 WHERE id = $2',
        [l.qty, l.product.id]
      );
    }

    await client.query('COMMIT');

    await logAction(req.user.id, 'sale_created', { saleId: sale.id });
    const saleItems = await pool.query('SELECT * FROM sale_items WHERE sale_id = $1', [sale.id]);
    res.status(201).json({ ...sale, items: saleItems.rows });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.message.includes('Not enough stock') || e.message.includes('not found') || e.message.includes('Invalid quantity')) {
      return res.status(400).json({ error: e.message });
    }
    next(e);
  } finally {
    client.release();
  }
});

router.get('/', requirePermission('sales:view_own'), async (req, res, next) => {
  try {
    const canViewAll = req.user.role === 'owner' || req.userPermissions.includes('sales:view_all');
    const { from, to, cashier_id } = req.query;

    let query = 'SELECT s.*, u.name as cashier_name FROM sales s JOIN users u ON u.id = s.cashier_id WHERE 1=1';
    const params = [];

    if (!canViewAll) {
      params.push(req.user.id);
      query += ` AND s.cashier_id = $${params.length}`;
    } else if (cashier_id) {
      params.push(cashier_id);
      query += ` AND s.cashier_id = $${params.length}`;
    }
    if (from) { params.push(from); query += ` AND s.created_at >= $${params.length}`; }
    if (to)   { params.push(to + 'T23:59:59.999Z'); query += ` AND s.created_at < $${params.length}`; }
    query += ' ORDER BY s.created_at DESC LIMIT 500';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) { next(e); }
});

router.get('/:id', requirePermission('sales:view_own'), async (req, res, next) => {
  try {
    const sRes = await pool.query(
      'SELECT s.*, u.name as cashier_name FROM sales s JOIN users u ON u.id = s.cashier_id WHERE s.id = $1',
      [req.params.id]
    );
    const sale = sRes.rows[0];
    if (!sale) return res.status(404).json({ error: 'Sale not found.' });

    const canViewAll = req.user.role === 'owner' || req.userPermissions.includes('sales:view_all');
    if (!canViewAll && sale.cashier_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only view your own sales.' });
    }

    const items = await pool.query('SELECT * FROM sale_items WHERE sale_id = $1', [sale.id]);
    res.json({ ...sale, items: items.rows });
  } catch (e) { next(e); }
});

module.exports = router;
