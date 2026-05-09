const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../database.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'assistant', 'doctor')),
    student_id TEXT UNIQUE,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    doctor_id INTEGER REFERENCES users(id),
    total_sessions INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER REFERENCES users(id),
    subject_id INTEGER REFERENCES subjects(id),
    is_banned INTEGER DEFAULT 0,
    UNIQUE(student_id, subject_id)
  );

  CREATE TABLE IF NOT EXISTS subject_assistants (
    assistant_id INTEGER REFERENCES users(id),
    subject_id INTEGER REFERENCES subjects(id),
    PRIMARY KEY (assistant_id, subject_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER REFERENCES subjects(id),
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('lecture', 'section')),
    session_number INTEGER NOT NULL,
    created_by INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id),
    student_id INTEGER REFERENCES users(id),
    status TEXT NOT NULL CHECK(status IN ('present', 'absent')),
    UNIQUE(session_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER REFERENCES users(id),
    subject_id INTEGER REFERENCES subjects(id),
    type TEXT NOT NULL CHECK(type IN ('quiz', 'midterm', 'final', 'practical')),
    number INTEGER DEFAULT 1,
    score REAL NOT NULL,
    max_score REAL NOT NULL,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    locked_by_doctor INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, subject_id, type, number)
  );

  CREATE TABLE IF NOT EXISTS appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER REFERENCES users(id),
    subject_id INTEGER REFERENCES subjects(id),
    message TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pending_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assistant_id INTEGER REFERENCES users(id),
    type TEXT NOT NULL CHECK(type IN ('grade', 'attendance', 'ban')),
    subject_id INTEGER REFERENCES subjects(id),
    student_id INTEGER REFERENCES users(id),
    old_value TEXT,
    new_value TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    doctor_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subject_settings (
    subject_id INTEGER PRIMARY KEY REFERENCES subjects(id),
    allow_second_midterm INTEGER DEFAULT 0
  );
`);

// إضافة الـ columns الجديدة لو مش موجودة (للـ databases الموجودة)
try {
  db.exec(`ALTER TABLE grades ADD COLUMN updated_by INTEGER REFERENCES users(id)`);
  console.log('✅ Added updated_by column');
} catch (e) {
  // Column موجود بالفعل
}

try {
  db.exec(`ALTER TABLE grades ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
  console.log('✅ Added updated_at column');
} catch (e) {
  // Column موجود بالفعل
}

console.log('✅ Database ready');

module.exports = db;