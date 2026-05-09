const express = require('express');
const router = express.Router();
const db = require('../database');
const auth = require('../middleware/auth');

// جيب كل المواد
router.get('/', auth, (req, res) => {
  try {
    let subjects;

    if (req.user.role === 'doctor') {
      // الدكتور يشوف المواد بتاعته بس
      subjects = db.prepare(`
        SELECT s.*, u.name as doctor_name
        FROM subjects s
        LEFT JOIN users u ON u.id = s.doctor_id
        WHERE s.doctor_id = ?
      `).all(req.user.id);

    } else if (req.user.role === 'assistant') {
      // المعيد يشوف المواد اللي هو معيد فيها بس
      subjects = db.prepare(`
        SELECT s.*, u.name as doctor_name
        FROM subjects s
        LEFT JOIN users u ON u.id = s.doctor_id
        JOIN subject_assistants sa ON sa.subject_id = s.id
        WHERE sa.assistant_id = ?
      `).all(req.user.id);

    } else {
      // الطالب يشوف كل المواد عشان يسجل
      subjects = db.prepare(`
        SELECT s.*, u.name as doctor_name
        FROM subjects s
        LEFT JOIN users u ON u.id = s.doctor_id
      `).all();
    }

    res.json(subjects);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});
// جيب إعدادات المادة
router.get('/:id/settings', auth, (req, res) => {
  try {
    const settings = db.prepare(`
      SELECT * FROM subject_settings WHERE subject_id = ?
    `).get(req.params.id);

    res.json(settings || { subject_id: req.params.id, allow_second_midterm: 0 });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// إضافة مادة جديدة (دكتور بس)
router.post('/', auth, (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { name, code } = req.body;

  if (!name || !code) {
    return res.status(400).json({ message: 'All fields required' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO subjects (name, code, doctor_id)
      VALUES (?, ?, ?)
    `).run(name, code, req.user.id);

    res.status(201).json({ message: '✅ Subject created', subjectId: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      // جيب اسم الدكتور اللي عنده المادة دي
      const existing = db.prepare(`
        SELECT s.name as subject_name, u.name as doctor_name
        FROM subjects s
        JOIN users u ON u.id = s.doctor_id
        WHERE s.code = ?
      `).get(code);

      return res.status(400).json({
        message: `الكود ده موجود بالفعل، المادة "${existing?.subject_name}" عند د. ${existing?.doctor_name}`
      });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// تعديل مادة (دكتور بس)
router.patch('/:id', auth, (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { name, code } = req.body;
  try {
    db.prepare(`
      UPDATE subjects SET name = COALESCE(?, name), code = COALESCE(?, code)
      WHERE id = ?
    `).run(name || null, code || null, req.params.id);
    res.json({ message: '✅ Subject updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// تسجيل طالب في مادة (دكتور أو معيد)
router.post('/:subject_id/enroll', auth, (req, res) => {
  if (req.user.role !== 'doctor' && req.user.role !== 'assistant') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { student_id } = req.body;
  try {
    db.prepare(`
      INSERT OR IGNORE INTO enrollments (student_id, subject_id) VALUES (?, ?)
    `).run(student_id, req.params.subject_id);
    res.json({ message: '✅ Student enrolled' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// إضافة معيد لمادة (دكتور بس)
router.post('/:subject_id/assistant', auth, (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { assistant_id } = req.body;
  try {
    db.prepare(`
      INSERT OR IGNORE INTO subject_assistants (assistant_id, subject_id) VALUES (?, ?)
    `).run(assistant_id, req.params.subject_id);
    res.json({ message: '✅ Assistant added' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// الطالب يسجل نفسه في مادة
router.post('/:subject_id/self-enroll', auth, (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    db.prepare(`
      INSERT OR IGNORE INTO enrollments (student_id, subject_id) VALUES (?, ?)
    `).run(req.user.id, req.params.subject_id);
    res.json({ message: '✅ Enrolled successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// تعديل إعدادات المادة (دكتور بس)
router.patch('/:id/settings', auth, (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { allow_second_midterm } = req.body;

  try {
    db.prepare(`
      INSERT INTO subject_settings (subject_id, allow_second_midterm)
      VALUES (?, ?)
      ON CONFLICT(subject_id)
      DO UPDATE SET allow_second_midterm = excluded.allow_second_midterm
    `).run(req.params.id, allow_second_midterm ? 1 : 0);

    res.json({ message: '✅ Settings updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;