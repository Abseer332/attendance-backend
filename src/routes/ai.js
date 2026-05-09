const express = require('express');
const router = express.Router();
const pool = require('../database');
const auth = require('../middleware/auth');
const axios = require('axios');

router.post('/chat', auth, async (req, res) => {
  const { message, lang } = req.body;
  if (!message) {
    return res.status(400).json({ message: 'Message required' });
  }

  try {
    const attendanceResult = await pool.query(
      `SELECT sub.name as subject_name, sub.code, e.is_banned, sub.total_sessions,
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
      [req.user.id]
    );

    const gradesResult = await pool.query(
      `SELECT sub.name as subject_name, g.type, g.number, g.score, g.max_score,
              ROUND(CAST(g.score / g.max_score * 100 AS numeric), 1) as percentage
       FROM grades g
       JOIN subjects sub ON sub.id = g.subject_id
       WHERE g.student_id = $1
       ORDER BY sub.name, g.type, g.number`,
      [req.user.id]
    );

    const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);

    const prompt = `You are an academic assistant for student ${userResult.rows[0].name}.
Their data:

Attendance:
${JSON.stringify(attendanceResult.rows, null, 2)}

Grades:
${JSON.stringify(gradesResult.rows, null, 2)}

${lang === 'en'
  ? 'Reply in English. Be brief and helpful. Warn the student if they are banned from any exam.'
  : 'رد بالعربي بشكل مختصر ومفيد. لو الطالب محروم من مادة نبهه.'
}

Student question: ${message}`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await axios.post(
      apiUrl,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'مش قادر أرد دلوقتي';
    res.json({ reply });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;