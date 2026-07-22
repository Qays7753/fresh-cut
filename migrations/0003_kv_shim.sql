-- Alyaf Al-Shamal — KV shim table (used by worker rate limiter).
-- D1 does not have a separate KV; we use a tiny table.
CREATE TABLE IF NOT EXISTS _kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kv_key ON _kv(key);
