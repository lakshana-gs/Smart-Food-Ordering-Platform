const express = require('express');
const router = express.Router();
const db = require('../db');
const { optionalAuth, requireAuth } = require('../middleware/authMiddleware');

// ==================== 1. Most Popular Foods (Real order-item counts) ====================
router.get('/popular', async (req, res) => {
  const { limit = 6, dietary } = req.query;
  const numLimit = Math.min(Math.max(1, parseInt(limit, 10) || 6), 20);

  try {
    let query = `
      SELECT m.*, 
             COALESCE(SUM(oi.quantity), 0) AS total_ordered
      FROM menu m
      LEFT JOIN order_items oi ON m.id = oi.menu_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status != 'Cancelled'
      WHERE m.is_available = 1
    `;
    const params = [];

    if (dietary && dietary !== 'All') {
      query += ' AND LOWER(m.dietary) = LOWER(?)';
      params.push(dietary);
    }

    query += `
      GROUP BY m.id
      ORDER BY total_ordered DESC, m.rating DESC
      LIMIT ?
    `;
    params.push(numLimit);

    const [rows] = await db.query(query, params);

    const items = rows.map(r => ({
      ...r,
      total_ordered: parseInt(r.total_ordered, 10),
      recommendationReason: r.total_ordered > 0 ? `Ordered ${r.total_ordered} times by foodies` : 'Top rated favourite'
    }));

    res.json(items);
  } catch (error) {
    console.error('Error fetching popular recommendations:', error);
    res.status(500).json({ message: 'Server error loading popular items.' });
  }
});

// ==================== 2. Personalized "For You" Recommendations ====================
router.get('/for-you', optionalAuth, async (req, res) => {
  const { limit = 6 } = req.query;
  const numLimit = Math.min(Math.max(1, parseInt(limit, 10) || 6), 20);
  const userId = req.user ? req.user.id : null;

  try {
    if (userId) {
      // Find user's past ordered categories & favourite categories
      const [userPrefs] = await db.query(
        `SELECT DISTINCT m.category
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         JOIN menu m ON oi.menu_id = m.id
         WHERE o.user_id = ? AND o.status != 'Cancelled'
         UNION
         SELECT DISTINCT m.category
         FROM favourites f
         JOIN menu m ON f.menu_id = m.id
         WHERE f.user_id = ?`,
        [userId, userId]
      );

      if (userPrefs.length > 0) {
        const preferredCategories = userPrefs.map(p => p.category);
        const placeholders = preferredCategories.map(() => '?').join(',');

        const [personalized] = await db.query(
          `SELECT m.*, 
                  (CASE WHEN f.menu_id IS NOT NULL THEN 1 ELSE 0 END) AS is_favourite,
                  COALESCE(SUM(oi.quantity), 0) AS total_ordered
           FROM menu m
           LEFT JOIN favourites f ON m.id = f.menu_id AND f.user_id = ?
           LEFT JOIN order_items oi ON m.id = oi.menu_id
           WHERE m.is_available = 1 AND m.category IN (${placeholders})
           GROUP BY m.id
           ORDER BY is_favourite DESC, m.rating DESC, total_ordered DESC
           LIMIT ?`,
          [userId, ...preferredCategories, numLimit]
        );

        if (personalized.length > 0) {
          const items = personalized.map(item => ({
            ...item,
            recommendationReason: item.is_favourite 
              ? 'From your saved favourites' 
              : `Recommended because you enjoy ${item.category}`
          }));
          return res.json({
            isPersonalized: true,
            source: 'history_and_favourites',
            items
          });
        }
      }
    }

    // Transparent Fallback for new users or users with empty history:
    // Recommend top-rated popular items
    const [fallbackRows] = await db.query(
      `SELECT m.*, COALESCE(SUM(oi.quantity), 0) AS total_ordered
       FROM menu m
       LEFT JOIN order_items oi ON m.id = oi.menu_id
       LEFT JOIN orders o ON oi.order_id = o.id AND o.status != 'Cancelled'
       WHERE m.is_available = 1
       GROUP BY m.id
       ORDER BY total_ordered DESC, m.rating DESC
       LIMIT ?`,
      [numLimit]
    );

    const items = fallbackRows.map(r => ({
      ...r,
      recommendationReason: 'Trending popular choice among customers'
    }));

    res.json({
      isPersonalized: false,
      source: 'popular_fallback',
      items
    });
  } catch (error) {
    console.error('Error fetching personalized recommendations:', error);
    res.status(500).json({ message: 'Server error loading recommendations.' });
  }
});

// ==================== 3. Frequently Bought Together ====================
router.get('/frequently-bought-together/:menuId', async (req, res) => {
  const menuId = Number(req.params.menuId);

  try {
    // 1. Check actual co-occurrences in orders
    const [coOccurrences] = await db.query(
      `SELECT m.*, COUNT(*) AS pair_count
       FROM order_items oi1
       JOIN order_items oi2 ON oi1.order_id = oi2.order_id AND oi1.menu_id != oi2.menu_id
       JOIN menu m ON oi2.menu_id = m.id
       JOIN orders o ON oi1.order_id = o.id AND o.status != 'Cancelled'
       WHERE oi1.menu_id = ? AND m.is_available = 1
       GROUP BY m.id
       ORDER BY pair_count DESC, m.rating DESC
       LIMIT 3`,
      [menuId]
    );

    if (coOccurrences.length >= 2) {
      return res.json({
        hasHistory: true,
        items: coOccurrences.map(r => ({
          ...r,
          recommendationReason: `Ordered together in ${r.pair_count} customer orders`
        }))
      });
    }

    // 2. Fallback: transparent category or complementary pairing (e.g., sides/desserts)
    const [current] = await db.query('SELECT category FROM menu WHERE id = ?', [menuId]);
    const category = current.length > 0 ? current[0].category : '';

    const [fallbackItems] = await db.query(
      `SELECT m.* 
       FROM menu m
       WHERE m.id != ? AND m.is_available = 1
         AND (m.category = 'Sides' OR m.category = 'Desserts' OR m.category = ?)
       ORDER BY m.rating DESC
       LIMIT 3`,
      [menuId, category]
    );

    res.json({
      hasHistory: false,
      items: fallbackItems.map(r => ({
        ...r,
        recommendationReason: 'Popular complementary pairing'
      }))
    });
  } catch (error) {
    console.error('Error fetching frequently bought together:', error);
    res.status(500).json({ message: 'Server error loading paired items.' });
  }
});

// ==================== 4. Similar Foods (Category-based) ====================
router.get('/similar/:menuId', async (req, res) => {
  const menuId = Number(req.params.menuId);

  try {
    const [current] = await db.query('SELECT category, dietary FROM menu WHERE id = ?', [menuId]);
    if (current.length === 0) {
      return res.status(404).json({ message: 'Item not found.' });
    }

    const { category, dietary } = current[0];

    const [similar] = await db.query(
      `SELECT * FROM menu 
       WHERE id != ? AND is_available = 1 AND category = ?
       ORDER BY rating DESC
       LIMIT 4`,
      [menuId, category]
    );

    // If fewer than 2 items in same category, expand to same dietary
    if (similar.length < 2) {
      const [expanded] = await db.query(
        `SELECT * FROM menu 
         WHERE id != ? AND is_available = 1 AND dietary = ?
         ORDER BY rating DESC
         LIMIT 4`,
        [menuId, dietary]
      );
      return res.json(expanded.map(r => ({ ...r, recommendationReason: `More delicious ${r.dietary} items` })));
    }

    res.json(similar.map(r => ({ ...r, recommendationReason: `More in ${category}` })));
  } catch (error) {
    console.error('Error fetching similar items:', error);
    res.status(500).json({ message: 'Server error loading similar items.' });
  }
});

// ==================== 5. Quick Reorder Picks ====================
router.get('/quick-reorder', requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    const [recentItems] = await db.query(
      `SELECT DISTINCT m.*, MAX(o.created_at) as last_ordered_at
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN menu m ON oi.menu_id = m.id
       WHERE o.user_id = ? AND o.status IN ('Delivered', 'Confirmed', 'Preparing') AND m.is_available = 1
       GROUP BY m.id
       ORDER BY last_ordered_at DESC
       LIMIT 4`,
      [userId]
    );

    res.json(recentItems.map(r => ({
      ...r,
      recommendationReason: 'From your recent orders'
    })));
  } catch (error) {
    console.error('Error fetching quick reorder items:', error);
    res.status(500).json({ message: 'Server error loading reorder items.' });
  }
});

module.exports = router;
