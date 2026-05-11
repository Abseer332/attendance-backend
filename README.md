# Attendance System — Backend

A full-stack academic attendance management system built for universities.
Handles student attendance tracking, grade management, ban detection, and appeals.

## Tech Stack

- **Runtime:** Node.js + Express.js
- **Database:** PostgreSQL
- **Authentication:** JWT
- **File Storage:** Cloudinary
- **AI Assistant:** Google Gemini API
- **Deployment:** Railway

## Features

- 🔐 Role-based authentication (Student / Assistant / Doctor)
- 📋 Session-based attendance tracking (Lecture & Section types)
- ⚠️ Automatic ban detection at 25% absence with warnings at 15%
- 📝 Full grade management with lock system and edit tracking
- 📩 Student appeals system with assistant/doctor responses
- 🔍 Real-time student search with attendance and grade view
- 🤖 AI-powered academic assistant using Gemini API

## Environment Variables
JWT_SECRET=
GEMINI_API_KEY=
DATABASE_URL=
NODE_ENV=production

## Related Repositories

- Frontend: [attendance-frontend](https://github.com/Abseer332/attendance-frontend)
