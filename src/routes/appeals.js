const express = require('express');
const router = express.Router();
const db = require('../database');
const auth = require('../middleware/auth');

// الطالب يبعت تظلم
    router.post('/', auth, (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ message: 'Only students can submit appeals' });
    }

    const { subject_id, message } = req.body;

    if (!subject_id || !message) {
        return res.status(400).json({ message: 'All fields required' });
    }

    try {
        const result = db.prepare(`
        INSERT INTO appeals (student_id, subject_id, message)
        VALUES (?, ?, ?)
        `).run(req.user.id, subject_id, message);

        res.status(201).json({ message: '✅ Appeal submitted', appealId: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
    });

    // جيب كل التظلمات (للمعيد والدكتور)
    router.get('/', auth, (req, res) => {
    if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
        return res.status(403).json({ message: 'Not authorized' });
    }

    try {
        const appeals = db.prepare(`
        SELECT 
            a.id,
            a.message,
            a.status,
            a.response,
            a.created_at,
            u.name as student_name,
            u.student_id as student_code,
            sub.name as subject_name,
            sub.code as subject_code
        FROM appeals a
        JOIN users u ON u.id = a.student_id
        JOIN subjects sub ON sub.id = a.subject_id
        ORDER BY a.created_at DESC
        `).all();

        res.json(appeals);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
    });

    // جيب تظلمات الطالب الحالي
    router.get('/my', auth, (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ message: 'Not authorized' });
    }

    try {
        const appeals = db.prepare(`
        SELECT 
            a.id,
            a.message,
            a.status,
            a.response,
            a.created_at,
            sub.name as subject_name,
            sub.code as subject_code
        FROM appeals a
        JOIN subjects sub ON sub.id = a.subject_id
        WHERE a.student_id = ?
        ORDER BY a.created_at DESC
        `).all(req.user.id);

        res.json(appeals);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
    });

    // المعيد أو الدكتور يرد على تظلم
    router.patch('/:id', auth, (req, res) => {
    if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
        return res.status(403).json({ message: 'Not authorized' });
    }

    const { status, response } = req.body;

    if (!status || !response) {
        return res.status(400).json({ message: 'Status and response required' });
    }

    try {
        db.prepare(`
        UPDATE appeals 
        SET status = ?, response = ?
        WHERE id = ?
        `).run(status, response, req.params.id);

        res.json({ message: '✅ Appeal updated' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
    });

module.exports = router;