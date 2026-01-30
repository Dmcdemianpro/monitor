CREATE TABLE IF NOT EXISTS alert_channels (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS node_alert_channels (
  node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES alert_channels(id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, channel_id)
);

CREATE TABLE IF NOT EXISTS silences (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  node_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
  area TEXT,
  group_name TEXT,
  tag TEXT,
  criticality TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escalation_policies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escalation_levels (
  id SERIAL PRIMARY KEY,
  policy_id INTEGER NOT NULL REFERENCES escalation_policies(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  delay_min INTEGER NOT NULL DEFAULT 0,
  include_node_recipients BOOLEAN NOT NULL DEFAULT TRUE,
  channel_ids INTEGER[] NOT NULL DEFAULT '{}',
  emails TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS escalation_policy_id INTEGER REFERENCES escalation_policies(id);

CREATE TABLE IF NOT EXISTS alert_events (
  id BIGSERIAL PRIMARY KEY,
  incident_id BIGINT REFERENCES incidents(id) ON DELETE CASCADE,
  node_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  level INTEGER,
  channel_id INTEGER REFERENCES alert_channels(id),
  recipients TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dedup_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_alert_events_incident ON alert_events (incident_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_node ON alert_events (node_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_silences_node ON silences (node_id);
CREATE INDEX IF NOT EXISTS idx_silences_time ON silences (start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_node_alert_channels_node ON node_alert_channels (node_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_escalation_level_unique ON escalation_levels (policy_id, level);
