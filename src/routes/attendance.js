const express = require('express');
const router = express.Router();
const db = require('../database');
const auth = require('../middleware/auth');

// إنشاء session جديدة وتسجيل حضور الطلاب
router.post('/session', auth, (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { subject_id, attendance, date, type, session_number } = req.body;

  if (!subject_id || !attendance || !date || !type || !session_number) {
    return res.status(400).json({ message: 'All fields required' });
  }

  // تحقق إن المعيد معيد في المادة دي
  if (req.user.role === 'assistant') {
    const isAssistant = db.prepare(`
      SELECT * FROM subject_assistants 
      WHERE assistant_id = ? AND subject_id = ?
    `).get(req.user.id, subject_id);

    if (!isAssistant) {
      return res.status(403).json({ message: 'Not authorized for this subject' });
    }
  }

  try {
    const session = db.prepare(`
      INSERT INTO sessions (subject_id, date, type, session_number, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(subject_id, date, type, session_number, req.user.id);

    const sessionId = session.lastInsertRowid;

    db.prepare(`
      UPDATE subjects SET total_sessions = total_sessions + 1 WHERE id = ?
    `).run(subject_id);

    const insertAttendance = db.prepare(`
      INSERT INTO attendance (session_id, student_id, status) VALUES (?, ?, ?)
    `);

    const insertMany = db.transaction((records) => {
      for (const record of records) {
        insertAttendance.run(sessionId, record.student_id, record.status);
      }
    });

    insertMany(attendance);

    res.status(201).json({ message: '✅ Session created', sessionId, bannedStudents: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// تطبيق الحرمان يدوياً (دكتور بس)
router.post('/apply-ban/:subject_id', auth, (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }

  try {
    const subject = db.prepare('SELECT total_sessions FROM subjects WHERE id = ?')
      .get(req.params.subject_id);

    if (!subject || subject.total_sessions === 0) {
      return res.status(400).json({ message: 'No sessions yet' });
    }

    const students = db.prepare(`
      SELECT 
        e.student_id,
        COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count
      FROM enrollments e
      LEFT JOIN sessions sess ON sess.subject_id = e.subject_id
      LEFT JOIN attendance a ON a.session_id = sess.id AND a.student_id = e.student_id
      WHERE e.subject_id = ?
      GROUP BY e.student_id
    `).all(req.params.subject_id);

    const bannedStudents = [];

    for (const student of students) {
      const absenceRate = student.absent_count / subject.total_sessions;
      const shouldBeBanned = absenceRate >= 0.25;

      db.prepare(`
        UPDATE enrollments SET is_banned = ?
        WHERE student_id = ? AND subject_id = ?
      `).run(shouldBeBanned ? 1 : 0, student.student_id, req.params.subject_id);

      if (shouldBeBanned) bannedStudents.push(student.student_id);
    }

    res.json({
      message: '✅ Ban status updated',
      bannedStudents,
      total: students.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// إلغاء الحرمان (دكتور بس)
router.post('/remove-ban/:subject_id', auth, (req, res) => {
    if (req.user.role !== 'doctor') {
        return res.status(403).json({ message: 'Not authorized' });
    }

    try {
        db.prepare(`
        UPDATE enrollments SET is_banned = 0
        WHERE subject_id = ?
        `).run(req.params.subject_id);

        res.json({ message: '✅ All bans removed' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
    });

// جيب كل الطلاب في مادة معينة مع نسبة غيابهم
router.get('/subject/:subject_id', auth, (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }

  try {
    const students = db.prepare(`
      SELECT 
        u.id,
        u.name,
        u.student_id,
        e.is_banned,
        s.total_sessions,
        COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count,
        COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
        ROUND(
          CAST(COUNT(CASE WHEN a.status = 'absent' THEN 1 END) AS FLOAT) / 
          NULLIF(s.total_sessions, 0) * 100, 1
        ) as absence_percentage
      FROM enrollments e
      JOIN users u ON u.id = e.student_id
      JOIN subjects s ON s.id = e.subject_id
      LEFT JOIN sessions sess ON sess.subject_id = e.subject_id
      LEFT JOIN attendance a ON a.session_id = sess.id AND a.student_id = e.student_id
      WHERE e.subject_id = ?
      GROUP BY u.id
    `).all(req.params.subject_id);

    res.json(students);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب غياب طالب معين في كل مواده
router.get('/student', auth, (req, res) => {
  const studentId = req.user.role === 'student' ? req.user.id : req.query.student_id;

  try {
    const subjects = db.prepare(`
      SELECT 
        sub.id,
        sub.name,
        sub.code,
        e.is_banned,
        sub.total_sessions,
        COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count,
        COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
        ROUND(
          CAST(COUNT(CASE WHEN a.status = 'absent' THEN 1 END) AS FLOAT) / 
          NULLIF(sub.total_sessions, 0) * 100, 1
        ) as absence_percentage
      FROM enrollments e
      JOIN subjects sub ON sub.id = e.subject_id
      LEFT JOIN sessions sess ON sess.subject_id = e.subject_id
      LEFT JOIN attendance a ON a.session_id = sess.id AND a.student_id = e.student_id
      WHERE e.student_id = ?
      GROUP BY sub.id
    `).all(studentId);

    res.json(subjects);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب تفاصيل كل session لمادة معينة
router.get('/sessions/:subject_id', auth, (req, res) => {
  try {
    const sessions = db.prepare(`
      SELECT 
        sess.id,
        sess.date,
        sess.type,
        sess.session_number,
        u.name as created_by,
        COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
        COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count
      FROM sessions sess
      JOIN users u ON u.id = sess.created_by
      LEFT JOIN attendance a ON a.session_id = sess.id
      WHERE sess.subject_id = ?
      GROUP BY sess.id
      ORDER BY sess.date DESC
    `).all(req.params.subject_id);

    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب حضور session معينة
router.get('/session/:session_id', auth, (req, res) => {
  try {
    const attendance = db.prepare(`
      SELECT 
        a.student_id,
        a.status,
        u.name,
        u.student_id as student_code
      FROM attendance a
      JOIN users u ON u.id = a.student_id
      WHERE a.session_id = ?
    `).all(req.params.session_id);

    res.json(attendance);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// جيب sessions الطالب في مادة معينة مع حالته هو
router.get('/sessions/:subject_id/student', auth, (req, res) => {
  const studentId = req.user.id;
  try {
    const sessions = db.prepare(`
      SELECT 
        sess.id,
        sess.date,
        sess.type,
        sess.session_number,
        a.status
      FROM sessions sess
      LEFT JOIN attendance a ON a.session_id = sess.id AND a.student_id = ?
      WHERE sess.subject_id = ?
      ORDER BY sess.date DESC
    `).all(studentId, req.params.subject_id);

    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// تعديل حالة طالب في session معينة
router.patch('/session/:session_id/student/:student_id', auth, (req, res) => {
  if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const { status } = req.body;

  if (!status || !['present', 'absent'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    db.prepare(`
      UPDATE attendance SET status = ?
      WHERE session_id = ? AND student_id = ?
    `).run(status, req.params.session_id, req.params.student_id);

    res.json({ message: '✅ Attendance updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;