const express = require('express');
const router = express.Router();
const pool = require('../database');
const auth = require('../middleware/auth');

// إنشاء session جديدة وتسجيل حضور الطلاب
router.post('/session', auth, async (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { subject_id, attendance, date, type, session_number } = req.body;
  if (!subject_id || !attendance || !date || !type || !session_number) {
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
  try {
    const session = await pool.query(
      'INSERT INTO sessions (subject_id, date, type, session_number, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [subject_id, date, type, session_number, req.user.id]
    );
    const sessionId = session.rows[0].id;

    await pool.query('UPDATE subjects SET total_sessions = total_sessions + 1 WHERE id = $1', [subject_id]);

    for (const record of attendance) {
      await pool.query(
        'INSERT INTO attendance (session_id, student_id, status) VALUES ($1, $2, $3)',
        [sessionId, record.student_id, record.status]
      );
    }

    res.status(201).json({ message: '✅ Session created', sessionId, bannedStudents: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// تطبيق الحرمان يدوياً (دكتور بس)
router.post('/apply-ban/:subject_id', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const subject = await pool.query('SELECT total_sessions FROM subjects WHERE id = $1', [req.params.subject_id]);
    if (subject.rows.length === 0 || subject.rows[0].total_sessions === 0) {
      return res.status(400).json({ message: 'No sessions yet' });
    }

    const students = await pool.query(
      `SELECT e.student_id,
              COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count
       FROM enrollments e
       LEFT JOIN sessions sess ON sess.subject_id = e.subject_id
       LEFT JOIN attendance a ON a.session_id = sess.id AND a.student_id = e.student_id
       WHERE e.subject_id = $1
       GROUP BY e.student_id`,
      [req.params.subject_id]
    );

    const bannedStudents = [];
    for (const student of students.rows) {
      const absenceRate = student.absent_count / subject.rows[0].total_sessions;
      const shouldBeBanned = absenceRate >= 0.25;
      await pool.query(
        'UPDATE enrollments SET is_banned = $1 WHERE student_id = $2 AND subject_id = $3',
        [shouldBeBanned ? 1 : 0, student.student_id, req.params.subject_id]
      );
      if (shouldBeBanned) bannedStudents.push(student.student_id);
    }

    res.json({ message: '✅ Ban status updated', bannedStudents, total: students.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// إلغاء الحرمان (دكتور بس)
router.post('/remove-ban/:subject_id', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    await pool.query('UPDATE enrollments SET is_banned = 0 WHERE subject_id = $1', [req.params.subject_id]);
    res.json({ message: '✅ All bans removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب كل الطلاب في مادة معينة مع نسبة غيابهم
router.get('/subject/:subject_id', auth, async (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.student_id, e.is_banned, s.total_sessions,
              COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count,
              COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
              ROUND(CAST(COUNT(CASE WHEN a.status = 'absent' THEN 1 END) AS numeric) /
                NULLIF(s.total_sessions, 0) * 100, 1) as absence_percentage
       FROM enrollments e
       JOIN users u ON u.id = e.student_id
       JOIN subjects s ON s.id = e.subject_id
       LEFT JOIN sessions sess ON sess.subject_id = e.subject_id
       LEFT JOIN attendance a ON a.session_id = sess.id AND a.student_id = e.student_id
       WHERE e.subject_id = $1
       GROUP BY u.id, u.name, u.student_id, e.is_banned, s.total_sessions`,
      [req.params.subject_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب غياب طالب معين في كل مواده
router.get('/student', auth, async (req, res) => {
  const studentId = req.user.role === 'student' ? req.user.id : req.query.student_id;
  try {
    const result = await pool.query(
      `SELECT sub.id, sub.name, sub.code, e.is_banned, sub.total_sessions,
              COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count,
              COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
              ROUND(CAST(COUNT(CASE WHEN a.status = 'absent' THEN 1 END) AS numeric) /
                NULLIF(sub.total_sessions, 0) * 100, 1) as absence_percentage
       FROM enrollments e
       JOIN subjects sub ON sub.id = e.subject_id
       LEFT JOIN sessions sess ON sess.subject_id = e.subject_id
       LEFT JOIN attendance a ON a.session_id = sess.id AND a.student_id = e.student_id
       WHERE e.student_id = $1
       GROUP BY sub.id, sub.name, sub.code, e.is_banned, sub.total_sessions`,
      [studentId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب تفاصيل كل session لمادة معينة
router.get('/sessions/:subject_id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sess.id, sess.date, sess.type, sess.session_number, u.name as created_by,
              COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
              COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count
       FROM sessions sess
       JOIN users u ON u.id = sess.created_by
       LEFT JOIN attendance a ON a.session_id = sess.id
       WHERE sess.subject_id = $1
       GROUP BY sess.id, sess.date, sess.type, sess.session_number, u.name
       ORDER BY sess.date DESC`,
      [req.params.subject_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب حضور session معينة
router.get('/session/:session_id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.student_id, a.status, u.name, u.student_id as student_code
       FROM attendance a
       JOIN users u ON u.id = a.student_id
       WHERE a.session_id = $1`,
      [req.params.session_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب sessions الطالب في مادة معينة مع حالته هو
router.get('/sessions/:subject_id/student', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sess.id, sess.date, sess.type, sess.session_number, a.status
       FROM sessions sess
       LEFT JOIN attendance a ON a.session_id = sess.id AND a.student_id = $1
       WHERE sess.subject_id = $2
       ORDER BY sess.date DESC`,
      [req.user.id, req.params.subject_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// تعديل حالة طالب في session معينة
router.patch('/session/:session_id/student/:student_id', auth, async (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const { status } = req.body;
  if (!status || !['present', 'absent'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }
  try {
    await pool.query(
      'UPDATE attendance SET status = $1 WHERE session_id = $2 AND student_id = $3',
      [status, req.params.session_id, req.params.student_id]
    );
    res.json({ message: '✅ Attendance updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;