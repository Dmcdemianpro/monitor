CREATE TABLE IF NOT EXISTS agent_alert_state (
  node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  disk_alert_active BOOLEAN NOT NULL DEFAULT FALSE,
  last_disk_alert_at TIMESTAMPTZ
);
