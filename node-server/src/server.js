/**
 * Express API server.
 * Endpoints:
 *  GET  /api/health
 *  GET  /api/sample-data
 *  GET  /api/sample-data/<path>
 *  GET  /api/configs
 *  GET  /api/configs/:name
 *  POST /api/transform           JSON body: { files:[{name,content,encoding?}], config }
 *  POST /api/transform/sample    JSON body: { config }
 *  POST /api/transform/upload    multipart/form-data: files[] + config (JSON string field)
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { runPipeline } = require('./transformer/pipeline');
const { validateConfig } = require('./transformer/validate-config');
const { extractText } = require('./sources/resume_doc');

const PORT = process.env.NODE_PORT || 8002;
const ROOT = path.join(__dirname, '..');
const SAMPLE_DIR = path.join(ROOT, 'sample-data');
const CONFIG_DIR = path.join(ROOT, 'configs');

const BINARY_MIME = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
};

const app = express();
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '20mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
});

function listAllFiles(dir, prefix = '') {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.join(prefix, e.name);
    if (e.isDirectory()) out.push(...listAllFiles(full, rel));
    else out.push(rel);
  }
  return out;
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'candidate-transformer',
    node: process.version,
    supported_formats: ['.csv', '.json', '.txt', '.pdf', '.docx'],
  });
});

app.get('/api/sample-data', (req, res) => {
  const files = listAllFiles(SAMPLE_DIR).map((rel) => ({
    name: rel.replace(/\\/g, '/'),
    size: fs.statSync(path.join(SAMPLE_DIR, rel)).size,
  }));
  res.json({ files });
});

// Extract readable text from a binary sample file (pdf/docx) for preview.
app.get('/api/sample-data/extract/*', async (req, res) => {
  const rel = req.params[0];
  const full = path.resolve(SAMPLE_DIR, rel);
  if (!full.startsWith(SAMPLE_DIR)) return res.status(400).json({ error: 'bad path' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'not found' });
  try {
    const text = await extractText(full, fs.readFileSync(full));
    res.json({ text });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/sample-data/*', (req, res) => {
  const rel = req.params[0];
  const full = path.resolve(SAMPLE_DIR, rel);
  if (!full.startsWith(SAMPLE_DIR)) return res.status(400).json({ error: 'bad path' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'not found' });
  const ext = path.extname(full).toLowerCase();
  if (BINARY_MIME[ext]) {
    res.type(BINARY_MIME[ext]);
    return res.send(fs.readFileSync(full));
  }
  res.type('text/plain').send(fs.readFileSync(full, 'utf8'));
});

app.get('/api/configs', (req, res) => {
  const files = fs.existsSync(CONFIG_DIR)
    ? fs.readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json'))
    : [];
  const items = files.map((name) => ({
    name,
    config: JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), 'utf8')),
  }));
  res.json({ configs: items });
});

app.get('/api/configs/:name', (req, res) => {
  const file = path.join(CONFIG_DIR, req.params.name);
  if (!file.startsWith(CONFIG_DIR) || !fs.existsSync(file)) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
});

app.post('/api/configs/validate', (req, res) => {
  const { config } = req.body || {};
  res.json(validateConfig(config));
});

// Extract readable text from an uploaded binary file (pdf/docx) for preview.
app.post('/api/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const text = await extractText(req.file.originalname, req.file.buffer);
    res.json({ text });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/transform', async (req, res) => {
  try {
    const { files = [], urls = [], config, enrich } = req.body || {};
    const result = await runPipeline({ files, urls, config, enrich: enrich !== false });
    res.json({ generated_at: new Date().toISOString(), stats: result.stats, profiles: result.profiles });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/transform/sample', async (req, res) => {
  try {
    const { config } = req.body || {};
    const result = await runPipeline({ inputsDir: SAMPLE_DIR, config });
    res.json({ generated_at: new Date().toISOString(), stats: result.stats, profiles: result.profiles });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/transform/upload', upload.array('files', 20), async (req, res) => {
  try {
    let config = null;
    if (req.body && req.body.config) {
      try { config = typeof req.body.config === 'string' ? JSON.parse(req.body.config) : req.body.config; }
      catch (e) { return res.status(400).json({ error: `Invalid config JSON: ${e.message}` }); }
    }
    let urls = [];
    if (req.body && req.body.urls) {
      try {
        urls = typeof req.body.urls === 'string' ? JSON.parse(req.body.urls) : req.body.urls;
        if (!Array.isArray(urls)) urls = [];
      } catch (_) { urls = []; }
    }
    const enrich = req.body?.enrich !== 'false';
    const files = (req.files || []).map((f) => ({ name: f.originalname, content: f.buffer }));
    const result = await runPipeline({ files, urls, config, enrich });
    res.json({ generated_at: new Date().toISOString(), stats: result.stats, profiles: result.profiles });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[candidate-transformer] Express API listening on :${PORT}`);
});
