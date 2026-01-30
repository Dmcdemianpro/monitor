ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS group_name TEXT,
  ADD COLUMN IF NOT EXISTS criticality TEXT NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_nodes_area ON nodes (area);
CREATE INDEX IF NOT EXISTS idx_nodes_group_name ON nodes (group_name);
CREATE INDEX IF NOT EXISTS idx_nodes_criticality ON nodes (criticality);
CREATE INDEX IF NOT EXISTS idx_nodes_tags ON nodes USING GIN (tags);
