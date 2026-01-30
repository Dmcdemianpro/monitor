ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS agent_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS agent_metrics (
  id BIGSERIAL PRIMARY KEY,
  node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cpu_pct REAL,
  mem_pct REAL,
  disk_pct REAL,
  load_avg REAL,
  processes JSONB
);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_node_time ON agent_metrics (node_id, collected_at DESC);
