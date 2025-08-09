import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import Database from 'better-sqlite3';
import crypto from 'crypto';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const db = new Database(process.env.DATABASE_URL || './data/app.db');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  tg_id TEXT UNIQUE,
  name TEXT,
  username TEXT,
  language_code TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT,
  stage TEXT,
  owner TEXT,
  value TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  title TEXT,
  tag TEXT,
  due TEXT,
  status TEXT
);
`);

function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const obj = {};
  for (const [k, v] of params) obj[k] = v;
  return obj;
}
function checkTelegramAuth(initData, botToken) {
  const data = parseInitData(initData);
  const hash = data.hash;
  delete data.hash;
  const sorted = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const _hash = crypto.createHmac('sha256', secret).update(sorted).digest('hex');
  return _hash === hash ? data : null;
}
function issueJWT(user) {
  return jwt.sign({ uid: user.tg_id, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
}
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies['auth'];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

// auth via Telegram WebApp initData
app.post('/api/auth/telegram', (req, res) => {
  const { initData } = req.body || {};
  if (!initData) return res.status(400).json({ error: 'initData required' });
  const data = checkTelegramAuth(initData, process.env.BOT_TOKEN);
  if (!data) return res.status(401).json({ error: 'auth_failed' });

  const userData = JSON.parse(data.user);
  db.prepare('INSERT OR IGNORE INTO users (tg_id, name, username, language_code) VALUES (?, ?, ?, ?)')
    .run(String(userData.id), `${userData.first_name || ''} ${userData.last_name || ''}`.trim(), userData.username || null, userData.language_code || null);

  const token = issueJWT({ tg_id: String(userData.id), name: userData.first_name });
  res.cookie('auth', token, { httpOnly: true, sameSite: 'lax' });
  return res.json({ ok: true, token });
});

// CRM
app.get('/api/crm/clients', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM clients ORDER BY id DESC LIMIT 100').all();
  res.json(rows);
});
app.post('/api/crm/clients', authMiddleware, (req, res) => {
  const { name, stage, owner, value } = req.body || {};
  const info = db.prepare('INSERT INTO clients (name, stage, owner, value) VALUES (?, ?, ?, ?)').run(name, stage, owner, value);
  res.json({ id: info.lastInsertRowid });
});

// Tasks
app.get('/api/tasks', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT 200').all();
  res.json(rows);
});
app.post('/api/tasks', authMiddleware, (req, res) => {
  const { title, tag, due, status } = req.body || {};
  const info = db.prepare('INSERT INTO tasks (title, tag, due, status) VALUES (?, ?, ?, ?)').run(title, tag, due, status);
  res.json({ id: info.lastInsertRowid });
});

// Import placeholder
const upload = multer({ dest: 'uploads/' });
app.post('/api/import/upload', authMiddleware, upload.single('file'), (req, res) => {
  res.json({ ok: true, file: req.file?.filename });
});

// Crypto / News placeholders
app.get('/api/crypto/portfolio', authMiddleware, (req, res) => {
  res.json([
    { symbol: 'BTC', price: 62100, change: 2.1 },
    { symbol: 'ETH', price: 3250, change: -0.8 },
  ]);
});
app.get('/api/news/feed', authMiddleware, (req, res) => {
  res.json([{ id: 1, title: 'Официальный анонс', source: 'Company Blog', ts: Date.now() - 5 * 60 * 1000 }]);
});

app.get('/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API running on :${port}`));
