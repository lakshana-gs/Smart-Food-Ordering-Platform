const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const router = express.Router();

// ==================== Get All Menu Items (Public with Filters) ====================
router.get('/', async (req, res) => {
  try {
    const { category, dietary, search, min_price, max_price, sort, available_only } = req.query;

    let query = 'SELECT * FROM menu WHERE 1=1';
    const params = [];

    if (category && category !== 'All') {
      query += ' AND LOWER(category) = LOWER(?)';
      params.push(category);
    }

    if (dietary && dietary !== 'All') {
      query += ' AND LOWER(dietary) = LOWER(?)';
      params.push(dietary);
    }

    if (search && search.trim()) {
      query += ' AND (LOWER(name) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?) OR LOWER(category) LIKE LOWER(?))';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (min_price && !isNaN(Number(min_price))) {
      query += ' AND price >= ?';
      params.push(Number(min_price));
    }

    if (max_price && !isNaN(Number(max_price))) {
      query += ' AND price <= ?';
      params.push(Number(max_price));
    }

    if (available_only === 'true' || available_only === '1') {
      query += ' AND is_available = 1';
    }

    // Sorting
    switch (sort) {
      case 'price_asc':
        query += ' ORDER BY price ASC';
        break;
      case 'price_desc':
        query += ' ORDER BY price DESC';
        break;
      case 'rating':
        query += ' ORDER BY rating DESC, rating_count DESC';
        break;
      case 'name_asc':
        query += ' ORDER BY name ASC';
        break;
      case 'popular':
      default:
        query += ' ORDER BY rating DESC, id ASC';
        break;
    }

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Menu Load Error:', error);
    res.status(500).json({ message: 'Server error while loading menu.' });
  }
});

// ==================== Get Menu Categories ====================
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT category, COUNT(*) as item_count 
       FROM menu 
       WHERE is_available = 1 
       GROUP BY category 
       ORDER BY item_count DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Categories Load Error:', error);
    res.status(500).json({ message: 'Server error while loading categories.' });
  }
});

// ==================== Get Single Menu Item ====================
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM menu WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Menu item not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Get Menu Item Error:', error);
    res.status(500).json({ message: 'Server error while fetching menu item.' });
  }
});

// ==================== Add New Item (Admin Only) ====================
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, price, emoji, category, dietary, description, prep_minutes, is_available } = req.body;

  if (!name || price === undefined || price === null) {
    return res.status(400).json({ message: 'Item name and price are required.' });
  }

  const numPrice = Number(price);
  if (isNaN(numPrice) || numPrice <= 0) {
    return res.status(400).json({ message: 'Price must be a valid positive number.' });
  }

  const cleanName = String(name).trim();
  const cleanEmoji = emoji ? String(emoji).trim() : '🍽️';
  const cleanCategory = category ? String(category).trim() : 'Other';
  const cleanDietary = dietary ? String(dietary).trim() : 'Veg';
  const cleanDesc = description ? String(description).trim() : null;
  const cleanPrep = prep_minutes && !isNaN(Number(prep_minutes)) ? Number(prep_minutes) : 20;
  const availableFlag = is_available !== undefined ? (is_available ? 1 : 0) : 1;

  try {
    const [result] = await db.query(
      `INSERT INTO menu (name, price, emoji, category, dietary, description, prep_minutes, is_available, rating, rating_count) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 4.5, 10)`,
      [cleanName, numPrice, cleanEmoji, cleanCategory, cleanDietary, cleanDesc, cleanPrep, availableFlag]
    );

    res.status(201).json({
      message: 'Menu item added successfully',
      item: {
        id: result.insertId,
        name: cleanName,
        price: numPrice,
        emoji: cleanEmoji,
        category: cleanCategory,
        dietary: cleanDietary,
        description: cleanDesc,
        prep_minutes: cleanPrep,
        is_available: availableFlag
      }
    });
  } catch (error) {
    console.error('Add Menu Error:', error);
    res.status(500).json({ message: 'Server error while adding menu item.' });
  }
});

// ==================== Update Item (Admin Only) ====================
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, price, emoji, category, dietary, description, prep_minutes, is_available } = req.body;

  if (!name || price === undefined || price === null) {
    return res.status(400).json({ message: 'Item name and price are required.' });
  }

  const numPrice = Number(price);
  if (isNaN(numPrice) || numPrice <= 0) {
    return res.status(400).json({ message: 'Price must be a valid positive number.' });
  }

  const cleanName = String(name).trim();
  const cleanEmoji = emoji ? String(emoji).trim() : '🍽️';
  const cleanCategory = category ? String(category).trim() : 'Other';
  const cleanDietary = dietary ? String(dietary).trim() : 'Veg';
  const cleanDesc = description !== undefined ? (description ? String(description).trim() : null) : null;
  const cleanPrep = prep_minutes && !isNaN(Number(prep_minutes)) ? Number(prep_minutes) : 20;
  const availableFlag = is_available !== undefined ? (is_available ? 1 : 0) : 1;

  try {
    const [result] = await db.query(
      `UPDATE menu 
       SET name = ?, price = ?, emoji = ?, category = ?, dietary = ?, description = ?, prep_minutes = ?, is_available = ?
       WHERE id = ?`,
      [cleanName, numPrice, cleanEmoji, cleanCategory, cleanDietary, cleanDesc, cleanPrep, availableFlag, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Menu item not found.' });
    }

    res.json({ message: 'Menu item updated successfully.' });
  } catch (error) {
    console.error('Update Menu Error:', error);
    res.status(500).json({ message: 'Server error while updating menu item.' });
  }
});

// ==================== Toggle Availability (Admin Only) ====================
router.patch('/:id/availability', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { is_available } = req.body;

  try {
    const [result] = await db.query(
      'UPDATE menu SET is_available = ? WHERE id = ?',
      [is_available ? 1 : 0, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Menu item not found.' });
    }

    res.json({ message: `Item availability updated to ${is_available ? 'available' : 'unavailable'}.` });
  } catch (error) {
    console.error('Toggle Availability Error:', error);
    res.status(500).json({ message: 'Server error updating availability.' });
  }
});

// ==================== Delete Item (Admin Only) ====================
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Check if this item is used in any orders
    const [ordersCount] = await db.query(
      'SELECT COUNT(*) as cnt FROM order_items WHERE menu_id = ?',
      [id]
    );

    if (ordersCount[0].cnt > 0) {
      // Rather than breaking past orders or foreign key constraints, safely mark as unavailable (soft-delete)
      await db.query('UPDATE menu SET is_available = 0 WHERE id = ?', [id]);
      return res.json({ 
        message: 'Item has been ordered in past orders, so it was marked as unavailable instead of deleting history.' 
      });
    }

    const [result] = await db.query('DELETE FROM menu WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Menu item not found.' });
    }

    res.json({ message: 'Menu item deleted successfully.' });
  } catch (error) {
    console.error('Delete Menu Error:', error);
    res.status(500).json({ message: 'Error deleting item.' });
  }
});

module.exports = router;