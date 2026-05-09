const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
require('dotenv').config();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/grades', require('./routes/grades'));
app.use('/api/appeals', require('./routes/appeals'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/profile', require('./routes/profile'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Test route
app.get('/', (req, res) => {
  res.json({ message: '✅ Server is running' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});