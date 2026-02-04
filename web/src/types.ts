export type NodeRecord = {
  id: number;
  name: string;
  host: string;
  port: number;
  enabled: boolean;
  checkIntervalSec: number;
  retryIntervalSec: number;
  timeoutMs: number;
  tlsEnabled: boolean;
  escalationPolicyId: number | null;
  agentEnabled: boolean;
  area: string | null;
  groupName: string | null;
  criticality: string;
  tags: string[];
  lastStatus: string | null;
  lastCheckAt: string | null;
  lastChangeAt: string | null;
  recipients: string[];
  channelIds: number[];
};

export type Incident = {
  id: number;
  node_id: number;
  node_name: string;
  start_at: string;
  end_at: string | null;
  duration_sec: number;
  ack_at?: string | null;
  ack_by?: string | null;
  ack_note?: string | null;
  owner?: string | null;
  notes_count?: number;
};

export type AlertChannel = {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  config: any;
};

export type Silence = {
  id: number;
  name: string;
  enabled: boolean;
  startAt: string;
  endAt: string | null;
  nodeId: number | null;
  area: string | null;
  groupName: string | null;
  tag: string | null;
  criticality: string | null;
};

export type EscalationLevel = {
  level: number;
  delayMin: number;
  includeNodeRecipients: boolean;
  channelIds: number[];
  emails: string[];
};

export type EscalationPolicy = {
  id: number;
  name: string;
  enabled: boolean;
  levels: EscalationLevel[];
};

export type IncidentNote = {
  id: number;
  incidentId: number;
  author: string;
  note: string;
  createdAt: string;
};

export type ReportRecipient = {
  id: number;
  email: string;
};

export type AgentMetric = {
  nodeId: number;
  nodeName: string;
  host: string;
  port: number;
  collectedAt: string;
  cpuPct: number | null;
  memPct: number | null;
  diskPct: number | null;
  loadAvg: number | null;
  processes: any;
};

export type AgentSeriesPoint = {
  bucket: string;
  cpuPct: number | null;
  memPct: number | null;
  diskPct: number | null;
};

export type AuditLog = {
  id: number;
  actor: string | null;
  role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: any;
  ip: string | null;
  created_at: string;
};

export type AuthUser = {
  username: string;
  role: string;
};

export type NodeMetric = {
  nodeId: number;
  uptimePct: number | null;
  avgLatencyMs: number | null;
  totalChecks: number;
  mttrSec: number | null;
  mtbfSec: number | null;
};

export type AreaMetric = {
  area: string;
  uptimePct: number | null;
  avgLatencyMs: number | null;
  totalChecks: number;
  mttrSec: number | null;
  mtbfSec: number | null;
};

export type LatencyPoint = {
  bucket: string;
  avgLatencyMs: number | null;
};
