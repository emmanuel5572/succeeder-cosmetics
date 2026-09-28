const express = require('express');
const router = express.Router();
const { pool, logAction } = require('../db');
const { requireAuth, requirePermission } = require('../middleware/authorize');

router.use(requireAuth);

router.get('/', requirePermission('products:view'), async (req, res, next) => {
  try {
    const showInactive = req.query.all === '1';
    const result = showInactive
      ? await pool.query('SELECT * FROM products ORDER BY name')
      : await pool.query('SELECT * FROM products WHERE active = 1 ORDER BY name');
    res.json(result.rows);
  } catch (e) { next(e); }
});

router.get('/low-stock', requirePermission('products:view'), async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE active = 1 AND stock_qty <= low_stock_threshold ORDER BY stock_qty ASC'
    );
    res.json(result.rows);
  } catch (e) { next(e); }
});

router.post('/', requirePermission('products:manage'), async (req, res, next) => {
  try {
    const { name, sku, category, price, cost, stock_qty, low_stock_threshold } = req.body || {};
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Name and price are required.' });
    }
    const result = await pool.query(
      `INSERT INTO products (name, sku, category, price, cost, stock_qty, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        name, sku || null, category || null,
        Number(price), Number(cost) || 0,
        Number(stock_qty) || 0, Number(low_stock_threshold) || 5
      ]
    );
    await logAction(req.user.id, 'product_created', { productId: result.rows[0].id });
    res.status(201).json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'SKU already in use.' });
    next(e);
  }
});

router.put('/:id', requirePermission('products:manage'), async (req, res, next) => {
  try {
    const pRes = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const product = pRes.rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const { name, sku, category, price, cost, stock_qty, low_stock_threshold, active } = req.body || {};
    const result = await pool.query(
      `UPDATE products SET name=$1, sku=$2, category=$3, price=$4, cost=$5,
       stock_qty=$6, low_stock_threshold=$7, active=$8, updated_at=NOW() WHERE id=$9 RETURNING *`,
      [
        name ?? product.name,
        sku ?? product.sku,
        category ?? product.category,
        price !== undefined ? Number(price) : product.price,
        cost !== undefined ? Number(cost) : product.cost,
        stock_qty !== undefined ? Number(stock_qty) : product.stock_qty,
        low_stock_threshold !== undefined ? Number(low_stock_threshold) : product.low_stock_threshold,
        active !== undefined ? (active ? 1 : 0) : product.active,
        product.id
      ]
    );
    await logAction(req.user.id, 'product_updated', { productId: product.id });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', requirePermission('products:manage'), async (req, res, next) => {
  try {
    const pRes = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!pRes.rows[0]) return res.status(404).json({ error: 'Product not found.' });
    await pool.query('UPDATE products SET active = 0 WHERE id = $1', [req.params.id]);
    await logAction(req.user.id, 'product_deactivated', { productId: req.params.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
