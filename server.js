require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 25 * 1024 * 1024 }
});

async function transcribeWithGroq(filePath, originalName) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath), originalName);
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'verbose_json'); // Vaqt segmentlari uchun majburiy

  const response = await axios.post(
    'https://api.groq.com/openai/v1/audio/transcriptions',
    formData,
    {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        ...formData.getHeaders()
      },
      timeout: 120000
    }
  );

  // Segmentlarni formatlash (vaqt|matn ko'rinishida)
  if (response.data && response.data.segments) {
    return response.data.segments.map(seg => {
      const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
      };
      return `${formatTime(seg.start)}|${seg.text.trim()}`;
    }).join('\n');
  }

  return response.data.text || '';
}

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'Fayl topilmadi' });
  const filePath = req.file.path;
  try {
    const text = await transcribeWithGroq(filePath, req.file.originalname);
    res.json({ success: true, text });
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err.message;
    console.error('Xato:', msg);
    res.status(500).json({ success: false, error: msg });
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

app.post('/api/transcribe-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'URL kiritilmadi' });

  const tmpPath = path.join(uploadDir, `tmp_${Date.now()}.mp3`);
  try {
    const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 30000 });
    const writer = fs.createWriteStream(tmpPath);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    const fileName = url.split('/').pop() || 'audio.mp3';
    const text = await transcribeWithGroq(tmpPath, fileName);
    res.json({ success: true, text });
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err.message;
    console.error('Xato:', msg);
    res.status(500).json({ success: false, error: msg });
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

app.listen(PORT, () => console.log(`✅ Server: http://localhost:${PORT}`));