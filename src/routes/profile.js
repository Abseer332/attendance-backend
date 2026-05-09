const express = require('express');
const router = express.Router();
const pool = require('../database');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `user_${req.user.id}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Images only'));
  },
});

// جيب بيانات البروفايل
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, student_id, avatar, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// رفع صورة
router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  try {
    const avatarUrl = `/uploads/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatarUrl, req.user.id]);
    res.json({ message: '✅ Avatar updated', avatar: avatarUrl });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// تعديل الاسم
router.patch('/', auth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Name required' });
  try {
    await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, req.user.id]);
    res.json({ message: '✅ Profile updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;