const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

// Get active public promotions
router.get('/active', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT code, discount_percent, discount_amount, min_order, max_discount, description, expiry_date
       FROM coupons
       WHERE is_active = 1 AND (expiry_date IS NULL OR expiry_date >= CURDATE())
       ORDER BY min_order ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching active coupons:', error);
    res.status(500).json({ message: 'Server error loading coupons.' });
  }
});

// Validate coupon with subtotal
router.post('/validate', async (req, res) => {
  const { code, subtotal } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ valid: false, message: 'Coupon code is required.' });
  }

  const cleanCode = code.trim().toUpperCase();
  const numSubtotal = parseFloat(subtotal) || 0;

  try {
    const [rows] = await db.query(
      'SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND (expiry_date IS NULL OR expiry_date >= CURDATE())',
      [cleanCode]
    );

    if (rows.length === 0) {
      return res.status(400).json({ valid: false, message: `Invalid or expired coupon "${cleanCode}".` });
    }

    const coupon = rows[0];
    const minOrder = parseFloat(coupon.min_order);

    if (numSubtotal < minOrder) {
      return res.status(400).json({
        valid: false,
        message: `Coupon "${cleanCode}" requires a minimum order of Rs. ${minOrder.toFixed(2)}. Add Rs. ${(minOrder - numSubtotal).toFixed(2)} more to use this code.`
      });
    }

    let discount = 0;
    if (coupon.discount_percent > 0) {
      discount = (numSubtotal * coupon.discount_percent) / 100;
      if (coupon.max_discount && discount > parseFloat(coupon.max_discount)) {
        discount = parseFloat(coupon.max_discount);
      }
    } else if (parseFloat(coupon.discount_amount) > 0) {
      discount = parseFloat(coupon.discount_amount);
    }

    discount = Math.min(discount, numSubtotal);
    discount = parseFloat(discount.toFixed(2));

    res.json({
      valid: true,
      message: `Coupon applied: Rs. ${discount.toFixed(2)} discount!`,
      code: cleanCode,
      discount,
      description: coupon.description
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({ valid: false, message: 'Server error validating coupon.' });
  }
});

// Admin: list all coupons
router.get('/admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching admin coupons:', error);
    res.status(500).json({ message: 'Server error loading coupons.' });
  }
});

// Admin: create coupon
router.post('/admin', requireAuth, requireAdmin, async (req, res) => {
  const { code, discount_percent, discount_amount, min_order, max_discount, expiry_date, description } = req.body;

  if (!code) {
    return res.status(400).json({ message: 'Coupon code is required.' });
  }

  const cleanCode = String(code).trim().toUpperCase();

  try {
    const [existing] = await db.query('SELECT code FROM coupons WHERE code = ?', [cleanCode]);
    if (existing.length > 0) {
      return res.status(409).json({ message: `Coupon "${cleanCode}" already exists.` });
    }

    await db.query(
      `INSERT INTO coupons (code, discount_percent, discount_amount, min_order, max_discount, expiry_date, description, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        cleanCode,
        parseInt(discount_percent, 10) || 0,
        parseFloat(discount_amount) || 0.00,
        parseFloat(min_order) || 0.00,
        max_discount ? parseFloat(max_discount) : null,
        expiry_date || null,
        description ? String(description).trim() : null
      ]
    );

    res.status(201).json({ message: `Coupon "${cleanCode}" created successfully.` });
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({ message: 'Server error creating coupon.' });
  }
});

// Admin: toggle coupon status
router.patch('/admin/:code/toggle', requireAuth, requireAdmin, async (req, res) => {
  const { code } = req.params;
  const { is_active } = req.body;

  try {
    const [result] = await db.query(
      'UPDATE coupons SET is_active = ? WHERE code = ?',
      [is_active ? 1 : 0, code]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Coupon not found.' });
    }

    res.json({ message: `Coupon "${code}" ${is_active ? 'activated' : 'deactivated'}.` });
  } catch (error) {
    console.error('Error toggling coupon:', error);
    res.status(500).json({ message: 'Server error updating coupon.' });
  }
});

// Admin: delete coupon
router.delete('/admin/:code', requireAuth, requireAdmin, async (req, res) => {
  const { code } = req.params;
  try {
    const [result] = await db.query('DELETE FROM coupons WHERE code = ?', [code]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Coupon not found.' });
    }
    res.json({ message: `Coupon "${code}" deleted successfully.` });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ message: 'Server error deleting coupon.' });
  }
});

module.exports = router;
