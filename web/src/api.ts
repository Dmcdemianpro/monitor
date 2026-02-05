import type {
  AgentMetric,
  AlertChannel,
  AreaMetric,
  AuditLog,
  EscalationPolicy,
  Incident,
  IncidentNote,
  LatencyPoint,
  NodeMetric,
  NodeRecord,
  ReportRecipient,
  AgentSeriesPoint,
  Silence,
  AuthUser,
  GroupMetric
} from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'monid_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token: string) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...options
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchNodes() {
  return request<{ nodes: NodeRecord[] }>('/api/nodes');
}

export async function fetchIncidents(days = 90) {
  return request<{ incidents: Incident[] }>(`/api/incidents?days=${days}`);
}

export async function createNode(payload: {
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
  cpuAlertPct: number;
  memAlertPct: number;
  diskAlertPct: number;
  alertCooldownMin: number;
  area: string;
  groupName: string;
  criticality: string;
  tags: string[];
  recipients: string[];
  channelIds: number[];
}) {
  return request<{ id: number }>('/api/nodes', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateNode(id: number, payload: {
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
  cpuAlertPct: number;
  memAlertPct: number;
  diskAlertPct: number;
  alertCooldownMin: number;
  area: string;
  groupName: string;
  criticality: string;
  tags: string[];
  recipients: string[];
  channelIds: number[];
}) {
  return request<{ ok: boolean }>(`/api/nodes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function setNodeEnabled(id: number, enabled: boolean) {
  return request<{ ok: boolean }>(`/api/nodes/${id}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled })
  });
}

export async function setNodeTlsEnabled(id: number, tlsEnabled: boolean) {
  return request<{ ok: boolean }>(`/api/nodes/${id}/tls`, {
    method: 'PATCH',
    body: JSON.stringify({ tlsEnabled })
  });
}

export async function deleteNode(id: number) {
  return request<{ ok: boolean }>(`/api/nodes/${id}`, {
    method: 'DELETE'
  });
}

export async function fetchNodeMetrics(days = 30) {
  return request<{ metrics: NodeMetric[] }>(`/api/metrics/nodes?days=${days}`);
}

export async function fetchAreaMetrics(days = 30) {
  return request<{ metrics: AreaMetric[] }>(`/api/metrics/areas?days=${days}`);
}

export async function fetchGroupMetrics(params: { days?: number; area?: string }) {
  const qs = new URLSearchParams();
  if (params.days) qs.set('days', String(params.days));
  if (params.area) qs.set('area', params.area);
  return request<{ metrics: GroupMetric[] }>(`/api/metrics/groups?${qs.toString()}`);
}

export async function fetchLatencySeries(params: {
  days?: number;
  bucket?: 'hour' | 'day';
  nodeId?: number;
  area?: string;
  groupName?: string;
}) {
  const qs = new URLSearchParams();
  if (params.days) qs.set('days', String(params.days));
  if (params.bucket) qs.set('bucket', params.bucket);
  if (params.nodeId) qs.set('nodeId', String(params.nodeId));
  if (params.area) qs.set('area', params.area);
  if (params.groupName) qs.set('groupName', params.groupName);
  return request<{ series: LatencyPoint[] }>(`/api/metrics/latency?${qs.toString()}`);
}

export async function login(username: string, password: string) {
  return request<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export async function fetchAuthUser() {
  return request<{ user: AuthUser | null }>('/api/auth/me');
}

export async function fetchAlertChannels() {
  return request<{ channels: AlertChannel[] }>('/api/alerts/channels');
}

export async function createAlertChannel(payload: {
  name: string;
  type: string;
  enabled: boolean;
  config: any;
}) {
  return request<{ id: number }>('/api/alerts/channels', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateAlertChannel(id: number, payload: {
  name: string;
  type: string;
  enabled: boolean;
  config: any;
}) {
  return request<{ ok: boolean }>(`/api/alerts/channels/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteAlertChannel(id: number) {
  return request<{ ok: boolean }>(`/api/alerts/channels/${id}`, {
    method: 'DELETE'
  });
}

export async function fetchSilences() {
  return request<{ silences: Silence[] }>('/api/alerts/silences');
}

export async function createSilence(payload: {
  name: string;
  enabled: boolean;
  startAt: string;
  endAt: string | null;
  nodeId: number | null;
  area: string;
  groupName: string;
  tag: string;
  criticality: string;
}) {
  return request<{ id: number }>('/api/alerts/silences', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateSilence(id: number, payload: {
  name: string;
  enabled: boolean;
  startAt: string;
  endAt: string | null;
  nodeId: number | null;
  area: string;
  groupName: string;
  tag: string;
  criticality: string;
}) {
  return request<{ ok: boolean }>(`/api/alerts/silences/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteSilence(id: number) {
  return request<{ ok: boolean }>(`/api/alerts/silences/${id}`, {
    method: 'DELETE'
  });
}

export async function fetchEscalationPolicies() {
  return request<{ policies: EscalationPolicy[] }>('/api/alerts/escalations');
}

export async function createEscalationPolicy(payload: {
  name: string;
  enabled: boolean;
  levels: EscalationPolicy['levels'];
}) {
  return request<{ id: number }>('/api/alerts/escalations', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateEscalationPolicy(id: number, payload: {
  name: string;
  enabled: boolean;
  levels: EscalationPolicy['levels'];
}) {
  return request<{ ok: boolean }>(`/api/alerts/escalations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteEscalationPolicy(id: number) {
  return request<{ ok: boolean }>(`/api/alerts/escalations/${id}`, {
    method: 'DELETE'
  });
}

export async function fetchIncidentNotes(incidentId: number) {
  return request<{ notes: IncidentNote[] }>(`/api/incidents/${incidentId}/notes`);
}

export async function addIncidentNote(incidentId: number, payload: { author: string; note: string }) {
  return request<{ id: number }>(`/api/incidents/${incidentId}/notes`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function acknowledgeIncident(
  incidentId: number,
  payload: { acknowledged: boolean; by: string; note?: string }
) {
  return request<{ ok: boolean }>(`/api/incidents/${incidentId}/ack`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function setIncidentOwnerApi(incidentId: number, owner: string) {
  return request<{ ok: boolean }>(`/api/incidents/${incidentId}/owner`, {
    method: 'PATCH',
    body: JSON.stringify({ owner })
  });
}

export async function exportIncidents(days = 90) {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}/api/incidents/export?days=${days}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.text();
}

export async function fetchReportRecipients() {
  return request<{ recipients: ReportRecipient[] }>('/api/reports/recipients');
}

export async function addReportRecipient(email: string) {
  return request<{ ok: boolean }>('/api/reports/recipients', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function deleteReportRecipient(id: number) {
  return request<{ ok: boolean }>(`/api/reports/recipients/${id}`, {
    method: 'DELETE'
  });
}

export async function fetchAgentMetrics() {
  return request<{ metrics: AgentMetric[] }>('/api/agent/latest');
}

export async function fetchAgentSummary() {
  return request<{ metrics: AgentMetric[] }>('/api/agent/summary');
}

export async function fetchAgentSeries(params: {
  nodeId: number;
  days?: number;
  bucket?: 'hour' | 'day';
}) {
  const qs = new URLSearchParams();
  qs.set('nodeId', String(params.nodeId));
  if (params.days) qs.set('days', String(params.days));
  if (params.bucket) qs.set('bucket', params.bucket);
  return request<{ series: AgentSeriesPoint[] }>(`/api/agent/series?${qs.toString()}`);
}

export async function fetchAuditLogs(limit = 100) {
  return request<{ logs: AuditLog[] }>(`/api/audit?limit=${limit}`);
}
