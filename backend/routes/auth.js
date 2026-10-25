const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'food_delivery_dev_secret_2026_change_this';

// ==================== Signup Route ====================
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required.' });
  }

  const cleanUsername = String(username).trim();
  const cleanEmail = String(email).trim().toLowerCase();

  if (cleanUsername.length < 3) {
    return res.status(400).json({ message: 'Username must be at least 3 characters long.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ message: 'Please provide a valid email address.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  try {
    const [existingUsers] = await db.query('SELECT user_id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existingUsers.length > 0) {
      return res.status(409).json({ message: 'This email is already registered. Please log in instead.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      'INSERT INTO users (username, email, password, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [cleanUsername, cleanEmail, hashedPassword, 'user']
    );

    const newUserId = result.insertId;

    // Issue JWT on signup for a smooth user experience
    const token = jwt.sign(
      { id: newUserId, email: cleanEmail, role: 'user', username: cleanUsername },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: {
        id: newUserId,
        username: cleanUsername,
        email: cleanEmail,
        role: 'user'
      }
    });
  } catch (error) {
    console.error('Signup Error:', error);
    res.status(500).json({ message: 'Server error during account registration. Please try again.' });
  }
});

// ==================== Login Route ====================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = rows[0];

    // Check account active status
    if (user.is_active === 0) {
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact support.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Generate JWT token (expires in 7 days)
    const token = jwt.sign(
      { id: user.user_id, email: user.email, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server error during login. Please try again.' });
  }
});

// ==================== Current User Profile Route ====================
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT user_id, username, email, role, is_active, created_at FROM users WHERE user_id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User profile not found.' });
    }

    res.json({ user: rows[0] });
  } catch (error) {
    console.error('Fetch Current User Error:', error);
    res.status(500).json({ message: 'Server error fetching user profile.' });
  }
});

module.exports = router;