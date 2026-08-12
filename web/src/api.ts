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
  GroupMetric,
  HealthStatus
} from './types';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:4000`;
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
  // Only advertise a JSON body when we actually send one. Sending
  // Content-Type: application/json with an empty body (e.g. DELETE) makes
  // Fastify reject the request with FST_ERR_CTP_EMPTY_JSON_BODY.
  const hasBody = options?.body != null;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {})
    }
  });

  if (!res.ok) {
    // Session expired or invalid token: clear it and notify the app so it can
    // send the user back to the login screen with a clear message, instead of
    // surfacing a cryptic "unauthorized" while pretending the session is alive.
    if (res.status === 401 && token) {
      setAuthToken('');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('monid:unauthorized'));
      }
      throw new Error('Tu sesion expiro. Vuelve a iniciar sesion.');
    }
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchNodes() {
  return request<{ nodes: NodeRecord[] }>('/api/nodes');
}

/**
 * Salud del monitor. No usa request() porque el endpoint responde 503 a
 * proposito cuando el monitoreo esta atrasado, y ese cuerpo es justamente lo
 * que hay que leer: tratarlo como error perderia el dato.
 *
 * Si el servidor no responde tampoco es un error a mostrar como excepcion;
 * es en si mismo el sintoma, asi que se devuelve como estado 'unreachable'.
 */
export async function fetchHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(`${API_URL}/api/health`);
    const data = await res.json();
    return data as HealthStatus;
  } catch {
    return {
      ok: false,
      db: 'unreachable',
      monitoring: 'unreachable',
      lastCheckAt: null,
      ageSec: null,
      staleAfterSec: 0,
      enabledNodes: 0
    };
  }
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

export async function exportIncidentsPdf(days = 90) {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}/api/incidents/export/pdf?days=${days}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.blob();
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

// --- Users ---

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchUsers() {
  return request<{ users: User[] }>('/api/users');
}

export async function createUser(payload: {
  username: string;
  password: string;
  role: string;
  enabled: boolean;
}) {
  return request<{ id: number }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateUser(id: number, payload: {
  username: string;
  role: string;
  enabled: boolean;
}) {
  return request<{ ok: boolean }>(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function changeUserPassword(id: number, password: string) {
  return request<{ ok: boolean }>(`/api/users/${id}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ password })
  });
}

export async function deleteUser(id: number) {
  return request<{ ok: boolean }>(`/api/users/${id}`, {
    method: 'DELETE'
  });
}
