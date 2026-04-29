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
);
