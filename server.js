const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const BG_TOKEN = process.env.BG_TOKEN || 'lBcKKHCEx1';

app.use(cors());
app.use(express.json());

// Cache simples em memória
const cache = {};
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 horas

async function bgFetch(endpoint) {
  const now = Date.now();
  if (cache[endpoint] && now - cache[endpoint].ts < CACHE_TTL) {
    return cache[endpoint].data;
  }

  const url = `https://api.bgeometrics.com/v1/${endpoint}?token=${BG_TOKEN}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`BG API error: ${resp.status}`);
  const data = await resp.json();
  cache[endpoint] = { data, ts: now };
  return data;
}

function getLast(data) {
  return Array.isArray(data) ? data[data.length - 1] : data;
}

function pickVal(obj, ...keys) {
  if (!obj) return null;
  const skip = ['date', 'time', 'timestamp', 'id', 'block'];
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && !isNaN(parseFloat(obj[k]))) {
      return parseFloat(obj[k]);
    }
  }
  const entries = Object.entries(obj).filter(([k, v]) =>
    !skip.some(s => k.toLowerCase().includes(s)) &&
    !isNaN(parseFloat(v)) && v !== null && v !== ''
  );
  return entries.length > 0 ? parseFloat(entries[entries.length - 1][1]) : null;
}

// Endpoint principal — retorna todos os dados de uma vez
app.get('/api/btc', async (req, res) => {
  try {
    const results = await Promise.allSettled([
      bgFetch('mvrv-zscore'),
      bgFetch('nupl'),
      bgFetch('sopr'),
      bgFetch('aviv'),
      bgFetch('m2global'),
      bgFetch('m2yoy-change'),
      bgFetch('stock'),
      bgFetch('bgeometrics-index'),
    ]);

    const [mvrv, nupl, sopr, aviv, m2, m2yoy, stock, bgi] = results.map(r =>
      r.status === 'fulfilled' ? getLast(r.value) : null
    );

    res.json({
      mvrv:    pickVal(mvrv,  'mvrv_z_score', 'mvrv', 'value', 'z_score'),
      nupl:    pickVal(nupl,  'nupl', 'value'),
      sopr:    pickVal(sopr,  'sopr', 'value'),
      aviv:    pickVal(aviv,  'aviv', 'aviv_ratio', 'value'),
      m2:      pickVal(m2,    'm2_global', 'm2', 'value'),
      m2yoy:   pickVal(m2yoy, 'm2_yoy_change', 'yoy_change', 'value'),
      reserve: pickVal(stock, 'reserve', 'exchange_reserve', 'stock', 'value'),
      bgi:     pickVal(bgi,   'index', 'bgeometrics_index', 'value'),
      cached:  false,
      ts:      new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(PORT, () => console.log(`BTC Proxy running on port ${PORT}`));
