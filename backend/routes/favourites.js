const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/authMiddleware');

// Get all favourite items for the logged-in user
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const [rows] = await db.query(
      `SELECT m.*, f.created_at AS favourited_at
       FROM favourites f
       JOIN menu m ON f.menu_id = m.id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching favourites:', error);
    res.status(500).json({ message: 'Server error loading favourites.' });
  }
});

// Get array of favourited menu IDs for quick lookup
router.get('/ids', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const [rows] = await db.query('SELECT menu_id FROM favourites WHERE user_id = ?', [userId]);
    const ids = rows.map(r => r.menu_id);
    res.json(ids);
  } catch (error) {
    console.error('Error fetching favourite IDs:', error);
    res.status(500).json({ message: 'Server error loading favourite IDs.' });
  }
});

// Add to favourites
router.post('/:menuId', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const menuId = Number(req.params.menuId);

  try {
    // Verify menu item exists
    const [item] = await db.query('SELECT name FROM menu WHERE id = ?', [menuId]);
    if (item.length === 0) {
      return res.status(404).json({ message: 'Menu item not found.' });
    }

    await db.query(
      'INSERT IGNORE INTO favourites (user_id, menu_id) VALUES (?, ?)',
      [userId, menuId]
    );

    res.json({ message: `"${item[0].name}" added to your favourites.`, menuId });
  } catch (error) {
    console.error('Error adding favourite:', error);
    res.status(500).json({ message: 'Server error saving favourite.' });
  }
});

// Remove from favourites
router.delete('/:menuId', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const menuId = Number(req.params.menuId);

  try {
    await db.query(
      'DELETE FROM favourites WHERE user_id = ? AND menu_id = ?',
      [userId, menuId]
    );
    res.json({ message: 'Item removed from your favourites.', menuId });
  } catch (error) {
    console.error('Error removing favourite:', error);
    res.status(500).json({ message: 'Server error removing favourite.' });
  }
});

module.exports = router;
