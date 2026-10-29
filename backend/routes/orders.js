const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin, optionalAuth } = require('../middleware/authMiddleware');

const VALID_STATUSES = [
  'Pending',
  'Confirmed',
  'Preparing',
  'Out for Delivery',
  'Delivered',
  'Cancelled'
];

const DEFAULT_STATUS_EMOJIS = {
  'Pending': '⏳',
  'Confirmed': '✅',
  'Preparing': '🍳',
  'Out for Delivery': '🚚',
  'Delivered': '🎉',
  'Cancelled': '❌'
};

const VALID_TRANSITIONS = {
  'Pending': ['Confirmed', 'Cancelled'],
  'Confirmed': ['Preparing', 'Cancelled'],
  'Preparing': ['Out for Delivery', 'Cancelled'],
  'Out for Delivery': ['Delivered', 'Cancelled'],
  'Delivered': [],
  'Cancelled': []
};

// ==================== Helper: Calculate Delivery Fee ====================
function calculateDeliveryFee(subtotal) {
  if (subtotal >= 300) {
    return 0.00; // Free delivery for orders >= Rs. 300
  }
  return 15.00; // Flat Rs. 15 delivery fee
}

// ==================== 1. Get Active Cart ====================
router.get('/cart', requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    // Find active pending order for this user
    const [orders] = await db.query(
      'SELECT id, coupon_code, delivery_instructions FROM orders WHERE user_id = ? AND status = ? LIMIT 1',
      [userId, 'Pending']
    );

    if (orders.length === 0) {
      return res.json({
        orderId: null,
        items: [],
        subtotal: 0.00,
        deliveryFee: 0.00,
        discount: 0.00,
        total: 0.00,
        couponCode: null
      });
    }

    const orderId = orders[0].id;
    const couponCode = orders[0].coupon_code;

    // Fetch items with current menu prices and availability
    const [items] = await db.query(
      `SELECT oi.id AS order_item_id, oi.menu_id, oi.quantity, 
              m.name, m.price AS unit_price, m.emoji, m.category, m.dietary, m.is_available
       FROM order_items oi
       JOIN menu m ON oi.menu_id = m.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    let subtotal = 0;
    const itemList = items.map(item => {
      const price = parseFloat(item.unit_price);
      const itemTotal = price * item.quantity;
      subtotal += itemTotal;
      return {
        orderItemId: item.order_item_id,
        menuId: item.menu_id,
        name: item.name,
        emoji: item.emoji,
        category: item.category,
        dietary: item.dietary,
        unitPrice: price,
        quantity: item.quantity,
        total: parseFloat(itemTotal.toFixed(2)),
        isAvailable: Boolean(item.is_available)
      };
    });

    subtotal = parseFloat(subtotal.toFixed(2));
    let deliveryFee = subtotal > 0 ? calculateDeliveryFee(subtotal) : 0.00;
    let discount = 0.00;

    // Validate coupon if attached
    if (couponCode && subtotal > 0) {
      const [coupons] = await db.query(
        'SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND (expiry_date IS NULL OR expiry_date >= CURDATE())',
        [couponCode]
      );

      if (coupons.length > 0) {
        const coupon = coupons[0];
        if (subtotal >= parseFloat(coupon.min_order)) {
          if (coupon.discount_percent > 0) {
            discount = (subtotal * coupon.discount_percent) / 100;
            if (coupon.max_discount && discount > parseFloat(coupon.max_discount)) {
              discount = parseFloat(coupon.max_discount);
            }
          } else if (parseFloat(coupon.discount_amount) > 0) {
            discount = parseFloat(coupon.discount_amount);
          }
          if (coupon.code === 'FREESHIP') {
            discount = deliveryFee;
          }
        }
      }
    }

    discount = Math.min(discount, subtotal + deliveryFee);
    discount = parseFloat(discount.toFixed(2));
    const total = parseFloat(Math.max(0, subtotal + deliveryFee - discount).toFixed(2));

    res.json({
      orderId,
      items: itemList,
      subtotal,
      deliveryFee,
      discount,
      total,
      couponCode
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ message: 'Server error while loading cart.' });
  }
});

// ==================== 2. Add Item to Cart ====================
router.post('/add-to-cart', requireAuth, async (req, res) => {
  const { menuId, quantity = 1 } = req.body;
  const userId = req.user.id;

  if (!menuId) {
    return res.status(400).json({ message: 'Menu item ID is required.' });
  }

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ message: 'Quantity must be a positive integer.' });
  }

  try {
    // 1. Verify menu item in database - NEVER trust client price!
    const [menuRows] = await db.query(
      'SELECT id, name, price, is_available FROM menu WHERE id = ?',
      [menuId]
    );

    if (menuRows.length === 0) {
      return res.status(404).json({ message: 'Menu item not found.' });
    }

    const menuItem = menuRows[0];
    if (!menuItem.is_available) {
      return res.status(400).json({ message: `"${menuItem.name}" is currently sold out.` });
    }

    const actualPrice = parseFloat(menuItem.price);

    // 2. Find or create pending order
    const [existingOrders] = await db.query(
      'SELECT id FROM orders WHERE user_id = ? AND status = ? LIMIT 1',
      [userId, 'Pending']
    );

    let orderId;
    if (existingOrders.length === 0) {
      const [insertOrder] = await db.query(
        'INSERT INTO orders (user_id, status, statusEmoji, payment_method) VALUES (?, ?, ?, ?)',
        [userId, 'Pending', '🛒', 'COD']
      );
      orderId = insertOrder.insertId;
    } else {
      orderId = existingOrders[0].id;
    }

    // 3. Check if item already exists in this cart
    const [existingItems] = await db.query(
      'SELECT id, quantity FROM order_items WHERE order_id = ? AND menu_id = ?',
      [orderId, menuId]
    );

    if (existingItems.length > 0) {
      const newQty = existingItems[0].quantity + qty;
      await db.query(
        'UPDATE order_items SET quantity = ?, price = ?, item_name = ? WHERE id = ?',
        [newQty, actualPrice, menuItem.name, existingItems[0].id]
      );
    } else {
      await db.query(
        'INSERT INTO order_items (order_id, menu_id, quantity, price, item_name) VALUES (?, ?, ?, ?, ?)',
        [orderId, menuId, qty, actualPrice, menuItem.name]
      );
    }

    res.json({ message: `Added ${menuItem.name} to cart.`, orderId });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ message: 'Server error while adding item to cart.' });
  }
});

// ==================== 3. Update Cart Item Quantity ====================
router.put('/cart/update', requireAuth, async (req, res) => {
  const { menuId, quantity } = req.body;
  const userId = req.user.id;

  if (!menuId || quantity === undefined) {
    return res.status(400).json({ message: 'menuId and quantity are required.' });
  }

  const newQty = parseInt(quantity, 10);

  try {
    const [orders] = await db.query(
      'SELECT id FROM orders WHERE user_id = ? AND status = ? LIMIT 1',
      [userId, 'Pending']
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: 'No active cart found.' });
    }

    const orderId = orders[0].id;

    if (newQty <= 0) {
      await db.query(
        'DELETE FROM order_items WHERE order_id = ? AND menu_id = ?',
        [orderId, menuId]
      );
      return res.json({ message: 'Item removed from cart.' });
    }

    // Check menu item price
    const [menuRows] = await db.query('SELECT price, name FROM menu WHERE id = ?', [menuId]);
    const price = menuRows.length > 0 ? menuRows[0].price : 0;
    const name = menuRows.length > 0 ? menuRows[0].name : '';

    await db.query(
      'UPDATE order_items SET quantity = ?, price = ?, item_name = ? WHERE order_id = ? AND menu_id = ?',
      [newQty, price, name, orderId, menuId]
    );

    res.json({ message: 'Cart updated successfully.' });
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({ message: 'Server error updating cart.' });
  }
});

// ==================== 4. Remove Item from Cart ====================
router.delete('/cart/item/:menuId', requireAuth, async (req, res) => {
  const { menuId } = req.params;
  const userId = req.user.id;

  try {
    const [orders] = await db.query(
      'SELECT id FROM orders WHERE user_id = ? AND status = ? LIMIT 1',
      [userId, 'Pending']
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: 'No active cart found.' });
    }

    await db.query(
      'DELETE FROM order_items WHERE order_id = ? AND menu_id = ?',
      [orders[0].id, menuId]
    );

    res.json({ message: 'Item removed from cart.' });
  } catch (error) {
    console.error('Error removing item from cart:', error);
    res.status(500).json({ message: 'Server error removing item.' });
  }
});

// ==================== 5. Clear Cart ====================
router.delete('/cart/clear', requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    const [orders] = await db.query(
      'SELECT id FROM orders WHERE user_id = ? AND status = ? LIMIT 1',
      [userId, 'Pending']
    );

    if (orders.length > 0) {
      await db.query('DELETE FROM order_items WHERE order_id = ?', [orders[0].id]);
      await db.query('UPDATE orders SET coupon_code = NULL, discount_amount = 0.00 WHERE id = ?', [orders[0].id]);
    }

    res.json({ message: 'Cart cleared successfully.' });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ message: 'Server error clearing cart.' });
  }
});

// ==================== 6. Apply / Remove Coupon ====================
router.post('/cart/coupon', requireAuth, async (req, res) => {
  const { couponCode } = req.body;
  const userId = req.user.id;

  try {
    const [orders] = await db.query(
      'SELECT id FROM orders WHERE user_id = ? AND status = ? LIMIT 1',
      [userId, 'Pending']
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: 'Cart is empty. Please add items first.' });
    }

    const orderId = orders[0].id;

    if (!couponCode || couponCode.trim() === '') {
      await db.query('UPDATE orders SET coupon_code = NULL, discount_amount = 0.00 WHERE id = ?', [orderId]);
      return res.json({ message: 'Coupon removed successfully.' });
    }

    const code = couponCode.trim().toUpperCase();

    // Check coupon in DB
    const [coupons] = await db.query(
      'SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND (expiry_date IS NULL OR expiry_date >= CURDATE())',
      [code]
    );

    if (coupons.length === 0) {
      return res.status(400).json({ message: `Invalid or expired coupon code "${code}".` });
    }

    const coupon = coupons[0];

    // Calculate subtotal of cart
    const [items] = await db.query(
      `SELECT oi.quantity, m.price 
       FROM order_items oi
       JOIN menu m ON oi.menu_id = m.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    if (items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty. Add food items to apply a coupon.' });
    }

    let subtotal = 0;
    items.forEach(i => { subtotal += i.quantity * parseFloat(i.price); });

    if (subtotal < parseFloat(coupon.min_order)) {
      return res.status(400).json({ 
        message: `Coupon "${code}" requires a minimum order of Rs. ${parseFloat(coupon.min_order).toFixed(2)}. Your subtotal is Rs. ${subtotal.toFixed(2)}.` 
      });
    }

    await db.query('UPDATE orders SET coupon_code = ? WHERE id = ?', [code, orderId]);
    res.json({ message: `Coupon "${code}" applied successfully!`, coupon });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ message: 'Server error applying coupon.' });
  }
});

// ==================== 7. Checkout (Transactional, Robust) ====================
router.post('/checkout', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const {
    customerName,
    deliveryAddress,
    contactPhone,
    deliveryInstructions,
    paymentMethod = 'COD',
    couponCode
  } = req.body;

  if (!deliveryAddress || String(deliveryAddress).trim().length < 5) {
    return res.status(400).json({ message: 'A valid delivery address is required.' });
  }

  if (!contactPhone || String(contactPhone).trim().length < 7) {
    return res.status(400).json({ message: 'A valid contact phone number is required.' });
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Get active pending order
    const [orders] = await conn.query(
      'SELECT id, coupon_code FROM orders WHERE user_id = ? AND status = ? LIMIT 1',
      [userId, 'Pending']
    );

    if (orders.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'No active cart found to checkout.' });
    }

    const orderId = orders[0].id;
    const effectiveCoupon = (couponCode && couponCode.trim()) ? couponCode.trim().toUpperCase() : orders[0].coupon_code;

    // 2. Fetch order items and verify each item exists and is available
    const [items] = await conn.query(
      `SELECT oi.id, oi.menu_id, oi.quantity, m.name, m.price, m.is_available
       FROM order_items oi
       JOIN menu m ON oi.menu_id = m.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    if (items.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Your cart is empty. Please add items before checking out.' });
    }

    // Check availability
    for (const item of items) {
      if (!item.is_available) {
        await conn.rollback();
        return res.status(400).json({ 
          message: `"${item.name}" is currently sold out. Please remove it from your cart to proceed.` 
        });
      }
    }

    // 3. Re-calculate subtotal using current menu prices
    let subtotal = 0;
    for (const item of items) {
      const unitPrice = parseFloat(item.price);
      subtotal += item.quantity * unitPrice;
      // Snapshot current unit price and item_name into order_items
      await conn.query(
        'UPDATE order_items SET price = ?, item_name = ? WHERE id = ?',
        [unitPrice, item.name, item.id]
      );
    }
    subtotal = parseFloat(subtotal.toFixed(2));

    // 4. Calculate delivery fee
    const deliveryFee = calculateDeliveryFee(subtotal);

    // 5. Calculate discount from coupon
    let discount = 0.00;
    if (effectiveCoupon) {
      const [coupons] = await conn.query(
        'SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND (expiry_date IS NULL OR expiry_date >= CURDATE())',
        [effectiveCoupon]
      );

      if (coupons.length > 0) {
        const coupon = coupons[0];
        if (subtotal >= parseFloat(coupon.min_order)) {
          if (coupon.discount_percent > 0) {
            discount = (subtotal * coupon.discount_percent) / 100;
            if (coupon.max_discount && discount > parseFloat(coupon.max_discount)) {
              discount = parseFloat(coupon.max_discount);
            }
          } else if (parseFloat(coupon.discount_amount) > 0) {
            discount = parseFloat(coupon.discount_amount);
          }
          if (coupon.code === 'FREESHIP') {
            discount = deliveryFee;
          }
        }
      }
    }

    discount = Math.min(discount, subtotal + deliveryFee);
    discount = parseFloat(discount.toFixed(2));
    const total = parseFloat(Math.max(0, subtotal + deliveryFee - discount).toFixed(2));

    // 6. Update orders record to Confirmed
    const cleanCustomerName = customerName ? String(customerName).trim() : (req.user.username || 'Customer');
    const cleanAddress = String(deliveryAddress).trim();
    const cleanPhone = String(contactPhone).trim();
    const cleanInstructions = deliveryInstructions ? String(deliveryInstructions).trim() : null;
    const cleanPaymentMethod = paymentMethod ? String(paymentMethod).trim() : 'COD';

    await conn.query(
      `UPDATE orders 
       SET status = 'Confirmed',
           statusEmoji = '✅',
           customer_name = ?,
           delivery_address = ?,
           contact_phone = ?,
           delivery_instructions = ?,
           payment_method = ?,
           coupon_code = ?,
           discount_amount = ?,
           subtotal = ?,
           delivery_fee = ?,
           total_amount = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        cleanCustomerName,
        cleanAddress,
        cleanPhone,
        cleanInstructions,
        cleanPaymentMethod,
        effectiveCoupon || null,
        discount,
        subtotal,
        deliveryFee,
        total,
        orderId
      ]
    );

    // 7. Synchronize billing table
    const [existingBilling] = await conn.query(
      'SELECT id FROM billing WHERE order_id = ?',
      [orderId]
    );

    if (existingBilling.length > 0) {
      await conn.query(
        `UPDATE billing 
         SET subtotal = ?, delivery_fee = ?, discount = ?, total = ?, created_at = CURRENT_TIMESTAMP 
         WHERE order_id = ?`,
        [subtotal, deliveryFee, discount, total, orderId]
      );
    } else {
      await conn.query(
        `INSERT INTO billing (order_id, subtotal, delivery_fee, discount, total) 
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, subtotal, deliveryFee, discount, total]
      );
    }

    await conn.commit();

    res.json({
      message: 'Order confirmed successfully!',
      orderId,
      subtotal,
      deliveryFee,
      discount,
      total,
      status: 'Confirmed',
      statusEmoji: '✅'
    });
  } catch (error) {
    await conn.rollback();
    console.error('Checkout error:', error);
    res.status(500).json({ message: 'Server error during checkout. Please try again.' });
  } finally {
    conn.release();
  }
});

// ==================== 8. Get Order History ====================
router.get('/history', requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    const [orders] = await db.query(
      `SELECT o.id, o.status, o.statusEmoji, o.created_at, o.updated_at,
              COALESCE(o.total_amount, b.total, 0.00) AS totalAmount,
              COALESCE(o.subtotal, b.subtotal, 0.00) AS subtotal,
              COALESCE(o.delivery_fee, b.delivery_fee, 0.00) AS deliveryFee,
              COALESCE(o.discount_amount, b.discount, 0.00) AS discountAmount,
              o.delivery_address, o.payment_method, o.customer_name,
              COUNT(oi.id) AS itemCount,
              GROUP_CONCAT(CONCAT(oi.quantity, 'x ', COALESCE(oi.item_name, m.name, 'Item')) SEPARATOR ', ') AS itemsSummary
       FROM orders o
       LEFT JOIN billing b ON o.id = b.order_id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN menu m ON oi.menu_id = m.id
       WHERE o.user_id = ? AND o.status != 'Pending'
       GROUP BY o.id
       ORDER BY o.id DESC`,
      [userId]
    );

    res.json(orders);
  } catch (error) {
    console.error('Error fetching order history:', error);
    res.status(500).json({ message: 'Server error fetching order history.' });
  }
});

// ==================== 9. Track Order Status ====================
router.get('/track/:id', optionalAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT o.id, o.user_id, o.status, o.statusEmoji, o.created_at, o.updated_at,
             COALESCE(o.total_amount, b.total, 0.00) AS totalAmount,
             COALESCE(o.subtotal, b.subtotal, 0.00) AS subtotal,
             COALESCE(o.delivery_fee, b.delivery_fee, 0.00) AS deliveryFee,
             COALESCE(o.discount_amount, b.discount, 0.00) AS discountAmount,
             o.delivery_address, o.contact_phone, o.customer_name, o.payment_method, o.delivery_instructions
      FROM orders o
      LEFT JOIN billing b ON o.id = b.order_id
      WHERE o.id = ?
    `;

    const [orders] = await db.query(query, [id]);

    if (orders.length === 0) {
      return res.status(404).json({ message: `Order #${id} not found.` });
    }

    const order = orders[0];

    // Fetch items in order
    const [items] = await db.query(
      `SELECT oi.quantity, oi.price AS unitPrice, 
              COALESCE(oi.item_name, m.name) AS name, m.emoji
       FROM order_items oi
       LEFT JOIN menu m ON oi.menu_id = m.id
       WHERE oi.order_id = ?`,
      [id]
    );

    const timeline = [
      { step: 'Order Placed', status: 'Pending', icon: '🛒', completed: true },
      { 
        step: 'Confirmed', 
        status: 'Confirmed', 
        icon: '✅', 
        completed: ['Confirmed', 'Preparing', 'Out for Delivery', 'Delivered'].includes(order.status) 
      },
      { 
        step: 'Preparing Food', 
        status: 'Preparing', 
        icon: '🍳', 
        completed: ['Preparing', 'Out for Delivery', 'Delivered'].includes(order.status) 
      },
      { 
        step: 'Out for Delivery', 
        status: 'Out for Delivery', 
        icon: '🚚', 
        completed: ['Out for Delivery', 'Delivered'].includes(order.status) 
      },
      { 
        step: 'Delivered', 
        status: 'Delivered', 
        icon: '🎉', 
        completed: order.status === 'Delivered' 
      }
    ];

    if (order.status === 'Cancelled') {
      timeline.push({ step: 'Cancelled', status: 'Cancelled', icon: '❌', completed: true });
    }

    const formattedItems = items.map(i => ({
      name: i.name,
      item_name: i.name,
      emoji: i.emoji,
      quantity: i.quantity,
      unitPrice: parseFloat(i.unitPrice),
      price: parseFloat(i.unitPrice),
      total: parseFloat((i.quantity * i.unitPrice).toFixed(2))
    }));

    const orderSummary = {
      id: order.id,
      orderId: order.id,
      user_id: order.user_id,
      status: order.status,
      statusEmoji: order.statusEmoji || DEFAULT_STATUS_EMOJIS[order.status] || '',
      created_at: order.created_at,
      createdAt: order.created_at,
      updated_at: order.updated_at,
      updatedAt: order.updated_at,
      customer_name: order.customer_name,
      customerName: order.customer_name,
      delivery_address: order.delivery_address,
      deliveryAddress: order.delivery_address,
      contact_phone: order.contact_phone,
      contactPhone: order.contact_phone,
      payment_method: order.payment_method,
      paymentMethod: order.payment_method,
      subtotal: parseFloat(order.subtotal),
      delivery_fee: parseFloat(order.deliveryFee),
      deliveryFee: parseFloat(order.deliveryFee),
      discount: parseFloat(order.discountAmount),
      discount_amount: parseFloat(order.discountAmount),
      total: parseFloat(order.totalAmount),
      total_amount: parseFloat(order.totalAmount)
    };

    res.json({
      ...orderSummary,
      order: orderSummary,
      items: formattedItems,
      timeline
    });
  } catch (error) {
    console.error('Error tracking order:', error);
    res.status(500).json({ message: 'Server error tracking order.' });
  }
});

// ==================== 10. Get Billing Details ====================
router.get('/:id/billing', optionalAuth, async (req, res) => {
  const orderId = req.params.id;

  try {
    const orderQuery = 'SELECT id, status, statusEmoji, user_id, customer_name, delivery_address, created_at FROM orders WHERE id = ?';
    const [orders] = await db.query(orderQuery, [orderId]);

    if (orders.length === 0) {
      return res.status(404).json({ message: `Invoice for order #${orderId} not found.` });
    }

    const order = orders[0];

    // Get billing record or fallback to order fields
    const [billing] = await db.query(
      'SELECT subtotal, delivery_fee, discount, total, created_at FROM billing WHERE order_id = ?',
      [orderId]
    );

    // Get items
    const [items] = await db.query(
      `SELECT oi.quantity, oi.price AS unitPrice, COALESCE(oi.item_name, m.name) AS name, m.emoji
       FROM order_items oi
       LEFT JOIN menu m ON oi.menu_id = m.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    const subtotal = billing.length > 0 ? parseFloat(billing[0].subtotal) : 0;
    const deliveryFee = billing.length > 0 ? parseFloat(billing[0].delivery_fee) : 0;
    const discount = billing.length > 0 ? parseFloat(billing[0].discount || 0) : 0;
    const total = billing.length > 0 ? parseFloat(billing[0].total) : 0;

    res.json({
      orderId: order.id,
      status: order.status,
      statusEmoji: order.statusEmoji,
      customerName: order.customer_name,
      deliveryAddress: order.delivery_address,
      orderDate: billing.length > 0 ? billing[0].created_at : order.created_at,
      subtotal,
      deliveryFee,
      discount,
      total,
      items: items.map(i => ({
        name: i.name,
        emoji: i.emoji,
        quantity: i.quantity,
        unitPrice: parseFloat(i.unitPrice),
        total: parseFloat((i.quantity * i.unitPrice).toFixed(2))
      }))
    });
  } catch (error) {
    console.error('Billing error:', error);
    res.status(500).json({ message: 'Server error loading invoice.' });
  }
});

// ==================== 11. Update Order Status (Admin Only) ====================
router.put('/update/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, statusEmoji } = req.body;

  if (!status || typeof status !== 'string') {
    return res.status(400).json({ message: 'Order status is required.' });
  }

  const trimmedStatus = status.trim();
  const canonicalStatus = VALID_STATUSES.find(
    s => s.toLowerCase() === trimmedStatus.toLowerCase()
  );

  if (!canonicalStatus) {
    return res.status(400).json({
      message: `Invalid status "${status}". Allowed statuses are: ${VALID_STATUSES.join(', ')}`
    });
  }

  try {
    const [orders] = await db.query(
      'SELECT id, status, statusEmoji FROM orders WHERE id = ?',
      [id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const currentStatus = orders[0].status;
    const normalizedCurrent = VALID_STATUSES.find(
      s => s.toLowerCase() === (currentStatus || '').trim().toLowerCase()
    ) || currentStatus;

    // Check transition
    const isSameStatus = normalizedCurrent.toLowerCase() === canonicalStatus.toLowerCase();

    if (!isSameStatus && VALID_TRANSITIONS[normalizedCurrent]) {
      const allowedNext = VALID_TRANSITIONS[normalizedCurrent];
      const isAllowed = allowedNext.some(
        s => s.toLowerCase() === canonicalStatus.toLowerCase()
      );

      if (!isAllowed) {
        const allowedMsg = allowedNext.length > 0
          ? `Allowed next transition(s): ${allowedNext.join(', ')}.`
          : `Order is in final state "${normalizedCurrent}" and cannot be changed.`;

        return res.status(400).json({
          message: `Invalid transition from "${normalizedCurrent}" to "${canonicalStatus}". ${allowedMsg}`
        });
      }
    }

    const resolvedEmoji = statusEmoji || DEFAULT_STATUS_EMOJIS[canonicalStatus] || '';

    await db.query(
      'UPDATE orders SET status = ?, statusEmoji = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [canonicalStatus, resolvedEmoji, id]
    );

    res.json({
      message: 'Order status updated successfully.',
      orderId: id,
      status: canonicalStatus,
      statusEmoji: resolvedEmoji
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ message: 'Server error updating order status.' });
  }
});

// ==================== 12. Cancel Order ====================
router.post('/cancel/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  try {
    let query = 'SELECT id, status, user_id FROM orders WHERE id = ?';
    const params = [id];

    if (!isAdmin) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    const [orders] = await db.query(query, params);

    if (orders.length === 0) {
      return res.status(404).json({ message: 'Order not found or access denied.' });
    }

    const order = orders[0];

    // Only allow cancellation if order is Pending or Confirmed
    if (!['Pending', 'Confirmed'].includes(order.status)) {
      return res.status(400).json({
        message: `Order cannot be cancelled because its current status is "${order.status}". Orders can only be cancelled while Pending or Confirmed.`
      });
    }

    await db.query(
      'UPDATE orders SET status = ?, statusEmoji = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['Cancelled', '❌', id]
    );

    res.json({
      message: 'Order has been successfully cancelled.',
      orderId: id,
      status: 'Cancelled',
      statusEmoji: '❌'
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ message: 'Server error cancelling order.' });
  }
});

// ==================== 13. Reorder ====================
router.post('/reorder/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // 1. Get past order items
    const [pastOrder] = await db.query(
      'SELECT id FROM orders WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (pastOrder.length === 0) {
      return res.status(404).json({ message: 'Past order not found.' });
    }

    const [pastItems] = await db.query(
      `SELECT oi.menu_id, oi.quantity, m.name, m.price, m.is_available
       FROM order_items oi
       JOIN menu m ON oi.menu_id = m.id
       WHERE oi.order_id = ?`,
      [id]
    );

    if (pastItems.length === 0) {
      return res.status(400).json({ message: 'No items found in this past order.' });
    }

    // 2. Find or create pending cart
    const [pending] = await db.query(
      'SELECT id FROM orders WHERE user_id = ? AND status = ? LIMIT 1',
      [userId, 'Pending']
    );

    let cartOrderId;
    if (pending.length === 0) {
      const [newOrder] = await db.query(
        'INSERT INTO orders (user_id, status, statusEmoji, payment_method) VALUES (?, ?, ?, ?)',
        [userId, 'Pending', '🛒', 'COD']
      );
      cartOrderId = newOrder.insertId;
    } else {
      cartOrderId = pending[0].id;
    }

    let addedCount = 0;
    let skippedCount = 0;

    for (const item of pastItems) {
      if (!item.is_available) {
        skippedCount++;
        continue;
      }

      const currentPrice = parseFloat(item.price);

      // Check if item in cart
      const [inCart] = await db.query(
        'SELECT id, quantity FROM order_items WHERE order_id = ? AND menu_id = ?',
        [cartOrderId, item.menu_id]
      );

      if (inCart.length > 0) {
        await db.query(
          'UPDATE order_items SET quantity = quantity + ?, price = ?, item_name = ? WHERE id = ?',
          [item.quantity, currentPrice, item.name, inCart[0].id]
        );
      } else {
        await db.query(
          'INSERT INTO order_items (order_id, menu_id, quantity, price, item_name) VALUES (?, ?, ?, ?, ?)',
          [cartOrderId, item.menu_id, item.quantity, currentPrice, item.name]
        );
      }
      addedCount++;
    }

    res.json({
      message: `Reorder added to cart! (${addedCount} item(s) added${skippedCount > 0 ? `, ${skippedCount} unavailable item(s) skipped` : ''})`,
      orderId: cartOrderId
    });
  } catch (error) {
    console.error('Error reordering:', error);
    res.status(500).json({ message: 'Server error while reordering items.' });
  }
});

module.exports = router;