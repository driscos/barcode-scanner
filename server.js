require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id               SERIAL PRIMARY KEY,
      barcode          VARCHAR(50) NOT NULL UNIQUE,
      name             TEXT,
      brand            TEXT,
      category         TEXT,
      description      TEXT,
      image_url        TEXT,
      stores           JSONB,
      raw_data         JSONB,
      first_scanned_at TIMESTAMPTZ DEFAULT NOW(),
      scan_count       INT DEFAULT 1
    )
  `);
}

app.post('/api/lookup', async (req, res) => {
  const { barcode } = req.body;
  if (!barcode) return res.status(400).json({ error: 'barcode required' });

  // Return cached product and increment scan count if already known
  const existing = await pool.query(
    'UPDATE products SET scan_count = scan_count + 1 WHERE barcode = $1 RETURNING *',
    [barcode]
  );
  if (existing.rows.length > 0) {
    return res.json({ found: true, product: existing.rows[0] });
  }

  // Look up via barcodelookup.com API
  const apiUrl = `https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(barcode)}&key=${process.env.BARCODE_LOOKUP_API_KEY}`;
  let apiData;
  try {
    const apiRes = await fetch(apiUrl);
    if (!apiRes.ok) throw new Error(`API responded ${apiRes.status}`);
    apiData = await apiRes.json();
  } catch (err) {
    console.error('Barcode API error:', err.message);
    return res.status(502).json({ error: 'Lookup service unavailable' });
  }

  if (!apiData.products || apiData.products.length === 0) {
    return res.json({ found: false });
  }

  const p = apiData.products[0];
  const product = {
    barcode,
    name: p.title || null,
    brand: p.brand || null,
    category: p.category || null,
    description: p.description || null,
    image_url: p.images && p.images.length > 0 ? p.images[0] : null,
    stores: p.stores || null,
    raw_data: p,
  };

  const inserted = await pool.query(
    `INSERT INTO products (barcode, name, brand, category, description, image_url, stores, raw_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [product.barcode, product.name, product.brand, product.category,
     product.description, product.image_url,
     JSON.stringify(product.stores), JSON.stringify(product.raw_data)]
  );

  res.json({ found: true, product: inserted.rows[0] });
});

app.get('/api/export/csv', async (req, res) => {
  const result = await pool.query(
    'SELECT barcode, name, brand, category, description, image_url, first_scanned_at, scan_count FROM products ORDER BY first_scanned_at DESC'
  );
  const cols = ['barcode', 'name', 'brand', 'category', 'description', 'image_url', 'first_scanned_at', 'scan_count'];
  const escape = v => v == null ? '' : '"' + String(v).replace(/"/g, '""') + '"';
  const lines = [cols.join(','), ...result.rows.map(r => cols.map(c => escape(r[c])).join(','))];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
  res.send(lines.join('\r\n'));
});

const PORT = process.env.PORT || 3000;
initDb()
  .then(() => app.listen(PORT, () => console.log(`Listening on ${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
