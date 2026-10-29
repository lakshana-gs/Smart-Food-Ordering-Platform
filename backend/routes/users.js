const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const router = express.Router();

// ==================== Get All Users (Admin Only) ====================
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { search, role, status } = req.query;

    let query = 'SELECT user_id, username, email, role, is_active, created_at FROM users WHERE 1=1';
    const params = [];

    if (search && search.trim()) {
      query += ' AND (LOWER(username) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?))';
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    if (role && role !== 'All') {
      query += ' AND role = ?';
      params.push(role);
    }

    if (status && status !== 'All') {
      query += ' AND is_active = ?';
      params.push(status === 'active' ? 1 : 0);
    }

    query += ' ORDER BY user_id DESC';

    const [users] = await db.query(query, params);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error while fetching users.' });
  }
});

// ==================== Get Single User (Self or Admin Only - No IDOR) ====================
router.get('/:id', requireAuth, async (req, res) => {
  const targetId = Number(req.params.id);
  const isSelf = req.user.id === targetId;
  const isAdmin = req.user.role === 'admin';

  if (!isSelf && !isAdmin) {
    return res.status(403).json({ message: 'Access denied. You can only view your own profile.' });
  }

  try {
    const [users] = await db.query(
      'SELECT user_id, username, email, role, is_active, created_at FROM users WHERE user_id = ?',
      [targetId]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json(users[0]);
  } catch (error) {
    console.error(`Error fetching user ${req.params.id}:`, error);
    res.status(500).json({ message: 'Server error while fetching user.' });
  }
});

// ==================== Create User (Admin Only) ====================
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields (username, email, password, role) are required.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanUsername = String(username).trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ message: 'Invalid email format.' });
  }

  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ message: 'Role must be "admin" or "user".' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  try {
    const [existing] = await db.query('SELECT user_id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (username, email, password, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [cleanUsername, cleanEmail, hashedPassword, role]
    );

    res.status(201).json({
      message: 'User created successfully.',
      user: {
        user_id: result.insertId,
        username: cleanUsername,
        email: cleanEmail,
        role
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Server error while creating user.' });
  }
});

// ==================== Update User (Self or Admin Only) ====================
router.put('/:id', requireAuth, async (req, res) => {
  const targetId = Number(req.params.id);
  const isSelf = req.user.id === targetId;
  const isAdmin = req.user.role === 'admin';

  if (!isSelf && !isAdmin) {
    return res.status(403).json({ message: 'Access denied. You can only update your own account.' });
  }

  const { username, email, role, is_active } = req.body;

  if (!username) {
    return res.status(400).json({ message: 'Username is required.' });
  }

  try {
    // If not admin, cannot change role or active status or email
    if (!isAdmin) {
      const [result] = await db.query(
        'UPDATE users SET username = ? WHERE user_id = ?',
        [String(username).trim(), targetId]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'User not found.' });
      }
      return res.json({ message: 'Profile updated successfully.' });
    }

    // Admin updates
    const cleanEmail = email ? String(email).trim().toLowerCase() : undefined;
    const cleanRole = role && ['admin', 'user'].includes(role) ? role : undefined;
    const activeFlag = is_active !== undefined ? (is_active ? 1 : 0) : undefined;

    // Check duplicate email if changed
    if (cleanEmail) {
      const [existing] = await db.query(
        'SELECT user_id FROM users WHERE LOWER(email) = ? AND user_id != ?',
        [cleanEmail, targetId]
      );
      if (existing.length > 0) {
        return res.status(409).json({ message: 'Email already in use by another account.' });
      }
    }

    const [result] = await db.query(
      `UPDATE users 
       SET username = COALESCE(?, username),
           email = COALESCE(?, email),
           role = COALESCE(?, role),
           is_active = COALESCE(?, is_active)
       WHERE user_id = ?`,
      [String(username).trim(), cleanEmail || null, cleanRole || null, activeFlag !== undefined ? activeFlag : null, targetId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ message: 'User updated successfully.' });
  } catch (error) {
    console.error(`Error updating user ${req.params.id}:`, error);
    res.status(500).json({ message: 'Server error while updating user.' });
  }
});

// ==================== Toggle User Active Status (Admin Only) ====================
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  const { is_active } = req.body;

  if (targetId === req.user.id) {
    return res.status(400).json({ message: 'You cannot deactivate your own admin account.' });
  }

  try {
    const [result] = await db.query(
      'UPDATE users SET is_active = ? WHERE user_id = ?',
      [is_active ? 1 : 0, targetId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ 
      message: `User account ${is_active ? 'activated' : 'deactivated'} successfully.` 
    });
  } catch (error) {
    console.error(`Error updating user status ${req.params.id}:`, error);
    res.status(500).json({ message: 'Server error while updating user status.' });
  }
});

// ==================== Toggle/Update User Role (Admin Only) ====================
router.patch('/:id/role', requireAuth, requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  const { role } = req.body;

  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ message: 'Role must be "admin" or "user".' });
  }

  if (targetId === req.user.id && role !== 'admin') {
    return res.status(400).json({ message: 'You cannot demote your own admin account.' });
  }

  try {
    const [result] = await db.query(
      'UPDATE users SET role = ? WHERE user_id = ?',
      [role, targetId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ message: `User role successfully updated to ${role}.` });
  } catch (error) {
    console.error(`Error updating user role ${req.params.id}:`, error);
    res.status(500).json({ message: 'Server error while updating user role.' });
  }
});

// ==================== Delete User (Admin Only - Safe) ====================
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);

  if (targetId === req.user.id) {
    return res.status(400).json({ message: 'You cannot delete your own admin account.' });
  }

  try {
    // Check if user has orders
    const [orders] = await db.query('SELECT COUNT(*) as cnt FROM orders WHERE user_id = ?', [targetId]);
    if (orders[0].cnt > 0) {
      // Deactivate instead to preserve audit trail
      await db.query('UPDATE users SET is_active = 0 WHERE user_id = ?', [targetId]);
      return res.json({ 
        message: 'User has order history, so the account was deactivated to preserve order records.' 
      });
    }

    const [result] = await db.query('DELETE FROM users WHERE user_id = ?', [targetId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error(`Error deleting user ${req.params.id}:`, error);
    res.status(500).json({ message: 'Server error while deleting user.' });
  }
});

module.exports = router;
