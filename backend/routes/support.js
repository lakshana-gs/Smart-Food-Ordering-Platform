const express = require('express');
const router = express.Router();
const db = require('../db');
const { optionalAuth, requireAuth, requireAdmin } = require('../middleware/authMiddleware');

// Get curated FAQs
router.get('/faqs', (req, res) => {
  const faqs = [
    {
      category: 'Ordering & Menu',
      question: 'How do I place an order?',
      answer: 'Browse our menu, select your favourite dishes and quantities, add them to your cart, and proceed to checkout. You can review your address, apply discounts, and choose your payment method.'
    },
    {
      category: 'Ordering & Menu',
      question: 'Can I customize dietary preferences (Veg/Non-Veg)?',
      answer: 'Yes! Our menu features quick dietary filters allowing you to instantly view Pure Vegetarian dishes or Non-Vegetarian selections.'
    },
    {
      category: 'Delivery & Tracking',
      question: 'How does live order tracking work?',
      answer: 'Once your order is confirmed, you can view the live progress on your Track Order page as the kitchen prepares your meal and our delivery partner delivers it to your doorstep.'
    },
    {
      category: 'Delivery & Tracking',
      question: 'What is the delivery fee policy?',
      answer: 'We offer free delivery on all orders of Rs. 300 and above! For smaller orders, a modest delivery fee of Rs. 15 applies.'
    },
    {
      category: 'Payments & Promo Codes',
      question: 'What payment methods do you support?',
      answer: 'We support Cash on Delivery (COD) as well as simulated Instant Card & UPI payments for safe, convenient ordering.'
    },
    {
      category: 'Payments & Promo Codes',
      question: 'How do I use a coupon code?',
      answer: 'Enter any active promo code (such as WELCOME20 or FLAT50) in your cart or checkout page and click "Apply". If your order qualifies, the discount will be deducted automatically from your total.'
    },
    {
      category: 'Cancellations & Refunds',
      question: 'Can I cancel an order after placing it?',
      answer: 'You may cancel your order at any time while it is in "Pending" or "Confirmed" status directly from your Order History page. Once the kitchen starts "Preparing" your meal, cancellations cannot be accepted.'
    }
  ];
  res.json(faqs);
});

// Submit support message
router.post('/contact', optionalAuth, async (req, res) => {
  const { name, email, subject, message } = req.body;
  const userId = req.user ? req.user.id : null;

  if (!name || !email || !message) {
    return res.status(400).json({ message: 'Name, email, and message are required.' });
  }

  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanSubject = subject ? String(subject).trim() : 'Customer Inquiry';
  const cleanMessage = String(message).trim();

  try {
    await db.query(
      `INSERT INTO contact_messages (user_id, name, email, subject, message, status)
       VALUES (?, ?, ?, ?, ?, 'New')`,
      [userId, cleanName, cleanEmail, cleanSubject, cleanMessage]
    );

    res.status(201).json({
      message: 'Thank you! Your message has been received. Our support team will get back to you shortly.'
    });
  } catch (error) {
    console.error('Error submitting contact form:', error);
    res.status(500).json({ message: 'Server error submitting message. Please try again later.' });
  }
});

// Admin: view contact messages
router.get('/admin/messages', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM contact_messages ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching support messages:', error);
    res.status(500).json({ message: 'Server error loading messages.' });
  }
});

module.exports = router;
