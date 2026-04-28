const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const SUBMISSIONS_DIR = path.join(__dirname, 'submissions');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

if (!fs.existsSync(SUBMISSIONS_DIR)) {
  fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
}

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Submit card
app.post('/api/submit', (req, res) => {
  const { name, department, answers, image } = req.body;
  if (!name || !image) {
    return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
  }

  const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const dir = path.join(SUBMISSIONS_DIR, id);
  fs.mkdirSync(dir);

  const meta = { id, name, department: department || '', answers: answers || [], createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));

  const base64 = image.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(dir, 'card.png'), base64, 'base64');

  res.json({ success: true, id });
});

// Admin auth middleware
function adminAuth(req, res, next) {
  const pw = req.headers['x-admin-password'] || req.query.pw;
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: '인증 실패' });
  next();
}

// List all submissions
app.get('/api/admin/submissions', adminAuth, (req, res) => {
  if (!fs.existsSync(SUBMISSIONS_DIR)) return res.json([]);

  const submissions = fs.readdirSync(SUBMISSIONS_DIR)
    .filter(d => fs.existsSync(path.join(SUBMISSIONS_DIR, d, 'meta.json')))
    .map(d => JSON.parse(fs.readFileSync(path.join(SUBMISSIONS_DIR, d, 'meta.json'), 'utf8')))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(submissions);
});

// Serve card image (thumbnail or download)
app.get('/api/admin/submissions/:id/card.png', adminAuth, (req, res) => {
  const cardPath = path.join(SUBMISSIONS_DIR, req.params.id, 'card.png');
  const metaPath = path.join(SUBMISSIONS_DIR, req.params.id, 'meta.json');

  if (!fs.existsSync(cardPath)) return res.status(404).json({ error: '파일 없음' });

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  res.setHeader('Content-Type', 'image/png');

  if (req.query.dl === '1') {
    const filename = encodeURIComponent(`${meta.name}_자기소개카드.png`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
  }

  res.sendFile(cardPath);
});

// Delete submission
app.delete('/api/admin/submissions/:id', adminAuth, (req, res) => {
  const dir = path.join(SUBMISSIONS_DIR, req.params.id);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: '없음' });
  fs.rmSync(dir, { recursive: true });
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  console.log(`어드민 비밀번호: ${ADMIN_PASSWORD}`);
  console.log(`어드민 페이지: http://localhost:${PORT}/admin.html`);
});
