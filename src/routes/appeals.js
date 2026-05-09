const express = require('express');
const router = express.Router();
const pool = require('../database');
const auth = require('../middleware/auth');

// الطالب يبعت تظلم
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Only students can submit appeals' });
  }
  const { subject_id, message } = req.body;
  if (!subject_id || !message) {
    return res.status(400).json({ message: 'All fields required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO appeals (student_id, subject_id, message) VALUES ($1, $2, $3) RETURNING id',
      [req.user.id, subject_id, message]
    );
    res.status(201).json({ message: '✅ Appeal submitted', appealId: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب كل التظلمات (للمعيد والدكتور)
router.get('/', auth, async (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const result = await pool.query(
      `SELECT a.id, a.message, a.status, a.response, a.created_at,
              u.name as student_name, u.student_id as student_code,
              sub.name as subject_name, sub.code as subject_code
       FROM appeals a
       JOIN users u ON u.id = a.student_id
       JOIN subjects sub ON sub.id = a.subject_id
       ORDER BY a.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب تظلمات الطالب الحالي
router.get('/my', auth, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const result = await pool.query(
      `SELECT a.id, a.message, a.status, a.response, a.created_at,
              sub.name as subject_name, sub.code as subject_code
       FROM appeals a
       JOIN subjects sub ON sub.id = a.subject_id
       WHERE a.student_id = $1
       ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// المعيد أو الدكتور يرد على تظلم
router.patch('/:id', auth, async (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { status, response } = req.body;
  if (!status || !response) {
    return res.status(400).json({ message: 'Status and response required' });
  }
  try {
    await pool.query(
      'UPDATE appeals SET status = $1, response = $2 WHERE id = $3',
      [status, response, req.params.id]
    );
    res.json({ message: '✅ Appeal updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;