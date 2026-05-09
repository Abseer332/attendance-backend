const express = require('express');
const router = express.Router();
const pool = require('../database');
const auth = require('../middleware/auth');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { Readable } = require('stream');

// إعداد Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// multer بيحفظ في الميموري مش على القرص
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Images only'));
  },
});

// رفع الصورة على Cloudinary
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'attendance-avatars' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    Readable.from(buffer).pipe(stream);
  });
};

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
    const result = await uploadToCloudinary(req.file.buffer);
    const avatarUrl = result.secure_url;
    await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatarUrl, req.user.id]);
    res.json({ message: '✅ Avatar updated', avatar: avatarUrl });
  } catch (err) {
    console.error(err);
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