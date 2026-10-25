const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/authMiddleware');

// Get all saved addresses for logged-in user
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const [rows] = await db.query(
      'SELECT * FROM customer_addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC',
      [userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(500).json({ message: 'Server error loading saved addresses.' });
  }
});

// Add new delivery address
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { label = 'Home', recipient_name, phone, address, is_default = false } = req.body;

  if (!address || String(address).trim().length < 5) {
    return res.status(400).json({ message: 'A valid delivery address is required.' });
  }

  const cleanLabel = String(label).trim();
  const cleanRecipient = recipient_name ? String(recipient_name).trim() : req.user.username;
  const cleanPhone = phone ? String(phone).trim() : '';
  const cleanAddress = String(address).trim();
  const defaultFlag = is_default ? 1 : 0;

  try {
    if (defaultFlag === 1) {
      // Unset existing defaults
      await db.query('UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?', [userId]);
    } else {
      // If user has no addresses yet, make this one default
      const [count] = await db.query('SELECT COUNT(*) as cnt FROM customer_addresses WHERE user_id = ?', [userId]);
      if (count[0].cnt === 0) {
        // First address is default
      }
    }

    const [result] = await db.query(
      `INSERT INTO customer_addresses (user_id, label, recipient_name, phone, address, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, cleanLabel, cleanRecipient, cleanPhone, cleanAddress, defaultFlag]
    );

    res.status(201).json({
      message: 'Address saved successfully.',
      address: {
        id: result.insertId,
        user_id: userId,
        label: cleanLabel,
        recipient_name: cleanRecipient,
        phone: cleanPhone,
        address: cleanAddress,
        is_default: defaultFlag
      }
    });
  } catch (error) {
    console.error('Error adding address:', error);
    res.status(500).json({ message: 'Server error saving address.' });
  }
});

// Update an address (ensure ownership!)
router.put('/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const addressId = Number(req.params.id);
  const { label, recipient_name, phone, address, is_default } = req.body;

  if (!address || String(address).trim().length < 5) {
    return res.status(400).json({ message: 'A valid delivery address is required.' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM customer_addresses WHERE id = ? AND user_id = ?',
      [addressId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Address not found or access denied.' });
    }

    if (is_default) {
      await db.query('UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?', [userId]);
    }

    await db.query(
      `UPDATE customer_addresses 
       SET label = ?, recipient_name = ?, phone = ?, address = ?, is_default = ?
       WHERE id = ? AND user_id = ?`,
      [
        String(label || 'Home').trim(),
        recipient_name ? String(recipient_name).trim() : null,
        phone ? String(phone).trim() : null,
        String(address).trim(),
        is_default ? 1 : 0,
        addressId,
        userId
      ]
    );

    res.json({ message: 'Address updated successfully.' });
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({ message: 'Server error updating address.' });
  }
});

// Set address as default
router.put('/:id/default', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const addressId = Number(req.params.id);

  try {
    const [existing] = await db.query(
      'SELECT id FROM customer_addresses WHERE id = ? AND user_id = ?',
      [addressId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Address not found or access denied.' });
    }

    await db.query('UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?', [userId]);
    await db.query('UPDATE customer_addresses SET is_default = 1 WHERE id = ? AND user_id = ?', [addressId, userId]);

    res.json({ message: 'Default delivery address updated.' });
  } catch (error) {
    console.error('Error setting default address:', error);
    res.status(500).json({ message: 'Server error setting default address.' });
  }
});

// Delete an address (ensure ownership!)
router.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const addressId = Number(req.params.id);

  try {
    const [result] = await db.query(
      'DELETE FROM customer_addresses WHERE id = ? AND user_id = ?',
      [addressId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Address not found or access denied.' });
    }

    res.json({ message: 'Address deleted successfully.' });
  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({ message: 'Server error deleting address.' });
  }
});

module.exports = router;
