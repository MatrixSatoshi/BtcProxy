
const express = require('express');
const cors = require('cors');
 
const app = express();
const PORT = process.env.PORT || 3000;
const BG_TOKEN = process.env.BG_TOKEN || 'lBcKKHCEx1';
 
app.use(cors());
app.use(express.json());
 
const cache = {};
const CACHE_TTL = 6 * 60 * 60 * 1000;
 
async function bgFetch(endpoint) {
  const now = Date.now();
  if (cache[endpoint] && now - cache[endpoint].ts < CACHE_TTL) {
    return cache[endpoint].data;
  }
  const url = `https://api.bgeometrics.com/v1/${endpoint}?token=${BG_TOKEN}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`BG API error: ${resp.status} for ${endpoint}`);
  const data = await resp.json();
  cache[endpoint] = { data, ts: now };
  return data;
}
 
function getLast(data) {
  return Array.isArray(data) ? data[data.length - 1] : data;
}
 
function pickVal(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const skip = ['date', 'time', 'timestamp', 'id', 'block', 'created', 'updated'];
  // Try all values — return last numeric non-date field
  const entries = Object.entries(obj).filter(([k, v]) =>
    !skip.some(s => k.toLowerCase().includes(s)) &&
    v !== null && v !== undefined && v !== '' &&
    !isNaN(parseFloat(v))
  );
  if (!entries.length) return null;
  return parseFloat(entries[entries.length - 1][1]);
}
 
// Debug endpoint — ver estrutura raw da API
app.get('/api/debug/:endpoint', async (req, res) => {
  try {
    const data = await bgFetch(req.params.endpoint);
    const last = getLast(data);
    res.json({
      endpoint: req.params.endpoint,
      isArray: Array.isArray(data),
      arrayLength: Array.isArray(data) ? data.length : null,
      lastItem: last,
      keys: last ? Object.keys(last) : null,
      pickedVal: pickVal(last)
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
 
app.get('/api/btc', async (req, res) => {
  const endpoints = [
    { key: 'mvrv',    ep: 'mvrv-zscore' },
    { key: 'nupl',    ep: 'nupl' },
    { key: 'sopr',    ep: 'sopr' },
    { key: 'aviv',    ep: 'aviv' },
    { key: 'm2',      ep: 'm2global' },
    { key: 'm2yoy',   ep: 'm2yoy-change' },
    { key: 'reserve', ep: 'stock' },
    { key: 'bgi',     ep: 'bgeometrics-index' },
  ];
 
  const results = await Promise.allSettled(
    endpoints.map(e => bgFetch(e.ep))
  );
 
  const out = { cached: false, ts: new Date().toISOString(), _debug: {} };
 
  endpoints.forEach(({ key }, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      const last = getLast(r.value);
      const val = pickVal(last);
      out[key] = val;
      out._debug[key] = { keys: last ? Object.keys(last) : null, val };
    } else {
      out[key] = null;
      out._debug[key] = { error: r.reason?.message };
    }
  });
 
  res.json(out);
});
 
app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));
 
app.listen(PORT, () => console.log(`BTC Proxy running on port ${PORT}`));
 
// Health check
app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(PORT, () => console.log(`BTC Proxy running on port ${PORT}`));
