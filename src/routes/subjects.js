const express = require('express');
const router = express.Router();
const pool = require('../database');
const auth = require('../middleware/auth');

// جيب كل المواد
router.get('/', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'doctor') {
      result = await pool.query(
        `SELECT s.*, u.name as doctor_name FROM subjects s
         LEFT JOIN users u ON u.id = s.doctor_id
         WHERE s.doctor_id = $1`,
        [req.user.id]
      );
    } else if (req.user.role === 'assistant') {
      result = await pool.query(
        `SELECT s.*, u.name as doctor_name FROM subjects s
         LEFT JOIN users u ON u.id = s.doctor_id
         JOIN subject_assistants sa ON sa.subject_id = s.id
         WHERE sa.assistant_id = $1`,
        [req.user.id]
      );
    } else {
      result = await pool.query(
        `SELECT s.*, u.name as doctor_name FROM subjects s
         LEFT JOIN users u ON u.id = s.doctor_id`
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب إعدادات المادة
router.get('/:id/settings', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM subject_settings WHERE subject_id = $1',
      [req.params.id]
    );
    res.json(result.rows[0] || { subject_id: req.params.id, allow_second_midterm: 0 });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// إضافة مادة جديدة (دكتور بس)
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { name, code } = req.body;
  if (!name || !code) {
    return res.status(400).json({ message: 'All fields required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO subjects (name, code, doctor_id) VALUES ($1, $2, $3) RETURNING id',
      [name, code, req.user.id]
    );
    res.status(201).json({ message: '✅ Subject created', subjectId: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      const existing = await pool.query(
        `SELECT s.name as subject_name, u.name as doctor_name
         FROM subjects s JOIN users u ON u.id = s.doctor_id WHERE s.code = $1`,
        [code]
      );
      return res.status(400).json({
        message: `الكود ده موجود بالفعل، المادة "${existing.rows[0]?.subject_name}" عند د. ${existing.rows[0]?.doctor_name}`
      });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// تعديل مادة (دكتور بس)
router.patch('/:id', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { name, code } = req.body;
  try {
    await pool.query(
      'UPDATE subjects SET name = COALESCE($1, name), code = COALESCE($2, code) WHERE id = $3',
      [name || null, code || null, req.params.id]
    );
    res.json({ message: '✅ Subject updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// تسجيل طالب في مادة (دكتور أو معيد)
router.post('/:subject_id/enroll', auth, async (req, res) => {
  if (req.user.role !== 'doctor' && req.user.role !== 'assistant') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { student_id } = req.body;
  try {
    await pool.query(
      'INSERT INTO enrollments (student_id, subject_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [student_id, req.params.subject_id]
    );
    res.json({ message: '✅ Student enrolled' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// إضافة معيد لمادة (دكتور بس)
router.post('/:subject_id/assistant', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { assistant_id } = req.body;
  try {
    await pool.query(
      'INSERT INTO subject_assistants (assistant_id, subject_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [assistant_id, req.params.subject_id]
    );
    res.json({ message: '✅ Assistant added' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// الطالب يسجل نفسه في مادة
router.post('/:subject_id/self-enroll', auth, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    await pool.query(
      'INSERT INTO enrollments (student_id, subject_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.subject_id]
    );
    res.json({ message: '✅ Enrolled successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// تعديل إعدادات المادة (دكتور بس)
router.patch('/:id/settings', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { allow_second_midterm } = req.body;
  try {
    await pool.query(
      `INSERT INTO subject_settings (subject_id, allow_second_midterm) VALUES ($1, $2)
       ON CONFLICT(subject_id) DO UPDATE SET allow_second_midterm = $2`,
      [req.params.id, allow_second_midterm ? 1 : 0]
    );
    res.json({ message: '✅ Settings updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;