const express = require('express');
const router = express.Router();
const pool = require('../database');
const auth = require('../middleware/auth');

// إضافة أو تعديل درجة
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { student_id, subject_id, type, number, score, max_score } = req.body;

  if (!student_id || !subject_id || !type || score === undefined || !max_score) {
    return res.status(400).json({ message: 'All fields required' });
  }

  if (req.user.role === 'assistant') {
    const check = await pool.query(
      'SELECT * FROM subject_assistants WHERE assistant_id = $1 AND subject_id = $2',
      [req.user.id, subject_id]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ message: 'Not authorized for this subject' });
    }
  }

  const gradeNumber = number || 1;

  try {
    const existing = await pool.query(
      'SELECT * FROM grades WHERE student_id = $1 AND subject_id = $2 AND type = $3 AND number = $4',
      [student_id, subject_id, type, gradeNumber]
    );

    if (existing.rows.length > 0 && existing.rows[0].locked_by_doctor === 1 && req.user.role === 'assistant') {
      await pool.query(
        `INSERT INTO pending_changes (assistant_id, type, subject_id, student_id, old_value, new_value)
         VALUES ($1, 'grade', $2, $3, $4, $5)`,
        [
          req.user.id, subject_id, student_id,
          JSON.stringify({ type, number: gradeNumber, score: existing.rows[0].score, max_score: existing.rows[0].max_score }),
          JSON.stringify({ type, number: gradeNumber, score, max_score })
        ]
      );
      return res.json({ message: '⏳ Change sent to doctor for approval' });
    }

    await pool.query(
      `INSERT INTO grades (student_id, subject_id, type, number, score, max_score, created_by, updated_by, locked_by_doctor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
       ON CONFLICT(student_id, subject_id, type, number)
       DO UPDATE SET score = $5, max_score = $6, locked_by_doctor = $8, updated_by = $7, updated_at = CURRENT_TIMESTAMP`,
      [student_id, subject_id, type, gradeNumber, score, max_score, req.user.id, req.user.role === 'doctor' ? 1 : 0]
    );

    res.json({ message: '✅ Grade saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب درجات كل الطلاب في مادة معينة
router.get('/subject/:subject_id', auth, async (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.student_id as student_code,
              g.type, g.number, g.score, g.max_score, g.locked_by_doctor,
              ROUND(CAST(g.score / g.max_score * 100 AS numeric), 1) as percentage,
              cb.name as created_by_name, ub.name as updated_by_name, g.updated_at
       FROM grades g
       JOIN users u ON u.id = g.student_id
       LEFT JOIN users cb ON cb.id = g.created_by
       LEFT JOIN users ub ON ub.id = g.updated_by
       WHERE g.subject_id = $1
       ORDER BY u.name, g.type, g.number`,
      [req.params.subject_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب درجات الطالب الحالي
router.get('/student', auth, async (req, res) => {
  const studentId = req.user.role === 'student' ? req.user.id : req.query.student_id;
  try {
    const result = await pool.query(
      `SELECT sub.name as subject_name, sub.code as subject_code, sub.id as subject_id,
              g.type, g.number, g.score, g.max_score, g.locked_by_doctor,
              ROUND(CAST(g.score / g.max_score * 100 AS numeric), 1) as percentage,
              cb.name as created_by_name, ub.name as updated_by_name, g.updated_at
       FROM grades g
       JOIN subjects sub ON sub.id = g.subject_id
       LEFT JOIN users cb ON cb.id = g.created_by
       LEFT JOIN users ub ON ub.id = g.updated_by
       WHERE g.student_id = $1
       ORDER BY sub.name, g.type, g.number`,
      [studentId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب درجات طالب في مادة معينة
router.get('/student/:student_id/subject/:subject_id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.type, g.number, g.score, g.max_score, g.locked_by_doctor,
              ROUND(CAST(g.score / g.max_score * 100 AS numeric), 1) as percentage,
              cb.name as created_by_name, ub.name as updated_by_name, g.updated_at
       FROM grades g
       LEFT JOIN users cb ON cb.id = g.created_by
       LEFT JOIN users ub ON ub.id = g.updated_by
       WHERE g.student_id = $1 AND g.subject_id = $2
       ORDER BY g.type, g.number`,
      [req.params.student_id, req.params.subject_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب كل التعديلات المعلقة (للدكتور)
router.get('/pending', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const result = await pool.query(
      `SELECT pc.*, u.name as assistant_name, s.name as student_name, sub.name as subject_name
       FROM pending_changes pc
       JOIN users u ON u.id = pc.assistant_id
       JOIN users s ON s.id = pc.student_id
       JOIN subjects sub ON sub.id = pc.subject_id
       WHERE pc.status = 'pending'
       ORDER BY pc.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// الدكتور يوافق أو يرفض
router.patch('/pending/:id', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { status, doctor_note } = req.body;
  if (!status) return res.status(400).json({ message: 'Status required' });

  try {
    const change = await pool.query('SELECT * FROM pending_changes WHERE id = $1', [req.params.id]);
    if (change.rows.length === 0) return res.status(404).json({ message: 'Change not found' });

    if (status === 'approved') {
      const newValue = JSON.parse(change.rows[0].new_value);
      await pool.query(
        `UPDATE grades SET score = $1, max_score = $2, locked_by_doctor = 1,
                          updated_by = $3, updated_at = CURRENT_TIMESTAMP
         WHERE student_id = $4 AND subject_id = $5 AND type = $6 AND number = $7`,
        [newValue.score, newValue.max_score, change.rows[0].assistant_id,
         change.rows[0].student_id, change.rows[0].subject_id,
         newValue.type, newValue.number || 1]
      );
    }

    await pool.query(
      'UPDATE pending_changes SET status = $1, doctor_note = $2 WHERE id = $3',
      [status, doctor_note || null, req.params.id]
    );

    res.json({ message: `✅ Change ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;