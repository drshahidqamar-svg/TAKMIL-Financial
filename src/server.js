// ───────────────────────────────────────────────────────────────
// server.js — Express app: serves the frontend + the JSON API.
// ───────────────────────────────────────────────────────────────
import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'dotenv/config';

import { ensureSeed } from './seed.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import modelRoutes from './routes/model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Railway terminates TLS upstream; trust the proxy so secure cookies work.
app.set('trust proxy', 1);

app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/model', modelRoutes);

// Serve the static frontend.
app.use(express.static(join(__dirname, '..', 'public')));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

// Run migration + seed, THEN start listening.
ensureSeed()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  TAKMIL backend running → port ${PORT}`);
      console.log(`  API base               → /api`);
      console.log(`  Frontend               → /\n`);
    });
  })
  .catch(err => {
    console.error('  ✗ Startup failed:', err.message);
    process.exit(1);
  });
