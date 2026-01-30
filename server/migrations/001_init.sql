CREATE TABLE IF NOT EXISTS nodes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  check_interval_sec INTEGER NOT NULL DEFAULT 300,
  retry_interval_sec INTEGER NOT NULL DEFAULT 60,
  timeout_ms INTEGER NOT NULL DEFAULT 5000,
  last_status TEXT,
  last_check_at TIMESTAMPTZ,
  last_change_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipients (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS node_recipients (
  node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, recipient_id)
);

CREATE TABLE IF NOT EXISTS checks (
  id BIGSERIAL PRIMARY KEY,
  node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  latency_ms INTEGER,
  error TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
  id BIGSERIAL PRIMARY KEY,
  node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at TIMESTAMPTZ,
  first_check_id BIGINT REFERENCES checks(id),
  last_check_id BIGINT REFERENCES checks(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipients TEXT NOT NULL,
  subject TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checks_node_time ON checks (node_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_node_start ON incidents (node_id, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_enabled ON nodes (enabled);
CREATE INDEX IF NOT EXISTS idx_notifications_sent ON notifications (sent_at DESC);
