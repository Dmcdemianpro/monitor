ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS cpu_alert_pct INTEGER,
  ADD COLUMN IF NOT EXISTS mem_alert_pct INTEGER,
  ADD COLUMN IF NOT EXISTS disk_alert_pct INTEGER,
  ADD COLUMN IF NOT EXISTS alert_cooldown_min INTEGER;

ALTER TABLE nodes
  ALTER COLUMN cpu_alert_pct SET DEFAULT 85,
  ALTER COLUMN mem_alert_pct SET DEFAULT 90,
  ALTER COLUMN disk_alert_pct SET DEFAULT 90,
  ALTER COLUMN alert_cooldown_min SET DEFAULT 30;

UPDATE nodes SET cpu_alert_pct = 85 WHERE cpu_alert_pct IS NULL;
UPDATE nodes SET mem_alert_pct = 90 WHERE mem_alert_pct IS NULL;
UPDATE nodes SET disk_alert_pct = 90 WHERE disk_alert_pct IS NULL;
UPDATE nodes SET alert_cooldown_min = 30 WHERE alert_cooldown_min IS NULL;

ALTER TABLE nodes
  ALTER COLUMN cpu_alert_pct SET NOT NULL,
  ALTER COLUMN mem_alert_pct SET NOT NULL,
  ALTER COLUMN disk_alert_pct SET NOT NULL,
  ALTER COLUMN alert_cooldown_min SET NOT NULL;
