const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

// Protect ALL admin routes in this router
router.use(requireAuth, requireAdmin);

// ==================== 1. Real Dashboard Analytics & Stats ====================
router.get('/stats', async (req, res) => {
  const { range = 'all' } = req.query;

  try {
    // 1. Total counts
    const [[{ userCount }]] = await db.query('SELECT COUNT(*) AS userCount FROM users');
    const [[{ menuCount }]] = await db.query('SELECT COUNT(*) AS menuCount FROM menu');
    const [[{ activeMenuCount }]] = await db.query('SELECT COUNT(*) AS activeMenuCount FROM menu WHERE is_available = 1');
    const [[{ totalOrders }]] = await db.query("SELECT COUNT(*) AS totalOrders FROM orders WHERE status != 'Pending'");
    const [[{ pendingOrders }]] = await db.query("SELECT COUNT(*) AS pendingOrders FROM orders WHERE status IN ('Pending', 'Confirmed')");
    const [[{ inProgressOrders }]] = await db.query("SELECT COUNT(*) AS inProgressOrders FROM orders WHERE status IN ('Preparing', 'Out for Delivery')");
    const [[{ deliveredOrders }]] = await db.query("SELECT COUNT(*) AS deliveredOrders FROM orders WHERE status = 'Delivered'");
    const [[{ cancelledOrders }]] = await db.query("SELECT COUNT(*) AS cancelledOrders FROM orders WHERE status = 'Cancelled'");

    // 2. Real Revenue (Calculated excluding cancelled orders)
    let revenueQuery = `
      SELECT COALESCE(SUM(b.total), 0) AS totalRevenue,
             COALESCE(SUM(b.subtotal), 0) AS totalSubtotal,
             COALESCE(SUM(b.discount), 0) AS totalDiscounts
      FROM billing b
      JOIN orders o ON b.order_id = o.id
      WHERE o.status != 'Cancelled'
    `;
    const revParams = [];

    if (range === 'today') {
      revenueQuery += ' AND DATE(b.created_at) = CURDATE()';
    } else if (range === 'week') {
      revenueQuery += ' AND b.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (range === 'month') {
      revenueQuery += ' AND b.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    const [[revData]] = await db.query(revenueQuery, revParams);

    // 3. Status breakdown
    const [statusBreakdown] = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM orders
      WHERE status != 'Pending'
      GROUP BY status
    `);

    // 4. Top Selling Items (from real order_items)
    const [topSelling] = await db.query(`
      SELECT m.id, m.name, m.emoji, m.price, m.category,
             COALESCE(SUM(oi.quantity), 0) AS units_sold,
             COALESCE(SUM(oi.quantity * oi.price), 0) AS total_revenue
      FROM menu m
      JOIN order_items oi ON m.id = oi.menu_id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'Cancelled'
      GROUP BY m.id
      ORDER BY units_sold DESC
      LIMIT 5
    `);

    // 5. Recent Real Orders (No fake activity feed)
    const [recentOrders] = await db.query(`
      SELECT o.id, o.user_id, o.status, o.statusEmoji, o.created_at, o.updated_at,
             COALESCE(o.customer_name, u.username) AS customerName,
             u.email AS customerEmail,
             COALESCE(o.total_amount, b.total, 0.00) AS total,
             o.payment_method,
             COUNT(oi.id) AS itemCount
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.user_id
      LEFT JOIN billing b ON o.id = b.order_id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.status != 'Pending'
      GROUP BY o.id
      ORDER BY o.id DESC
      LIMIT 8
    `);

    res.json({
      counts: {
        users: userCount,
        menuItems: menuCount,
        activeMenuItems: activeMenuCount,
        totalOrders,
        pendingOrders,
        inProgressOrders,
        deliveredOrders,
        cancelledOrders
      },
      revenue: {
        totalRevenue: parseFloat(revData.totalRevenue).toFixed(2),
        totalSubtotal: parseFloat(revData.totalSubtotal).toFixed(2),
        totalDiscounts: parseFloat(revData.totalDiscounts).toFixed(2),
        range
      },
      statusBreakdown,
      topSelling: topSelling.map(i => ({
        ...i,
        units_sold: parseInt(i.units_sold, 10),
        total_revenue: parseFloat(i.total_revenue).toFixed(2)
      })),
      recentOrders: recentOrders.map(o => ({
        ...o,
        total: parseFloat(o.total).toFixed(2)
      }))
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ message: 'Server error loading analytics.' });
  }
});

// ==================== 2. List All Orders for Admin ====================
router.get('/orders', async (req, res) => {
  const { status, search, limit = 50 } = req.query;

  try {
    let query = `
      SELECT o.id, o.user_id, o.status, o.statusEmoji, o.created_at, o.updated_at,
             COALESCE(o.customer_name, u.username) AS customerName,
             u.email AS customerEmail,
             o.contact_phone, o.delivery_address, o.payment_method, o.coupon_code,
             COALESCE(o.subtotal, b.subtotal, 0.00) AS subtotal,
             COALESCE(o.delivery_fee, b.delivery_fee, 0.00) AS deliveryFee,
             COALESCE(o.discount_amount, b.discount, 0.00) AS discount,
             COALESCE(o.total_amount, b.total, 0.00) AS total,
             COUNT(oi.id) AS itemCount,
             GROUP_CONCAT(CONCAT(oi.quantity, 'x ', COALESCE(oi.item_name, m.name, 'Item')) SEPARATOR ', ') AS itemsSummary
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.user_id
      LEFT JOIN billing b ON o.id = b.order_id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN menu m ON oi.menu_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'All') {
      query += ' AND o.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      query += ' AND (o.id = ? OR LOWER(u.username) LIKE LOWER(?) OR LOWER(o.customer_name) LIKE LOWER(?) OR LOWER(o.contact_phone) LIKE LOWER(?))';
      const term = `%${search.trim()}%`;
      const idVal = isNaN(Number(search.trim())) ? -1 : Number(search.trim());
      params.push(idVal, term, term, term);
    }

    query += ' GROUP BY o.id ORDER BY o.id DESC LIMIT ?';
    params.push(parseInt(limit, 10) || 50);

    const [orders] = await db.query(query, params);

    res.json(orders.map(o => ({
      ...o,
      subtotal: parseFloat(o.subtotal).toFixed(2),
      deliveryFee: parseFloat(o.deliveryFee).toFixed(2),
      discount: parseFloat(o.discount).toFixed(2),
      total: parseFloat(o.total).toFixed(2)
    })));
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    res.status(500).json({ message: 'Server error loading orders.' });
  }
});

// ==================== 3. Order Details for Admin ====================
router.get('/orders/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [orders] = await db.query(`
      SELECT o.*, u.username AS userAccountName, u.email AS userAccountEmail,
             COALESCE(b.subtotal, o.subtotal, 0.00) AS subtotal,
             COALESCE(b.delivery_fee, o.delivery_fee, 0.00) AS deliveryFee,
             COALESCE(b.discount, o.discount_amount, 0.00) AS discount,
             COALESCE(b.total, o.total_amount, 0.00) AS total
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.user_id
      LEFT JOIN billing b ON o.id = b.order_id
      WHERE o.id = ?
    `, [id]);

    if (orders.length === 0) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const order = orders[0];

    const [items] = await db.query(`
      SELECT oi.*, m.name, m.emoji, m.category, m.dietary
      FROM order_items oi
      LEFT JOIN menu m ON oi.menu_id = m.id
      WHERE oi.order_id = ?
    `, [id]);

    res.json({
      order: {
        ...order,
        subtotal: parseFloat(order.subtotal).toFixed(2),
        deliveryFee: parseFloat(order.deliveryFee).toFixed(2),
        discount: parseFloat(order.discount).toFixed(2),
        total: parseFloat(order.total).toFixed(2)
      },
      items: items.map(i => ({
        ...i,
        price: parseFloat(i.price).toFixed(2),
        total: (parseFloat(i.price) * i.quantity).toFixed(2)
      }))
    });
  } catch (error) {
    console.error('Error fetching admin order details:', error);
    res.status(500).json({ message: 'Server error loading order details.' });
  }
});

module.exports = router;
