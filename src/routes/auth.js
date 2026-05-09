const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database');
const auth = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
  const { name, email, password, role, student_id } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields required' });
  }
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, student_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, email, hashedPassword, role, student_id || null]
    );
    res.status(201).json({ message: '✅ User created', userId: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'All fields required' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, student_id: user.student_id }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, student_id FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// البحث عن طلاب
router.get('/search', auth, async (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const result = await pool.query(
      `SELECT id, name, email, student_id, avatar FROM users
       WHERE role = 'student' AND (name ILIKE $1 OR student_id ILIKE $1)
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب كل المستخدمين (دكتور بس)
router.get('/users', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const result = await pool.query('SELECT id, name, email, role, student_id FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;