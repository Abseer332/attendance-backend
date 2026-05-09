const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const auth = require('../middleware/auth');

// Register
router.post('/register', (req, res) => {
    const { name, email, password, role, student_id } = req.body;

    if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields required' });
    }

    try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const stmt = db.prepare(`
        INSERT INTO users (name, email, password, role, student_id)
        VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, email, hashedPassword, role, student_id || null);

    res.status(201).json({ message: '✅ User created', userId: result.lastInsertRowid });
    } catch (err) {
    if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error' });
    }
});

// Login
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
    return res.status(400).json({ message: 'All fields required' });
    }

    try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

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
        user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        student_id: user.student_id
        }
    });
    } catch (err) {
    res.status(500).json({ message: 'Server error' });
    }
});

// Get current user
router.get('/me', require('../middleware/auth'), (req, res) => {
    const user = db.prepare('SELECT id, name, email, role, student_id FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
});

// البحث عن طلاب
router.get('/search', auth, (req, res) => {
    if (req.user.role !== 'assistant' && req.user.role !== 'doctor') {
        return res.status(403).json({ message: 'Not authorized' });
    }

    const { q } = req.query;
    if (!q) return res.json([]);

    try {
        const students = db.prepare(`
        SELECT id, name, email, student_id, avatar
        FROM users
        WHERE role = 'student'
        AND (name LIKE ? OR student_id LIKE ?)
        LIMIT 20
        `).all(`%${q}%`, `%${q}%`);

        res.json(students);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// جيب كل المستخدمين (دكتور بس)
router.get('/users', auth, (req, res) => {
    if (req.user.role !== 'doctor') {
        return res.status(403).json({ message: 'Not authorized' });
    }

    try {
        const users = db.prepare(`
        SELECT id, name, email, role, student_id FROM users
        `).all();

        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;