const express = require('express');
const router = express.Router();
const db = require('../database');
const auth = require('../middleware/auth');

// إضافة أو تعديل درجة
router.post('/', auth, (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { student_id, subject_id, type, number, score, max_score } = req.body;

  if (!student_id || !subject_id || !type || score === undefined || !max_score) {
    return res.status(400).json({ message: 'All fields required' });
  }

  if (req.user.role === 'assistant') {
    const isAssistant = db.prepare(`
      SELECT * FROM subject_assistants 
      WHERE assistant_id = ? AND subject_id = ?
    `).get(req.user.id, subject_id);

    if (!isAssistant) {
      return res.status(403).json({ message: 'Not authorized for this subject' });
    }
  }

  const gradeNumber = number || 1;

  try {
    const existing = db.prepare(`
      SELECT * FROM grades 
      WHERE student_id = ? AND subject_id = ? AND type = ? AND number = ?
    `).get(student_id, subject_id, type, gradeNumber);

    if (existing && existing.locked_by_doctor === 1 && req.user.role === 'assistant') {
      db.prepare(`
        INSERT INTO pending_changes 
        (assistant_id, type, subject_id, student_id, old_value, new_value)
        VALUES (?, 'grade', ?, ?, ?, ?)
      `).run(
        req.user.id,
        subject_id,
        student_id,
        JSON.stringify({ type, number: gradeNumber, score: existing.score, max_score: existing.max_score }),
        JSON.stringify({ type, number: gradeNumber, score, max_score })
      );
      return res.json({ message: '⏳ Change sent to doctor for approval' });
    }

    if (existing) {
      // تعديل درجة موجودة — نحدث updated_by
      db.prepare(`
        INSERT INTO grades (student_id, subject_id, type, number, score, max_score, created_by, updated_by, locked_by_doctor, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(student_id, subject_id, type, number)
        DO UPDATE SET 
          score = excluded.score, 
          max_score = excluded.max_score,
          locked_by_doctor = excluded.locked_by_doctor,
          updated_by = excluded.updated_by,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        student_id, subject_id, type, gradeNumber, score, max_score,
        req.user.id,
        req.user.id,
        req.user.role === 'doctor' ? 1 : 0
      );
    } else {
      // درجة جديدة — created_by و updated_by نفس الشخص
      db.prepare(`
        INSERT INTO grades (student_id, subject_id, type, number, score, max_score, created_by, updated_by, locked_by_doctor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        student_id, subject_id, type, gradeNumber, score, max_score,
        req.user.id,
        req.user.id,
        req.user.role === 'doctor' ? 1 : 0
      );
    }

    res.json({ message: '✅ Grade saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب درجات كل الطلاب في مادة معينة
router.get('/subject/:subject_id', auth, (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }

  try {
    const grades = db.prepare(`
      SELECT 
        u.id,
        u.name,
        u.student_id as student_code,
        g.type,
        g.number,
        g.score,
        g.max_score,
        g.locked_by_doctor,
        ROUND(g.score / g.max_score * 100, 1) as percentage,
        cb.name as created_by_name,
        ub.name as updated_by_name,
        g.updated_at
      FROM grades g
      JOIN users u ON u.id = g.student_id
      LEFT JOIN users cb ON cb.id = g.created_by
      LEFT JOIN users ub ON ub.id = g.updated_by
      WHERE g.subject_id = ?
      ORDER BY u.name, g.type, g.number
    `).all(req.params.subject_id);

    res.json(grades);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب درجات الطالب الحالي
router.get('/student', auth, (req, res) => {
  const studentId = req.user.role === 'student' ? req.user.id : req.query.student_id;

  try {
    const grades = db.prepare(`
      SELECT 
        sub.name as subject_name,
        sub.code as subject_code,
        sub.id as subject_id,
        g.type,
        g.number,
        g.score,
        g.max_score,
        g.locked_by_doctor,
        ROUND(g.score / g.max_score * 100, 1) as percentage,
        cb.name as created_by_name,
        ub.name as updated_by_name,
        g.updated_at
      FROM grades g
      JOIN subjects sub ON sub.id = g.subject_id
      LEFT JOIN users cb ON cb.id = g.created_by
      LEFT JOIN users ub ON ub.id = g.updated_by
      WHERE g.student_id = ?
      ORDER BY sub.name, g.type, g.number
    `).all(studentId);

    res.json(grades);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب درجات طالب في مادة معينة
router.get('/student/:student_id/subject/:subject_id', auth, (req, res) => {
  try {
    const grades = db.prepare(`
      SELECT 
        g.type,
        g.number,
        g.score,
        g.max_score,
        g.locked_by_doctor,
        ROUND(g.score / g.max_score * 100, 1) as percentage,
        cb.name as created_by_name,
        ub.name as updated_by_name,
        g.updated_at
      FROM grades g
      LEFT JOIN users cb ON cb.id = g.created_by
      LEFT JOIN users ub ON ub.id = g.updated_by
      WHERE g.student_id = ? AND g.subject_id = ?
      ORDER BY g.type, g.number
    `).all(req.params.student_id, req.params.subject_id);

    res.json(grades);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب كل التعديلات المعلقة (للدكتور)
router.get('/pending', auth, (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }

  try {
    const changes = db.prepare(`
      SELECT 
        pc.*,
        u.name as assistant_name,
        s.name as student_name,
        sub.name as subject_name
      FROM pending_changes pc
      JOIN users u ON u.id = pc.assistant_id
      JOIN users s ON s.id = pc.student_id
      JOIN subjects sub ON sub.id = pc.subject_id
      WHERE pc.status = 'pending'
      ORDER BY pc.created_at DESC
    `).all();

    res.json(changes);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// الدكتور يوافق أو يرفض
router.patch('/pending/:id', auth, (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { status, doctor_note } = req.body;

  if (!status) {
    return res.status(400).json({ message: 'Status required' });
  }

  try {
    const change = db.prepare('SELECT * FROM pending_changes WHERE id = ?').get(req.params.id);

    if (!change) {
      return res.status(404).json({ message: 'Change not found' });
    }

    if (status === 'approved') {
      const newValue = JSON.parse(change.new_value);
      // لما الدكتور يوافق، updated_by بيتحدد بالمعيد اللي طلب التعديل
      db.prepare(`
        UPDATE grades 
        SET score = ?, max_score = ?, locked_by_doctor = 1, 
            updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE student_id = ? AND subject_id = ? AND type = ? AND number = ?
      `).run(
        newValue.score, newValue.max_score,
        change.assistant_id,
        change.student_id, change.subject_id,
        newValue.type, newValue.number || 1
      );
    }

    db.prepare(`
      UPDATE pending_changes SET status = ?, doctor_note = ?
      WHERE id = ?
    `).run(status, doctor_note || null, req.params.id);

    res.json({ message: `✅ Change ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;