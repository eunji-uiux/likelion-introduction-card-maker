require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Submit card
app.post('/api/submit', async (req, res) => {
  const { name, department, answers, image } = req.body;
  if (!name || !image) {
    return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
  }

  const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  // Upload image to Supabase Storage
  const base64 = image.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  const { error: uploadError } = await supabase.storage
    .from('cards')
    .upload(`${id}.png`, buffer, { contentType: 'image/png' });

  if (uploadError) {
    console.error('이미지 업로드 실패:', uploadError);
    return res.status(500).json({ error: '이미지 업로드 실패' });
  }

  const { data: urlData } = supabase.storage
    .from('cards')
    .getPublicUrl(`${id}.png`);

  // Save metadata to DB
  const { error: dbError } = await supabase
    .from('submissions')
    .insert({ id, name, department: department || '', answers: answers || [], image_url: urlData.publicUrl });

  if (dbError) {
    console.error('DB 저장 실패:', dbError);
    return res.status(500).json({ error: 'DB 저장 실패' });
  }

  res.json({ success: true, id });
});

// Admin auth middleware
function adminAuth(req, res, next) {
  const pw = req.headers['x-admin-password'] || req.query.pw;
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: '인증 실패' });
  next();
}

// List all submissions
app.get('/api/admin/submissions', adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'DB 조회 실패' });
  res.json(data);
});

// Serve card image (redirect to Storage URL)
app.get('/api/admin/submissions/:id/card.png', adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('submissions')
    .select('image_url, name')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: '파일 없음' });

  if (req.query.dl === '1') {
    const filename = encodeURIComponent(`${data.name}_자기소개카드.png`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    const response = await fetch(data.image_url);
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    return res.send(buffer);
  }

  res.redirect(data.image_url);
});

// Delete submission
app.delete('/api/admin/submissions/:id', adminAuth, async (req, res) => {
  const { error: storageError } = await supabase.storage
    .from('cards')
    .remove([`${req.params.id}.png`]);

  if (storageError) console.warn('Storage 삭제 실패:', storageError);

  const { error: dbError } = await supabase
    .from('submissions')
    .delete()
    .eq('id', req.params.id);

  if (dbError) return res.status(500).json({ error: 'DB 삭제 실패' });
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  console.log(`어드민 페이지: http://localhost:${PORT}/admin.html`);
});
