import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  acknowledgeIncident,
  addIncidentNote,
  addReportRecipient,
  createAlertChannel,
  createNode,
  createEscalationPolicy,
  createSilence,
  deleteAlertChannel,
  deleteNode,
  deleteReportRecipient,
  deleteSilence,
  exportIncidents,
  exportIncidentsPdf,
  fetchAgentMetrics,
  fetchAgentSeries,
  fetchAgentSummary,
  fetchAlertChannels,
  fetchAuditLogs,
  fetchAuthUser,
  fetchAreaMetrics,
  fetchGroupMetrics,
  fetchIncidents,
  fetchIncidentNotes,
  fetchLatencySeries,
  fetchReportRecipients,
  fetchEscalationPolicies,
  fetchSilences,
  fetchNodeMetrics,
  fetchNodes,
  login,
  setAuthToken,
  setNodeEnabled,
  setNodeTlsEnabled,
  setIncidentOwnerApi,
  updateAlertChannel,
  updateEscalationPolicy,
  updateSilence,
  updateNode
} from './api';
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
  Silence,
  AuthUser,
  AgentSeriesPoint,
  GroupMetric
} from './types';

const DEFAULT_CPU_ALERT_PCT = Number.parseInt(import.meta.env.VITE_CPU_ALERT_PCT || '85', 10) || 85;
const DEFAULT_MEM_ALERT_PCT = Number.parseInt(import.meta.env.VITE_MEM_ALERT_PCT || '90', 10) || 90;
const DEFAULT_DISK_ALERT_PCT =
  Number.parseInt(import.meta.env.VITE_DISK_ALERT_PCT || '90', 10) || 90;
const DEFAULT_ALERT_COOLDOWN_MIN =
  Number.parseInt(import.meta.env.VITE_ALERT_COOLDOWN_MIN || '10', 10) || 10;

const emptyForm = {
  id: 0,
  name: '',
  host: '',
  port: 104,
  enabled: true,
  checkIntervalSec: 300,
  retryIntervalSec: 60,
  timeoutMs: 5000,
  tlsEnabled: false,
  escalationPolicyId: null as number | null,
  agentEnabled: false,
  cpuAlertPct: DEFAULT_CPU_ALERT_PCT,
  memAlertPct: DEFAULT_MEM_ALERT_PCT,
  diskAlertPct: DEFAULT_DISK_ALERT_PCT,
  alertCooldownMin: DEFAULT_ALERT_COOLDOWN_MIN,
  area: '',
  groupName: '',
  criticality: 'MEDIUM',
  tagsText: '',
  recipientsText: '',
  channelIds: [] as number[]
};

type FormState = typeof emptyForm;

type LoadState = {
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
};

type View = 'dashboard' | 'admin' | 'guide' | 'monitor';

function getViewFromPath(pathname: string): View {
  if (pathname.startsWith('/admin')) {
    return 'admin';
  }
  if (pathname.startsWith('/monitor')) {
    return 'monitor';
  }
  if (pathname.startsWith('/guide')) {
    return 'guide';
  }
  return 'dashboard';
}

function getPathForView(view: View) {
  switch (view) {
    case 'admin':
      return '/admin';
    case 'monitor':
      return '/monitor';
    case 'guide':
      return '/guide';
    default:
      return '/';
  }
}

type StatusTone = 'ok' | 'bad' | 'warn' | 'muted';

type StatusInfo = {
  label: string;
  tone: StatusTone;
};

const CRITICALITY_OPTIONS = ['HIGH', 'MEDIUM', 'LOW'] as const;
const CRITICALITY_LABELS: Record<string, string> = {
  HIGH: 'ALTA',
  MEDIUM: 'MEDIA',
  LOW: 'BAJA'
};
const METRICS_DAYS = 30;
const LATENCY_DAYS = 7;

function parseList(input: string) {
  return input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatClockTime(date: Date) {
  return date.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function formatClockDate(date: Date) {
  return date.toLocaleDateString('es-CL', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatSince(value: string | null | undefined, now: Date) {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }
  const diffSec = Math.max(0, Math.round((now.getTime() - parsed.getTime()) / 1000));
  if (diffSec < 60) {
    return `hace ${diffSec}s`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `hace ${diffMin}m`;
  }
  const diffHour = Math.floor(diffMin / 60);
  return `hace ${diffHour}h`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return '-';
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}m ${sec}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${min}m`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  return `${value.toFixed(1)}%`;
}

function formatMs(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  return `${Math.round(value)} ms`;
}

function normalizeLabel(value: string | null | undefined) {
  return value && value.trim().length ? value.trim() : 'Unassigned';
}

function getCriticalityLabel(value: string) {
  return CRITICALITY_LABELS[value] || value;
}

function getThresholds(node?: Pick<
  NodeRecord,
  'cpuAlertPct' | 'memAlertPct' | 'diskAlertPct' | 'alertCooldownMin'
> | null) {
  return {
    cpu: node?.cpuAlertPct ?? DEFAULT_CPU_ALERT_PCT,
    mem: node?.memAlertPct ?? DEFAULT_MEM_ALERT_PCT,
    disk: node?.diskAlertPct ?? DEFAULT_DISK_ALERT_PCT,
    cooldown: node?.alertCooldownMin ?? DEFAULT_ALERT_COOLDOWN_MIN
  };
}

function getStatus(node: NodeRecord): StatusInfo {
  if (!node.enabled) {
    return { label: 'Pausado', tone: 'muted' };
  }
  if (node.lastStatus === 'SUCCESS') {
    return { label: 'Activo', tone: 'ok' };
  }
  if (node.lastStatus === 'FAILURE') {
    return { label: 'Inactivo', tone: 'bad' };
  }
  return { label: 'Sin dato', tone: 'warn' };
}

function getStatusRank(node: NodeRecord) {
  if (!node.enabled) {
    return 3;
  }
  if (node.lastStatus === 'FAILURE') {
    return 0;
  }
  if (node.lastStatus === 'SUCCESS') {
    return 1;
  }
  return 2;
}

function Sparkline({ points }: { points: number[] }) {
  if (!points.length) {
    return <span className="muted">-</span>;
  }
  const width = 140;
  const height = 32;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const d = points
    .map((point, index) => {
      const x = index * step;
      const y = height - ((point - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function App() {
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [nodeMetrics, setNodeMetrics] = useState<NodeMetric[]>([]);
  const [areaMetrics, setAreaMetrics] = useState<AreaMetric[]>([]);
  const [groupMetrics, setGroupMetrics] = useState<GroupMetric[]>([]);
  const [latencySeries, setLatencySeries] = useState<LatencyPoint[]>([]);
  const [alertChannels, setAlertChannels] = useState<AlertChannel[]>([]);
  const [silences, setSilences] = useState<Silence[]>([]);
  const [escalationPolicies, setEscalationPolicies] = useState<EscalationPolicy[]>([]);
  const [reportRecipients, setReportRecipients] = useState<ReportRecipient[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [agentMetrics, setAgentMetrics] = useState<AgentMetric[]>([]);
  const [agentSummary, setAgentSummary] = useState<AgentMetric[]>([]);
  const [agentSeries, setAgentSeries] = useState<AgentSeriesPoint[]>([]);
  const [agentSeriesNodeId, setAgentSeriesNodeId] = useState<number | null>(null);
  const [agentSeriesDays, setAgentSeriesDays] = useState(7);
  const [incidentNotes, setIncidentNotes] = useState<IncidentNote[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [incidentNoteDraft, setIncidentNoteDraft] = useState('');
  const [incidentOwnerDraft, setIncidentOwnerDraft] = useState('');
  const [incidentAckDraft, setIncidentAckDraft] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>(() => getViewFromPath(window.location.pathname));
  const [adminTab, setAdminTab] = useState<
    'nodes' | 'alerts' | 'incidents' | 'reports' | 'audit' | 'agents'
  >('nodes');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [channelForm, setChannelForm] = useState({
    id: 0,
    name: '',
    type: 'webhook',
    enabled: true,
    url: ''
  });
  const [silenceForm, setSilenceForm] = useState({
    id: 0,
    name: '',
    enabled: true,
    startAt: '',
    endAt: '',
    nodeId: '',
    area: '',
    groupName: '',
    tag: '',
    criticality: ''
  });
  const [silenceDuration, setSilenceDuration] = useState('');
  const [policyForm, setPolicyForm] = useState({
    id: 0,
    name: '',
    enabled: true,
    levels: [] as EscalationPolicy['levels']
  });
  const [reportEmail, setReportEmail] = useState('');
  const [areaFilter, setAreaFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [criticalityFilter, setCriticalityFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [clockNow, setClockNow] = useState(() => new Date());
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const alarmCtxRef = useRef<AudioContext | null>(null);
  const alarmOscRef = useRef<OscillatorNode | null>(null);
  const alarmGainRef = useRef<GainNode | null>(null);
  const alarmIntervalRef = useRef<number | null>(null);
  const [metricView, setMetricView] = useState<'areas' | 'groups'>('areas');
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: null,
    lastUpdated: null
  });
  const isMonitor = view === 'monitor';

  const stats = useMemo(() => {
    const total = nodes.length;
    const active = nodes.filter((node) => node.enabled && node.lastStatus === 'SUCCESS').length;
    const down = nodes.filter((node) => node.enabled && node.lastStatus === 'FAILURE').length;
    const paused = nodes.filter((node) => !node.enabled).length;
    return { total, active, down, paused };
  }, [nodes]);

  const statusSummary = useMemo(() => {
    if (stats.total === 0) {
      return { label: 'Sin nodos', tone: 'warn' as StatusTone };
    }
    if (stats.down > 0) {
      return { label: `Atencion: ${stats.down} inactivos`, tone: 'bad' as StatusTone };
    }
    return { label: 'Todo OK', tone: 'ok' as StatusTone };
  }, [stats]);

  const healthPct = useMemo(() => {
    if (!stats.total) {
      return 0;
    }
    return Math.min(100, Math.max(0, Math.round((stats.active / stats.total) * 100)));
  }, [stats]);

  const monitorClock = useMemo(() => {
    return { time: formatClockTime(clockNow), date: formatClockDate(clockNow) };
  }, [clockNow]);

  const monitorLastUpdate = useMemo(() => {
    return formatSince(state.lastUpdated, clockNow);
  }, [state.lastUpdated, clockNow]);

  const openIncidents = useMemo(() => {
    return incidents.filter((incident) => !incident.end_at).length;
  }, [incidents]);

  const alarmActive = useMemo(() => {
    return stats.down > 0 || openIncidents > 0;
  }, [stats.down, openIncidents]);

  const areaOptions = useMemo(() => {
    const values = nodes.map((node) => normalizeLabel(node.area));
    return Array.from(new Set(values)).sort();
  }, [nodes]);

  const groupOptions = useMemo(() => {
    const values = nodes.map((node) => normalizeLabel(node.groupName));
    return Array.from(new Set(values)).sort();
  }, [nodes]);

  const tagOptions = useMemo(() => {
    const values = nodes.flatMap((node) => node.tags || []);
    return Array.from(new Set(values.map((tag) => tag.trim()).filter((tag) => tag.length)))
      .sort((a, b) => a.localeCompare(b));
  }, [nodes]);

  const policyOptions = useMemo(() => {
    return escalationPolicies;
  }, [escalationPolicies]);

  const policyNameById = useMemo(() => {
    return new Map(escalationPolicies.map((policy) => [policy.id, policy.name]));
  }, [escalationPolicies]);

  const filteredNodes = useMemo(() => {
    const term = query.trim().toLowerCase();
    return nodes.filter((node) => {
      const area = normalizeLabel(node.area);
      const group = normalizeLabel(node.groupName);
      if (areaFilter !== 'all' && area !== areaFilter) {
        return false;
      }
      if (groupFilter !== 'all' && group !== groupFilter) {
        return false;
      }
      if (criticalityFilter !== 'all' && node.criticality !== criticalityFilter) {
        return false;
      }
      if (tagFilter !== 'all' && !(node.tags || []).includes(tagFilter)) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        node.name.toLowerCase().includes(term) ||
        node.host.toLowerCase().includes(term) ||
        area.toLowerCase().includes(term) ||
        group.toLowerCase().includes(term)
      );
    });
  }, [nodes, query, areaFilter, groupFilter, criticalityFilter]);

  const sortedNodes = useMemo(() => {
    return [...filteredNodes].sort((a, b) => {
      const rank = getStatusRank(a) - getStatusRank(b);
      if (rank !== 0) {
        return rank;
      }
      return a.name.localeCompare(b.name);
    });
  }, [filteredNodes]);

  const monitorNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      const rank = getStatusRank(a) - getStatusRank(b);
      if (rank !== 0) {
        return rank;
      }
      return a.name.localeCompare(b.name);
    });
  }, [nodes]);

  const nodeById = useMemo(() => {
    return new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);

  const nodeMetricsMap = useMemo(() => {
    return new Map(nodeMetrics.map((metric) => [metric.nodeId, metric]));
  }, [nodeMetrics]);

  const agentSummaryMap = useMemo(() => {
    return new Map(agentSummary.map((metric) => [metric.nodeId, metric]));
  }, [agentSummary]);

  const areaMetricsSorted = useMemo(() => {
    return [...areaMetrics].sort((a, b) => a.area.localeCompare(b.area));
  }, [areaMetrics]);

  const groupMetricsSorted = useMemo(() => {
    return [...groupMetrics].sort((a, b) => a.groupName.localeCompare(b.groupName));
  }, [groupMetrics]);

  const monitorIncidents = useMemo(() => {
    return [...incidents]
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
      .slice(0, 6);
  }, [incidents]);

  const monitorAreas = useMemo(() => {
    return [...areaMetrics]
      .sort((a, b) => {
        const aUptime = a.uptimePct ?? 0;
        const bUptime = b.uptimePct ?? 0;
        return aUptime - bUptime;
      })
      .slice(0, 5);
  }, [areaMetrics]);

  const areaCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of nodes) {
      const key = normalizeLabel(node.area);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [nodes]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of nodes) {
      if (areaFilter !== 'all' && normalizeLabel(node.area) !== areaFilter) {
        continue;
      }
      const key = normalizeLabel(node.groupName);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [nodes, areaFilter]);

  const latencyPoints = useMemo(() => {
    return latencySeries
      .map((point) => point.avgLatencyMs)
      .filter((value): value is number => value !== null && value !== undefined);
  }, [latencySeries]);

  const agentSeriesCpu = useMemo(() => {
    return agentSeries
      .map((point) => point.cpuPct)
      .filter((value): value is number => value !== null && value !== undefined);
  }, [agentSeries]);

  const agentSeriesMem = useMemo(() => {
    return agentSeries
      .map((point) => point.memPct)
      .filter((value): value is number => value !== null && value !== undefined);
  }, [agentSeries]);

  const agentSeriesDisk = useMemo(() => {
    return agentSeries
      .map((point) => point.diskPct)
      .filter((value): value is number => value !== null && value !== undefined);
  }, [agentSeries]);

  const agentSeriesLatest = useMemo(() => {
    if (!agentSeries.length) {
      return null;
    }
    return agentSeries[agentSeries.length - 1];
  }, [agentSeries]);

  const agentSeriesNode = useMemo(() => {
    if (!agentSeriesNodeId) {
      return null;
    }
    return nodeById.get(agentSeriesNodeId) || null;
  }, [agentSeriesNodeId, nodeById]);

  const agentThresholds = useMemo(() => getThresholds(agentSeriesNode), [agentSeriesNode]);

  const agentCpuHigh =
    agentSeriesLatest?.cpuPct !== null &&
    agentSeriesLatest?.cpuPct !== undefined &&
    agentSeriesLatest.cpuPct >= agentThresholds.cpu;

  const agentMemHigh =
    agentSeriesLatest?.memPct !== null &&
    agentSeriesLatest?.memPct !== undefined &&
    agentSeriesLatest.memPct >= agentThresholds.mem;

  const agentDiskHigh =
    agentSeriesLatest?.diskPct !== null &&
    agentSeriesLatest?.diskPct !== undefined &&
    agentSeriesLatest.diskPct >= agentThresholds.disk;

  const selectedIncident = useMemo(() => {
    if (!selectedIncidentId) {
      return null;
    }
    return incidents.find((incident) => incident.id === selectedIncidentId) || null;
  }, [incidents, selectedIncidentId]);

  const loadData = async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const areaParam = areaFilter === 'all' ? undefined : areaFilter;
      const groupParam = groupFilter === 'all' ? undefined : groupFilter;
      const [nodesRes, incidentsRes, nodeMetricsRes, areaMetricsRes, groupMetricsRes, latencyRes, agentSummaryRes] =
        await Promise.all([
          fetchNodes(),
          fetchIncidents(90),
          fetchNodeMetrics(METRICS_DAYS),
          fetchAreaMetrics(METRICS_DAYS),
          fetchGroupMetrics({ days: METRICS_DAYS, area: areaParam }),
          fetchLatencySeries({ days: LATENCY_DAYS, bucket: 'hour', area: areaParam, groupName: groupParam }),
          fetchAgentSummary()
        ]);
      setNodes(nodesRes.nodes);
      setIncidents(incidentsRes.incidents);
      setNodeMetrics(nodeMetricsRes.metrics);
      setAreaMetrics(areaMetricsRes.metrics);
      setGroupMetrics(groupMetricsRes.metrics);
      setLatencySeries(latencyRes.series);
      setAgentSummary(agentSummaryRes.metrics);
      setState({ loading: false, error: null, lastUpdated: new Date().toISOString() });
    } catch (err: any) {
      setState({ loading: false, error: err?.message || 'Failed to load data', lastUpdated: null });
    }
  };

  const loadAdminData = async () => {
    if (!authUser) {
      return;
    }
    try {
      const [channelsRes, silencesRes, policiesRes, recipientsRes, auditRes, agentRes] = await Promise.all([
        fetchAlertChannels(),
        fetchSilences(),
        fetchEscalationPolicies(),
        fetchReportRecipients(),
        fetchAuditLogs(120),
        fetchAgentMetrics()
      ]);
      setAlertChannels(channelsRes.channels);
      setSilences(silencesRes.silences);
      setEscalationPolicies(policiesRes.policies);
      setReportRecipients(recipientsRes.recipients);
      setAuditLogs(auditRes.logs);
      setAgentMetrics(agentRes.metrics);
      if (!policyForm.id && policiesRes.policies.length) {
        const first = policiesRes.policies[0];
        setPolicyForm({
          id: first.id,
          name: first.name,
          enabled: first.enabled,
          levels: first.levels
        });
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to load admin data');
    }
  };

  const navigateTo = (nextView: View) => {
    setView(nextView);
    const nextPath = getPathForView(nextView);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 10000);
    return () => clearInterval(timer);
  }, [areaFilter, groupFilter, criticalityFilter]);

  useEffect(() => {
    const handlePop = () => setView(getViewFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('monitor-body', isMonitor);
    document.body.classList.toggle('monitor-alerting', isMonitor && alarmActive);
    return () => {
      document.body.classList.remove('monitor-body');
      document.body.classList.remove('monitor-alerting');
    };
  }, [isMonitor, alarmActive]);

  useEffect(() => {
    if (!isMonitor) {
      return;
    }
    setClockNow(new Date());
    const timer = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [isMonitor]);

  useEffect(() => {
    if (!isMonitor) {
      stopAlarmAudio();
      setAudioEnabled(false);
      setAudioBlocked(false);
      return;
    }
    if (audioEnabled && alarmActive) {
      void startAlarmAudio();
    } else {
      stopAlarmAudio();
    }
  }, [audioEnabled, alarmActive, isMonitor]);

  useEffect(() => {
    return () => {
      stopAlarmAudio();
      if (alarmCtxRef.current) {
        alarmCtxRef.current.close().catch(() => undefined);
        alarmCtxRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetchAuthUser();
        setAuthUser(res.user);
      } catch {
        setAuthUser(null);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (view === 'admin' && authUser) {
      loadAdminData();
    }
  }, [view, authUser, adminTab]);

  useEffect(() => {
    if (adminTab !== 'agents' || !authUser) {
      return;
    }
    if (!agentSeriesNodeId && agentMetrics.length) {
      setAgentSeriesNodeId(agentMetrics[0].nodeId);
    }
  }, [adminTab, authUser, agentMetrics, agentSeriesNodeId]);

  useEffect(() => {
    if (adminTab !== 'agents' || !authUser || !agentSeriesNodeId) {
      return;
    }
    const loadSeries = async () => {
      try {
        const bucket = agentSeriesDays <= 2 ? 'hour' : 'day';
        const res = await fetchAgentSeries({
          nodeId: agentSeriesNodeId,
          days: agentSeriesDays,
          bucket
        });
        setAgentSeries(res.series);
      } catch (err: any) {
        setAuthError(err?.message || 'No se pudo cargar el historico');
      }
    };
    loadSeries();
  }, [adminTab, authUser, agentSeriesNodeId, agentSeriesDays]);

  const resetForm = () => setForm(emptyForm);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      host: form.host.trim(),
      port: Number(form.port),
      enabled: form.enabled,
      checkIntervalSec: Number(form.checkIntervalSec),
      retryIntervalSec: Number(form.retryIntervalSec),
      timeoutMs: Number(form.timeoutMs),
      tlsEnabled: form.tlsEnabled,
      escalationPolicyId: form.escalationPolicyId,
      agentEnabled: form.agentEnabled,
      cpuAlertPct: Number(form.cpuAlertPct),
      memAlertPct: Number(form.memAlertPct),
      diskAlertPct: Number(form.diskAlertPct),
      alertCooldownMin: Number(form.alertCooldownMin),
      area: form.area.trim(),
      groupName: form.groupName.trim(),
      criticality: form.criticality,
      tags: parseList(form.tagsText),
      recipients: parseList(form.recipientsText),
      channelIds: form.channelIds
    };

    try {
      if (form.id) {
        await updateNode(form.id, payload);
      } else {
        await createNode(payload);
      }
      resetForm();
      await loadData();
    } catch (err: any) {
      setState((prev) => ({ ...prev, error: err?.message || 'Failed to save node' }));
    }
  };

  const handleEdit = (node: NodeRecord) => {
    setForm({
      id: node.id,
      name: node.name,
      host: node.host,
      port: node.port,
      enabled: node.enabled,
      checkIntervalSec: node.checkIntervalSec,
      retryIntervalSec: node.retryIntervalSec,
      timeoutMs: node.timeoutMs,
      tlsEnabled: node.tlsEnabled,
      escalationPolicyId: node.escalationPolicyId ?? null,
      agentEnabled: node.agentEnabled ?? false,
      cpuAlertPct: node.cpuAlertPct ?? DEFAULT_CPU_ALERT_PCT,
      memAlertPct: node.memAlertPct ?? DEFAULT_MEM_ALERT_PCT,
      diskAlertPct: node.diskAlertPct ?? DEFAULT_DISK_ALERT_PCT,
      alertCooldownMin: node.alertCooldownMin ?? DEFAULT_ALERT_COOLDOWN_MIN,
      area: node.area ?? '',
      groupName: node.groupName ?? '',
      criticality: node.criticality ?? 'MEDIUM',
      tagsText: node.tags.join(', '),
      recipientsText: node.recipients.join(', '),
      channelIds: node.channelIds ?? []
    });
  };

  const handleToggle = async (node: NodeRecord) => {
    try {
      await setNodeEnabled(node.id, !node.enabled);
      await loadData();
    } catch (err: any) {
      setState((prev) => ({ ...prev, error: err?.message || 'Failed to update node' }));
    }
  };

  const handleDelete = async (node: NodeRecord) => {
    const ok = window.confirm(`Eliminar nodo "${node.name}"? Esto borra su historial.`);
    if (!ok) {
      return;
    }

    try {
      await deleteNode(node.id);
      if (form.id === node.id) {
        resetForm();
      }
      await loadData();
    } catch (err: any) {
      setState((prev) => ({ ...prev, error: err?.message || 'Failed to delete node' }));
    }
  };

  const handleToggleTls = async (node: NodeRecord) => {
    try {
      await setNodeTlsEnabled(node.id, !node.tlsEnabled);
      await loadData();
    } catch (err: any) {
      setState((prev) => ({ ...prev, error: err?.message || 'Failed to update TLS' }));
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    try {
      const res = await login(loginForm.username, loginForm.password);
      setAuthToken(res.token);
      setAuthUser(res.user);
      setLoginForm({ username: '', password: '' });
      await loadAdminData();
    } catch (err: any) {
      setAuthError(err?.message || 'Credenciales invalidas');
    }
  };

  const handleLogout = () => {
    setAuthToken('');
    setAuthUser(null);
    setAlertChannels([]);
    setSilences([]);
    setEscalationPolicies([]);
    setReportRecipients([]);
    setAuditLogs([]);
    setAgentMetrics([]);
    setAgentSeries([]);
    setAgentSeriesNodeId(null);
    setAdminTab('nodes');
    setChannelForm({ id: 0, name: '', type: 'webhook', enabled: true, url: '' });
    setSilenceForm({
      id: 0,
      name: '',
      enabled: true,
      startAt: '',
      endAt: '',
      nodeId: '',
      area: '',
      groupName: '',
      tag: '',
      criticality: ''
    });
    setSilenceDuration('');
    setPolicyForm({ id: 0, name: '', enabled: true, levels: [] });
    setIncidentNotes([]);
    setSelectedIncidentId(null);
    setIncidentNoteDraft('');
    setIncidentAckDraft('');
    setIncidentOwnerDraft('');
  };

  const handleChannelSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      name: channelForm.name.trim(),
      type: channelForm.type,
      enabled: channelForm.enabled,
      config: { url: channelForm.url.trim() }
    };
    try {
      if (channelForm.id) {
        await updateAlertChannel(channelForm.id, payload);
      } else {
        await createAlertChannel(payload);
      }
      setChannelForm({ id: 0, name: '', type: 'webhook', enabled: true, url: '' });
      await loadAdminData();
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo guardar el canal');
    }
  };

  const stopAlarmAudio = () => {
    if (alarmIntervalRef.current) {
      window.clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    const ctx = alarmCtxRef.current;
    const osc = alarmOscRef.current;
    const gain = alarmGainRef.current;
    if (gain && ctx) {
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
      } catch {
        // noop
      }
    }
    if (osc) {
      try {
        osc.stop();
      } catch {
        // noop
      }
      osc.disconnect();
      alarmOscRef.current = null;
    }
    if (gain) {
      gain.disconnect();
      alarmGainRef.current = null;
    }
  };

  const startAlarmAudio = async () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        return;
      }
      if (!alarmCtxRef.current) {
        alarmCtxRef.current = new AudioCtx();
      }
      const ctx = alarmCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (alarmOscRef.current) {
        return;
      }
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 880;
      osc.connect(gain);
      osc.start();
      alarmOscRef.current = osc;
      alarmGainRef.current = gain;

      const beep = () => {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.02);
        gain.gain.linearRampToValueAtTime(0, now + 0.28);
        osc.frequency.setValueAtTime(740, now);
        osc.frequency.linearRampToValueAtTime(980, now + 0.28);
      };
      beep();
      alarmIntervalRef.current = window.setInterval(beep, 900);
      setAudioBlocked(false);
    } catch {
      setAudioBlocked(true);
    }
  };

  const handleToggleAlarmAudio = async () => {
    if (audioEnabled) {
      setAudioEnabled(false);
      stopAlarmAudio();
      return;
    }
    setAudioEnabled(true);
    if (alarmActive) {
      await startAlarmAudio();
    }
  };

  const handleTestAlarmAudio = async () => {
    setAudioEnabled(true);
    await startAlarmAudio();
    window.setTimeout(() => {
      if (!alarmActive) {
        stopAlarmAudio();
      }
    }, 1500);
  };

  const handleChannelEdit = (channel: AlertChannel) => {
    setChannelForm({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      enabled: channel.enabled,
      url: channel.config?.url || ''
    });
  };

  const handleChannelDelete = async (channel: AlertChannel) => {
    const ok = window.confirm(`Eliminar canal "${channel.name}"?`);
    if (!ok) {
      return;
    }
    try {
      await deleteAlertChannel(channel.id);
      await loadAdminData();
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo eliminar el canal');
    }
  };

  const handleSilenceSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const startIso = silenceForm.startAt ? new Date(silenceForm.startAt).toISOString() : '';
    const endIso = silenceForm.endAt ? new Date(silenceForm.endAt).toISOString() : null;
    const payload = {
      name: silenceForm.name.trim(),
      enabled: silenceForm.enabled,
      startAt: startIso,
      endAt: endIso,
      nodeId: silenceForm.nodeId ? Number(silenceForm.nodeId) : null,
      area: silenceForm.area.trim(),
      groupName: silenceForm.groupName.trim(),
      tag: silenceForm.tag.trim(),
      criticality: silenceForm.criticality.trim()
    };
    try {
      if (silenceForm.id) {
        await updateSilence(silenceForm.id, payload);
      } else {
        await createSilence(payload);
      }
      setSilenceForm({
        id: 0,
        name: '',
        enabled: true,
        startAt: '',
        endAt: '',
        nodeId: '',
        area: '',
        groupName: '',
        tag: '',
        criticality: ''
      });
      setSilenceDuration('');
      await loadAdminData();
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo guardar el silencio');
    }
  };

  const handleSilenceEdit = (silence: Silence) => {
    setSilenceForm({
      id: silence.id,
      name: silence.name,
      enabled: silence.enabled,
      startAt: silence.startAt ? new Date(silence.startAt).toISOString().slice(0, 16) : '',
      endAt: silence.endAt ? new Date(silence.endAt).toISOString().slice(0, 16) : '',
      nodeId: silence.nodeId ? String(silence.nodeId) : '',
      area: silence.area || '',
      groupName: silence.groupName || '',
      tag: silence.tag || '',
      criticality: silence.criticality || ''
    });
    setSilenceDuration('');
  };

  const handleSilenceDelete = async (silence: Silence) => {
    const ok = window.confirm(`Eliminar silencio "${silence.name}"?`);
    if (!ok) {
      return;
    }
    try {
      await deleteSilence(silence.id);
      await loadAdminData();
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo eliminar el silencio');
    }
  };

  const handlePolicySave = async () => {
    const payload = {
      name: policyForm.name.trim(),
      enabled: policyForm.enabled,
      levels: policyForm.levels.map((level) => ({
        ...level,
        channelIds: level.channelIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      }))
    };
    try {
      if (policyForm.id) {
        await updateEscalationPolicy(policyForm.id, payload);
      } else {
        await createEscalationPolicy(payload);
      }
      await loadAdminData();
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo guardar la politica');
    }
  };

  const handlePolicyLevelAdd = () => {
    setPolicyForm((prev) => ({
      ...prev,
      levels: [
        ...prev.levels,
        { level: prev.levels.length + 1, delayMin: 0, includeNodeRecipients: true, channelIds: [], emails: [] }
      ]
    }));
  };

  const handlePolicyLevelUpdate = (index: number, patch: Partial<EscalationPolicy['levels'][number]>) => {
    setPolicyForm((prev) => ({
      ...prev,
      levels: prev.levels.map((level, idx) => (idx === index ? { ...level, ...patch } : level))
    }));
  };

  const handlePolicyLevelRemove = (index: number) => {
    setPolicyForm((prev) => ({
      ...prev,
      levels: prev.levels.filter((_, idx) => idx !== index)
    }));
  };

  const handleSelectIncident = async (incidentId: number) => {
    setSelectedIncidentId(incidentId);
    setIncidentNoteDraft('');
    try {
      const res = await fetchIncidentNotes(incidentId);
      setIncidentNotes(res.notes);
      const incident = incidents.find((item) => item.id === incidentId);
      setIncidentOwnerDraft(incident?.owner || '');
      setIncidentAckDraft(incident?.ack_note || '');
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo cargar notas');
    }
  };

  const handleAddIncidentNote = async () => {
    if (!selectedIncidentId || !incidentNoteDraft.trim() || !authUser) {
      return;
    }
    try {
      await addIncidentNote(selectedIncidentId, {
        author: authUser.username,
        note: incidentNoteDraft.trim()
      });
      setIncidentNoteDraft('');
      await handleSelectIncident(selectedIncidentId);
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo agregar nota');
    }
  };

  const handleAckIncident = async (incidentId: number) => {
    if (!authUser) {
      return;
    }
    try {
      await acknowledgeIncident(incidentId, {
        acknowledged: true,
        by: authUser.username,
        note: incidentAckDraft.trim()
      });
      await loadData();
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo reconocer');
    }
  };

  const handleClearAck = async (incidentId: number) => {
    if (!authUser) {
      return;
    }
    try {
      await acknowledgeIncident(incidentId, { acknowledged: false, by: authUser.username });
      await loadData();
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo quitar ack');
    }
  };

  const handleOwnerSave = async () => {
    if (!selectedIncidentId) {
      return;
    }
    try {
      await setIncidentOwnerApi(selectedIncidentId, incidentOwnerDraft.trim());
      await loadData();
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo guardar responsable');
    }
  };

  const handleExportIncidents = async () => {
    try {
      const csv = await exportIncidents(90);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'incidentes.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo exportar');
    }
  };

  const handleExportIncidentsPdf = async () => {
    try {
      const pdf = await exportIncidentsPdf(90);
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'incidentes.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo exportar PDF');
    }
  };

  const handleReportAdd = async () => {
    if (!reportEmail.trim()) {
      return;
    }
    try {
      await addReportRecipient(reportEmail.trim());
      setReportEmail('');
      await loadAdminData();
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo agregar');
    }
  };

  const handleReportDelete = async (recipient: ReportRecipient) => {
    try {
      await deleteReportRecipient(recipient.id);
      await loadAdminData();
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo eliminar');
    }
  };

  const applySilenceDuration = (minutes: number) => {
    setSilenceForm((prev) => {
      let base = prev.startAt ? new Date(prev.startAt) : new Date();
      if (Number.isNaN(base.getTime())) {
        base = new Date();
      }
      const startAt = prev.startAt ? prev.startAt : base.toISOString().slice(0, 16);
      const endAt = new Date(base.getTime() + minutes * 60000).toISOString().slice(0, 16);
      return { ...prev, startAt, endAt };
    });
  };

  return (
    <div className={`app ${isMonitor ? 'monitor-mode' : ''}`}>
      {!isMonitor ? (
        <header className="topbar">
          <div className="brand">
            <span className="brand-dot"></span>
            <div>
              <div className="brand-title">Moni-D</div>
            <div className="brand-sub">Monitoreo de servicios</div>
          </div>
        </div>
        <div className="status-strip">
          <div className="strip-item">
            <span className="label">Estado general</span>
            <span className={`status-pill ${statusSummary.tone}`}>{statusSummary.label}</span>
          </div>
          <div className="strip-item">
            <span className="label">Ultima sync</span>
            <span className="value mono">{formatDate(state.lastUpdated)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Total</span>
            <span className="kpi-value">{stats.total}</span>
          </div>
          <div className="kpi ok">
            <span className="kpi-label">Activos</span>
            <span className="kpi-value">{stats.active}</span>
          </div>
          <div className="kpi bad">
            <span className="kpi-label">Inactivos</span>
            <span className="kpi-value">{stats.down}</span>
          </div>
          <div className="kpi muted">
            <span className="kpi-label">Pausados</span>
            <span className="kpi-value">{stats.paused}</span>
          </div>
        </div>
        <div className="top-actions">
          <nav className="tabs">
            <button
              className={`tab-btn ${view === 'monitor' ? 'active' : ''}`}
              onClick={() => navigateTo('monitor')}
            >
              Monitor
            </button>
            <button
              className={`tab-btn ${view === 'dashboard' ? 'active' : ''}`}
              onClick={() => navigateTo('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`tab-btn ${view === 'admin' ? 'active' : ''}`}
              onClick={() => navigateTo('admin')}
            >
              Administracion
            </button>
            <button
              className={`tab-btn ${view === 'guide' ? 'active' : ''}`}
              onClick={() => navigateTo('guide')}
            >
              Guia
            </button>
          </nav>
          {authUser ? (
            <div className="auth-meta">
              <span className="auth-role">{authUser.role}</span>
              <span className="auth-user">{authUser.username}</span>
              <button className="ghost" onClick={handleLogout}>
                Salir
              </button>
            </div>
          ) : null}
        </div>
      </header>
      ) : null}

      {view === 'monitor' ? (
        <section className="monitor-view">
          <div className="monitor-hero">
            <div className="monitor-brand">
              <span className="monitor-dot"></span>
              <div>
                <div className="monitor-title">Moni-D Monitor</div>
                <div className="monitor-sub">Vista general de servicios en tiempo real.</div>
              </div>
            </div>
            <div className="monitor-hero-center">
              <div className="monitor-health">
                <div className="monitor-health-head">
                  <span className={`monitor-pill ${statusSummary.tone}`}>{statusSummary.label}</span>
                  <span className="monitor-health-score">{healthPct}% salud</span>
                </div>
                <div className="monitor-health-bar">
                  <span style={{ width: `${healthPct}%` }}></span>
                </div>
                <div className="monitor-health-meta">
                  <span className="mono">
                    {state.loading ? 'Sincronizando...' : `Actualizado ${monitorLastUpdate}`}
                  </span>
                  <span>
                    {stats.total} servicios · {stats.active} activos
                  </span>
                </div>
              </div>
              <div className={`monitor-alerts ${alarmActive ? 'alarm' : ''}`}>
                <span className={`monitor-pill ${openIncidents > 0 ? 'bad' : 'ok'}`}>
                  {openIncidents} incidentes abiertos
                </span>
                <span className={`monitor-pill ${stats.down > 0 ? 'bad' : 'ok'}`}>
                  {stats.down} inactivos
                </span>
                <button
                  className={`monitor-audio ${audioEnabled ? 'active' : ''} ${
                    alarmActive ? 'alarm' : ''
                  }`}
                  onClick={handleToggleAlarmAudio}
                  type="button"
                >
                  {audioEnabled ? 'Silenciar alarma' : 'Activar alarma'}
                </button>
                <button className="monitor-audio test" onClick={handleTestAlarmAudio} type="button">
                  Probar sonido
                </button>
                {audioBlocked ? (
                  <span className="monitor-audio-note">Permitir sonido en el navegador</span>
                ) : null}
              </div>
            </div>
            <div className="monitor-clock">
              <div className="monitor-live">
                <span></span>
                En vivo
              </div>
              <div className="monitor-clock-time mono">{monitorClock.time}</div>
              <div className="monitor-clock-date">{monitorClock.date}</div>
            </div>
          </div>

          <div className="monitor-kpis">
            <div className="monitor-kpi">
              <span>Total servicios</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="monitor-kpi ok">
              <span>Activos</span>
              <strong>{stats.active}</strong>
            </div>
            <div className="monitor-kpi bad">
              <span>Inactivos</span>
              <strong>{stats.down}</strong>
            </div>
            <div className="monitor-kpi muted">
              <span>Pausados</span>
              <strong>{stats.paused}</strong>
            </div>
          </div>

          {state.error ? <div className="monitor-alert">{state.error}</div> : null}

          <div className="monitor-layout">
            <div className="monitor-board">
              {monitorNodes.map((node) => {
                const status = getStatus(node);
                const metrics = nodeMetricsMap.get(node.id);
                const agentMetric = agentSummaryMap.get(node.id);
                const area = normalizeLabel(node.area);
                const criticality = node.criticality || 'MEDIUM';
                const uptimePct = metrics?.uptimePct ?? null;
                const avgLatency = metrics?.avgLatencyMs ?? null;
                const thresholds = getThresholds(node);
                const cpuHigh =
                  agentMetric?.cpuPct !== null &&
                  agentMetric?.cpuPct !== undefined &&
                  agentMetric.cpuPct >= thresholds.cpu;
                const memHigh =
                  agentMetric?.memPct !== null &&
                  agentMetric?.memPct !== undefined &&
                  agentMetric.memPct >= thresholds.mem;
                const diskHigh =
                  agentMetric?.diskPct !== null &&
                  agentMetric?.diskPct !== undefined &&
                  agentMetric.diskPct >= thresholds.disk;
                return (
                  <div className={`monitor-card ${status.tone}`} key={node.id}>
                    <div className="monitor-card-header">
                      <div className="monitor-card-title">
                        <span className={`monitor-dot ${status.tone}`}></span>
                        <div>
                          <div className="monitor-name">{node.name}</div>
                          <div className="monitor-meta mono">
                            {node.host}:{node.port} · {area}
                          </div>
                        </div>
                      </div>
                      <span className={`monitor-pill ${status.tone}`}>{status.label}</span>
                    </div>
                    <div className="monitor-card-body">
                      <div className="monitor-uptime">
                        <span className="monitor-uptime-label">Uptime 30d</span>
                        <div className="monitor-uptime-bar">
                          <span style={{ width: `${uptimePct ?? 0}%` }}></span>
                        </div>
                        <span className="monitor-uptime-value mono">
                          {formatPercent(uptimePct)}
                        </span>
                      </div>
                    </div>
                    <div className="monitor-chip-row">
                      <span className={`monitor-chip ${criticality.toLowerCase()}`}>
                        {getCriticalityLabel(criticality)}
                      </span>
                      <span className="monitor-chip">Lat {formatMs(avgLatency)}</span>
                      {agentMetric ? (
                        <>
                          <span className={`monitor-chip ${cpuHigh ? 'bad' : ''}`}>
                            CPU {formatPercent(agentMetric.cpuPct)}
                          </span>
                          <span className={`monitor-chip ${memHigh ? 'bad' : ''}`}>
                            RAM {formatPercent(agentMetric.memPct)}
                          </span>
                          <span className={`monitor-chip ${diskHigh ? 'bad' : ''}`}>
                            DISK {formatPercent(agentMetric.diskPct)}
                          </span>
                        </>
                      ) : (
                        <span className="monitor-chip muted">Sin agente</span>
                      )}
                    </div>
                    <div className="monitor-foot mono">
                      Ultimo check {formatSince(node.lastCheckAt, clockNow)}
                    </div>
                  </div>
                );
              })}
              {!monitorNodes.length && <div className="monitor-empty">No hay servicios.</div>}
            </div>

            <aside className="monitor-side">
              <div className="monitor-panel">
                <div className="monitor-panel-header">
                  <div>
                    <h3>Incidentes recientes</h3>
                    <span className="monitor-panel-sub">Ultimos 90 dias</span>
                  </div>
                  <span className={`monitor-pill ${openIncidents > 0 ? 'bad' : 'ok'}`}>
                    {openIncidents} abiertos
                  </span>
                </div>
                <div className="monitor-panel-body">
                  {monitorIncidents.map((incident) => {
                    const active = !incident.end_at;
                    return (
                      <div className="monitor-incident" key={incident.id}>
                        <div>
                          <div className="monitor-incident-title">{incident.node_name}</div>
                          <div className="monitor-incident-meta">
                            Inicio {formatDate(incident.start_at)}
                            {incident.end_at ? ` · Fin ${formatDate(incident.end_at)}` : ' · En curso'}
                          </div>
                        </div>
                        <div className="monitor-incident-status">
                          <span className={`monitor-pill ${active ? 'bad' : 'ok'}`}>
                            {active ? 'Abierto' : 'Cerrado'}
                          </span>
                          <span className="mono">{formatDuration(incident.duration_sec)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {!monitorIncidents.length && (
                    <div className="monitor-empty">No hay incidentes recientes.</div>
                  )}
                </div>
              </div>

              <div className="monitor-panel">
                <div className="monitor-panel-header">
                  <div>
                    <h3>Uptime por area</h3>
                    <span className="monitor-panel-sub">Ultimos {METRICS_DAYS} dias</span>
                  </div>
                </div>
                <div className="monitor-panel-body">
                  {monitorAreas.map((metric) => {
                    const area = normalizeLabel(metric.area);
                    return (
                      <div className="monitor-area-row" key={area}>
                        <div>
                          <div className="monitor-area-name">{area}</div>
                          <div className="monitor-area-meta">
                            Lat {formatMs(metric.avgLatencyMs)}
                          </div>
                        </div>
                        <div className="monitor-area-metric">{formatPercent(metric.uptimePct)}</div>
                      </div>
                    );
                  })}
                  {!monitorAreas.length && (
                    <div className="monitor-empty">Sin metricas por area.</div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </section>
      ) : view === 'dashboard' ? (
        <section className="dashboard">
          <div className="panel services-panel">
            <div className="panel-header">
              <div>
                <h2>Servicios monitoreados</h2>
                <span className="panel-sub">TCP check activo</span>
              </div>
              <div className="panel-actions">
                <input
                  type="search"
                  placeholder="Buscar servicio o IP"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button className="ghost" onClick={loadData} disabled={state.loading}>
                  {state.loading ? 'Sincronizando' : 'Refresh'}
                </button>
              </div>
            </div>
            <div className="panel-filters">
              <div className="filter-group">
                <span>Area</span>
                <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
                  <option value="all">Todas</option>
                  {areaOptions.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <span>Grupo</span>
                <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  {groupOptions.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <span>Tag</span>
                <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                  <option value="all">Todas</option>
                  {tagOptions.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <span>Criticidad</span>
                <select
                  value={criticalityFilter}
                  onChange={(event) => setCriticalityFilter(event.target.value)}
                >
                  <option value="all">Todas</option>
                  {CRITICALITY_OPTIONS.map((crit) => (
                    <option key={crit} value={crit}>
                      {getCriticalityLabel(crit)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {state.error ? <p className="alert">{state.error}</p> : null}
            <div className="panel-body scroll">
              <div className="service-table">
                <div className="service-row head">
                  <span>Estado</span>
                  <span>Servicio</span>
                  <span>Area</span>
                  <span>Host</span>
                  <span>Recursos</span>
                  <span>Uptime 30d</span>
                  <span>Ultimo chequeo</span>
                </div>
                {sortedNodes.map((node) => {
                  const status = getStatus(node);
                  const metrics = nodeMetricsMap.get(node.id);
                  const agentMetric = agentSummaryMap.get(node.id);
                  const area = normalizeLabel(node.area);
                  const criticality = node.criticality || 'MEDIUM';
                  const tags = node.tags || [];
                  const shownTags = tags.slice(0, 3);
                  const extraTags = tags.length - shownTags.length;
                  const uptimePct = metrics?.uptimePct ?? null;
                  const avgLatency = metrics?.avgLatencyMs ?? null;
                  const thresholds = getThresholds(node);
                  const cpuHigh =
                    agentMetric?.cpuPct !== null &&
                    agentMetric?.cpuPct !== undefined &&
                    agentMetric.cpuPct >= thresholds.cpu;
                  const memHigh =
                    agentMetric?.memPct !== null &&
                    agentMetric?.memPct !== undefined &&
                    agentMetric.memPct >= thresholds.mem;
                  const diskHigh =
                    agentMetric?.diskPct !== null &&
                    agentMetric?.diskPct !== undefined &&
                    agentMetric.diskPct >= thresholds.disk;
                  const resourcesHigh = cpuHigh || memHigh || diskHigh;
                  return (
                    <div className={`service-row ${status.tone}`} key={node.id}>
                      <span className={`status-pill ${status.tone}`}>{status.label}</span>
                      <div className="service-name">
                        <div className="service-title">
                          <span>{node.name}</span>
                          <span className={`crit-badge ${criticality.toLowerCase()}`}>
                            {getCriticalityLabel(criticality)}
                          </span>
                        </div>
                        {shownTags.length ? (
                          <div className="tag-row">
                            {shownTags.map((tag) => (
                              <span key={tag} className="tag-chip">
                                {tag}
                              </span>
                            ))}
                            {extraTags > 0 ? (
                              <span className="tag-chip">+{extraTags}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <span className="service-area">{area}</span>
                      <span className="service-host mono">
                        {node.host}:{node.port}
                      </span>
                      <span className={`service-resources ${resourcesHigh ? 'bad' : ''}`}>
                        {agentMetric ? (
                          <>
                            <span className={cpuHigh ? 'metric-high' : ''}>
                              CPU {formatPercent(agentMetric.cpuPct)}
                            </span>
                            <span className={memHigh ? 'metric-high' : ''}>
                              RAM {formatPercent(agentMetric.memPct)}
                            </span>
                            <span className={diskHigh ? 'metric-high' : ''}>
                              DISK {formatPercent(agentMetric.diskPct)}
                            </span>
                          </>
                        ) : (
                          <span className="muted">Sin agente</span>
                        )}
                      </span>
                      <div className="uptime">
                        <div className="uptime-bar">
                          <span style={{ width: `${uptimePct ?? 0}%` }}></span>
                        </div>
                        <div className="uptime-meta">
                          <span>{formatPercent(uptimePct)}</span>
                          <span className="muted">{formatMs(avgLatency)}</span>
                        </div>
                      </div>
                      <span className="service-time mono">{formatDate(node.lastCheckAt)}</span>
                    </div>
                  );
                })}
                {!sortedNodes.length && (
                  <div className="empty">No hay servicios. Usa Administracion para agregar.</div>
                )}
              </div>
            </div>
          </div>

          <div className="side-stack">
            <div className="panel metrics-panel">
              <div className="panel-header">
                <div>
                  <h2>Metricas por area y grupo</h2>
                  <span className="panel-sub">Uptime y latencia promedio</span>
                </div>
                <div className="panel-actions">
                  <div className="segmented">
                    <button
                      className={`ghost ${metricView === 'areas' ? 'active' : ''}`}
                      onClick={() => setMetricView('areas')}
                    >
                      Areas
                    </button>
                    <button
                      className={`ghost ${metricView === 'groups' ? 'active' : ''}`}
                      onClick={() => setMetricView('groups')}
                    >
                      Grupos
                    </button>
                  </div>
                  <span className="panel-badge">{METRICS_DAYS}d</span>
                </div>
              </div>
              <div className="panel-body scroll">
                {metricView === 'areas' ? (
                  <div className="area-list">
                    {areaMetricsSorted.map((metric) => {
                      const uptime = metric.uptimePct ?? 0;
                      const latency = metric.avgLatencyMs ?? null;
                      const isActive = areaFilter !== 'all' && metric.area === areaFilter;
                      const count = areaCounts.get(metric.area) || 0;
                      return (
                        <button
                          key={metric.area}
                          className={`area-row ${isActive ? 'active' : ''}`}
                          onClick={() => setAreaFilter(metric.area)}
                        >
                          <div>
                            <div className="area-name">{metric.area}</div>
                            <div className="area-meta">
                              {count} nodos ? Lat {formatMs(latency)} ? MTTR {formatDuration(metric.mttrSec ?? 0)}
                            </div>
                          </div>
                          <div className="uptime mini">
                            <div className="uptime-bar">
                              <span style={{ width: `${uptime}%` }}></span>
                            </div>
                            <span className="uptime-label">{formatPercent(metric.uptimePct)}</span>
                          </div>
                        </button>
                      );
                    })}
                    {!areaMetricsSorted.length && (
                      <div className="empty">Sin metricas por area aun.</div>
                    )}
                  </div>
                ) : (
                  <div className="area-list">
                    {groupMetricsSorted.map((metric) => {
                      const uptime = metric.uptimePct ?? 0;
                      const latency = metric.avgLatencyMs ?? null;
                      const isActive = groupFilter !== 'all' && metric.groupName === groupFilter;
                      const count = groupCounts.get(metric.groupName) || 0;
                      return (
                        <button
                          key={metric.groupName}
                          className={`area-row ${isActive ? 'active' : ''}`}
                          onClick={() => setGroupFilter(metric.groupName)}
                        >
                          <div>
                            <div className="area-name">{metric.groupName}</div>
                            <div className="area-meta">
                              {count} nodos ? Lat {formatMs(latency)} ? MTTR {formatDuration(metric.mttrSec ?? 0)}
                            </div>
                          </div>
                          <div className="uptime mini">
                            <div className="uptime-bar">
                              <span style={{ width: `${uptime}%` }}></span>
                            </div>
                            <span className="uptime-label">{formatPercent(metric.uptimePct)}</span>
                          </div>
                        </button>
                      );
                    })}
                    {!groupMetricsSorted.length && (
                      <div className="empty">Sin metricas por grupo aun.</div>
                    )}
                  </div>
                )}
              </div>
              <div className="panel-footer">
                <div>
                  <div className="label">Latencia historica ({LATENCY_DAYS}d)</div>
                  <Sparkline points={latencyPoints} />
                </div>
              </div>
            </div>

            <div className="panel incidents-panel">
              <div className="panel-header">
                <div>
                  <h2>Incidentes recientes</h2>
                  <span className="panel-sub">Ultimos 90 dias</span>
                </div>
                <span className={`status-pill ${openIncidents > 0 ? 'bad' : 'ok'}`}>
                  {openIncidents} abiertos
                </span>
              </div>
              <div className="panel-body scroll">
                <div className="incident-list">
                  {incidents.map((incident) => {
                    const active = !incident.end_at;
                    return (
                      <div className="incident-row" key={incident.id}>
                        <div>
                          <div className="node-name">{incident.node_name}</div>
                          <div className="node-meta">
                            Inicio {formatDate(incident.start_at)}
                            {incident.end_at ? ` - Fin ${formatDate(incident.end_at)}` : ' - En curso'}
                          </div>
                        </div>
                        <div className="incident-meta">
                          <span className={`status-pill ${active ? 'bad' : 'ok'}`}>
                            {active ? 'Abierto' : 'Cerrado'}
                          </span>
                          <span className="duration mono">{formatDuration(incident.duration_sec)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {!incidents.length && (
                    <div className="empty">No hay incidentes recientes.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : view === 'guide' ? (
        <section className="guide-view">
          <div className="panel guide-hero">
            <div className="panel-header">
              <div>
                <h2>Guia y puesta en marcha</h2>
                <span className="panel-sub">Que hace Moni-D y como se usa e instala.</span>
              </div>
            </div>
            <div className="guide-hero-body">
              <div className="guide-hero-text">
                <p>
                  Moni-D monitorea servicios TCP por IP y puerto, guarda historial en Postgres y
                  dispara alertas cuando un nodo cae. La vista monitor es abierta y la
                  administracion requiere login.
                </p>
                <div className="guide-pill-row">
                  <span className="status-pill ok">Activo</span>
                  <span className="status-pill bad">Inactivo</span>
                  <span className="status-pill muted">Pausado</span>
                </div>
              </div>
              <div className="guide-hero-meta">
                <div className="guide-meta-row">
                  <span className="label">Monitor</span>
                  <span className="mono">http://localhost:5173/monitor</span>
                </div>
                <div className="guide-meta-row">
                  <span className="label">Admin</span>
                  <span className="mono">http://localhost:5173/admin</span>
                </div>
                <div className="guide-meta-row">
                  <span className="label">API</span>
                  <span className="mono">http://localhost:4000</span>
                </div>
                <div className="guide-meta-row">
                  <span className="label">Base de datos</span>
                  <span>PostgreSQL</span>
                </div>
              </div>
            </div>
          </div>

          <div className="guide-grid">
            <div className="panel guide-card">
              <h3>Que monitorea</h3>
              <ul className="guide-list">
                <li>Disponibilidad TCP por IP y puerto.</li>
                <li>Uptime, latencia promedio e historial.</li>
                <li>Incidentes con notas y responsable.</li>
                <li>Alertas por correo y canales extra.</li>
              </ul>
            </div>
            <div className="panel guide-card">
              <h3>Como se aplica</h3>
              <ol className="guide-steps">
                <li>Ir a Administracion &gt; Nodos.</li>
                <li>Agregar nombre, IP, puerto y criticidad.</li>
                <li>Definir intervalos y destinatarios.</li>
                <li>Configurar alertas, silencios y escalamiento.</li>
                <li>Revisar incidentes y exportar reportes.</li>
              </ol>
            </div>
            <div className="panel guide-card">
              <h3>Instalacion local</h3>
              <p>Para pruebas en Windows con Postgres local.</p>
              <pre className="guide-code">
                <code>{`cd C:\\moni-D\\server
npm install
npm run migrate
npm run dev

cd ..\\web
npm install
npm run dev`}</code>
              </pre>
            </div>
            <div className="panel guide-card">
              <h3>Instalacion en servidor</h3>
              <p>Recomendado en Linux con servicio persistente.</p>
              <ul className="guide-list">
                <li>Configura .env en server y web.</li>
                <li>Usa PM2 o systemd para el backend.</li>
                <li>Compila el frontend con npm run build.</li>
                <li>Sirve el build con Nginx o similar.</li>
              </ul>
            </div>
            <div className="panel guide-card">
              <h3>Agente opcional</h3>
              <p>Para CPU, RAM y disco desde servidores.</p>
              <ul className="guide-list">
                <li>Define AGENT_KEY en el backend y reinicia.</li>
                <li>Obtiene el NodeId en Administracion &gt; Nodos.</li>
                <li>
                  Alertas CPU/RAM/Disco por nodo (defaults: CPU {DEFAULT_CPU_ALERT_PCT}% / RAM{' '}
                  {DEFAULT_MEM_ALERT_PCT}% / Disco {DEFAULT_DISK_ALERT_PCT}%).
                </li>
                <li>Cooldown de alertas: {DEFAULT_ALERT_COOLDOWN_MIN} min.</li>
              </ul>
              <pre className="guide-code">
                <code>{`# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\\windows-agent.ps1 -NodeId 5 -ApiUrl http://TU_IP:4000 -AgentKey TU_KEY -IntervalSec 60

# Linux
./linux-agent.sh --node-id 5 --api-url http://TU_IP:4000 --agent-key TU_KEY --interval 60`}</code>
              </pre>
              <div className="guide-note">Linux persistente: sudo ./install-linux-agent.sh</div>
            </div>
            <div className="panel guide-card">
              <h3>Buenas practicas</h3>
              <ul className="guide-list">
                <li>Define areas y grupos para filtrar rapido.</li>
                <li>Agrega tags para clasificar por tecnologia o servicio.</li>
                <li>Usa criticidad Alta para servicios clinicos.</li>
                <li>Activa ventanas de mantenimiento.</li>
                <li>Para acceso por IP: HOST=0.0.0.0 y VITE_API_URL/CORS_ORIGIN con IP.</li>
              </ul>
            </div>
          </div>
        </section>
      ) : (
        <section className="admin-view">
          {!authUser ? (
            <div className="panel login-panel">
              <div className="panel-header">
                <div>
                  <h2>Acceso administracion</h2>
                  <span className="panel-sub">Solo usuarios autorizados.</span>
                </div>
              </div>
              {authError ? <p className="alert">{authError}</p> : null}
              <form className="login-form" onSubmit={handleLogin}>
                <label>
                  Usuario
                  <input
                    value={loginForm.username}
                    onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })}
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                    required
                  />
                </label>
                <button className="primary" type="submit">
                  Entrar
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="admin-tabs">
                <button
                  className={`tab-btn ${adminTab === 'nodes' ? 'active' : ''}`}
                  onClick={() => setAdminTab('nodes')}
                >
                  Nodos
                </button>
                <button
                  className={`tab-btn ${adminTab === 'alerts' ? 'active' : ''}`}
                  onClick={() => setAdminTab('alerts')}
                >
                  Alertas
                </button>
                <button
                  className={`tab-btn ${adminTab === 'incidents' ? 'active' : ''}`}
                  onClick={() => setAdminTab('incidents')}
                >
                  Incidentes
                </button>
                <button
                  className={`tab-btn ${adminTab === 'reports' ? 'active' : ''}`}
                  onClick={() => setAdminTab('reports')}
                >
                  Reportes
                </button>
                <button
                  className={`tab-btn ${adminTab === 'agents' ? 'active' : ''}`}
                  onClick={() => setAdminTab('agents')}
                >
                  Agentes
                </button>
                <button
                  className={`tab-btn ${adminTab === 'audit' ? 'active' : ''}`}
                  onClick={() => setAdminTab('audit')}
                >
                  Auditoria
                </button>
              </div>
              {authError ? <p className="alert">{authError}</p> : null}
              {adminTab === 'nodes' && (
                <div className="admin-grid">
            <div className="panel admin-panel">
              <div className="panel-header">
                <div>
                  <h2>Administracion</h2>
                  <span className="panel-sub">Crear, editar, pausar o eliminar nodos.</span>
                </div>
                <div className="panel-actions">
                  <input
                    type="search"
                    placeholder="Buscar nodos"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <button className="ghost" onClick={loadData} disabled={state.loading}>
                    {state.loading ? 'Sincronizando' : 'Refresh'}
                  </button>
                </div>
              </div>
              {state.error ? <p className="alert">{state.error}</p> : null}
              <div className="admin-table">
                <div className="admin-row wide head">
                  <span>Nombre</span>
                  <span>Estado</span>
                  <span>Canales</span>
                  <span>Politica</span>
                  <span className="align-right">Acciones</span>
                </div>
                {sortedNodes.map((node) => {
                  const status = getStatus(node);
                  const area = normalizeLabel(node.area);
                  const group = normalizeLabel(node.groupName);
                  const policyName = policyNameById.get(node.escalationPolicyId || 0) || 'Default';
                  return (
                    <div className="admin-row wide" key={node.id}>
                      <div>
                        <strong>{node.name}</strong>
                        <div className="subtext">
                          {node.host}:{node.port} ? Area {area} ? Grupo {group} ? TLS{' '}
                          {node.tlsEnabled ? 'On' : 'Off'} ? Agent {node.agentEnabled ? 'On' : 'Off'}
                        </div>
                      </div>
                      <span className={`status-pill ${status.tone}`}>{status.label}</span>
                      <span className="count">{node.channelIds.length}</span>
                      <span className="muted">{policyName}</span>
                      <div className="admin-actions">
                        <button className="ghost" onClick={() => handleEdit(node)}>
                          Editar
                        </button>
                        <button
                          className={`ghost ${node.tlsEnabled ? 'active' : ''}`}
                          onClick={() => handleToggleTls(node)}
                        >
                          TLS {node.tlsEnabled ? 'On' : 'Off'}
                        </button>
                        <button className="ghost" onClick={() => handleToggle(node)}>
                          {node.enabled ? 'Pausar' : 'Reanudar'}
                        </button>
                        <button className="danger" onClick={() => handleDelete(node)}>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!sortedNodes.length && (
                  <div className="empty">No hay nodos. Usa el formulario para agregar.</div>
                )}
              </div>
            </div>

            <div className="panel admin-form">
              <div className="panel-header">
                <h2>{form.id ? 'Editar nodo' : 'Agregar nodo'}</h2>
                {form.id ? (
                  <button className="ghost" onClick={resetForm}>
                    Nuevo
                  </button>
                ) : null}
              </div>
              <form className="node-form" onSubmit={handleSubmit}>
                <label>
                  Nombre
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="RIS o PACS"
                    required
                  />
                </label>
                <label>
                  Host
                  <input
                    value={form.host}
                    onChange={(event) => setForm({ ...form, host: event.target.value })}
                    placeholder="10.0.0.10"
                    required
                  />
                </label>
                <div className="form-row">
                  <label>
                    Puerto
                    <input
                      type="number"
                      value={form.port}
                      onChange={(event) => setForm({ ...form, port: Number(event.target.value) })}
                      min={1}
                      max={65535}
                      required
                    />
                  </label>
                  <label>
                    Activo
                    <select
                      value={form.enabled ? 'yes' : 'no'}
                      onChange={(event) => setForm({ ...form, enabled: event.target.value === 'yes' })}
                    >
                      <option value="yes">Si</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Area
                    <input
                      value={form.area}
                      onChange={(event) => setForm({ ...form, area: event.target.value })}
                      placeholder="PACS, RIS, DB, ERP"
                    />
                  </label>
                  <label>
                    Grupo
                    <input
                      value={form.groupName}
                      onChange={(event) => setForm({ ...form, groupName: event.target.value })}
                      placeholder="Produccion, QA"
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Criticidad
                    <select
                      value={form.criticality}
                      onChange={(event) => setForm({ ...form, criticality: event.target.value })}
                    >
                      {CRITICALITY_OPTIONS.map((crit) => (
                        <option key={crit} value={crit}>
                          {getCriticalityLabel(crit)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    TLS
                    <select
                      value={form.tlsEnabled ? 'yes' : 'no'}
                      onChange={(event) => setForm({ ...form, tlsEnabled: event.target.value === 'yes' })}
                    >
                      <option value="yes">Si</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Escalamiento
                    <select
                      value={form.escalationPolicyId ?? ''}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          escalationPolicyId: event.target.value
                            ? Number(event.target.value)
                            : null
                        })
                      }
                    >
                      <option value="">Default</option>
                      {policyOptions.map((policy) => (
                        <option key={policy.id} value={policy.id}>
                          {policy.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Agente
                    <select
                      value={form.agentEnabled ? 'yes' : 'no'}
                      onChange={(event) =>
                        setForm({ ...form, agentEnabled: event.target.value === 'yes' })
                      }
                    >
                      <option value="yes">Si</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    CPU alerta (%)
                    <input
                      type="number"
                      value={form.cpuAlertPct}
                      onChange={(event) =>
                        setForm({ ...form, cpuAlertPct: Number(event.target.value) })
                      }
                      min={1}
                      max={100}
                    />
                  </label>
                  <label>
                    RAM alerta (%)
                    <input
                      type="number"
                      value={form.memAlertPct}
                      onChange={(event) =>
                        setForm({ ...form, memAlertPct: Number(event.target.value) })
                      }
                      min={1}
                      max={100}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Disco alerta (%)
                    <input
                      type="number"
                      value={form.diskAlertPct}
                      onChange={(event) =>
                        setForm({ ...form, diskAlertPct: Number(event.target.value) })
                      }
                      min={1}
                      max={100}
                    />
                  </label>
                  <label>
                    Cooldown (min)
                    <input
                      type="number"
                      value={form.alertCooldownMin}
                      onChange={(event) =>
                        setForm({ ...form, alertCooldownMin: Number(event.target.value) })
                      }
                      min={0}
                      max={1440}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Check interval (sec)
                    <input
                      type="number"
                      value={form.checkIntervalSec}
                      onChange={(event) =>
                        setForm({ ...form, checkIntervalSec: Number(event.target.value) })
                      }
                      min={10}
                    />
                  </label>
                  <label>
                    Retry interval (sec)
                    <input
                      type="number"
                      value={form.retryIntervalSec}
                      onChange={(event) =>
                        setForm({ ...form, retryIntervalSec: Number(event.target.value) })
                      }
                      min={10}
                    />
                  </label>
                </div>
                <label>
                  Timeout (ms)
                  <input
                    type="number"
                    value={form.timeoutMs}
                    onChange={(event) => setForm({ ...form, timeoutMs: Number(event.target.value) })}
                    min={100}
                  />
                </label>
                <label>
                  Tags (comma o nueva linea)
                  <textarea
                    value={form.tagsText}
                    onChange={(event) => setForm({ ...form, tagsText: event.target.value })}
                    placeholder="critico, dcm, hl7"
                    rows={2}
                  />
                </label>
                <label>
                  Recipients (comma o nueva linea)
                  <textarea
                    value={form.recipientsText}
                    onChange={(event) => setForm({ ...form, recipientsText: event.target.value })}
                    placeholder="ops@company.com, it@company.com"
                    rows={3}
                  />
                </label>
                <div className="channel-picker">
                  <span className="label">Canales de alerta</span>
                  <div className="checkbox-group">
                    {alertChannels.map((channel) => (
                      <label className="checkbox" key={channel.id}>
                        <input
                          type="checkbox"
                          checked={form.channelIds.includes(channel.id)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setForm((prev) => ({
                              ...prev,
                              channelIds: checked
                                ? [...prev.channelIds, channel.id]
                                : prev.channelIds.filter((id) => id !== channel.id)
                            }));
                          }}
                        />
                        <span>{channel.name}</span>
                        <span className="muted">{channel.type}</span>
                      </label>
                    ))}
                    {!alertChannels.length && (
                      <span className="muted">No hay canales configurados.</span>
                    )}
                  </div>
                </div>
                <button className="primary" type="submit">
                  {form.id ? 'Guardar' : 'Crear nodo'}
                </button>
              </form>
            </div>
          </div>
        )}
        {adminTab === 'alerts' && (
          <div className="admin-section">
            <div className="admin-grid">
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Canales de alerta</h2>
                    <span className="panel-sub">Webhook, Teams, Slack o SMS.</span>
                  </div>
                </div>
                <div className="admin-table">
                  <div className="admin-row head">
                    <span>Nombre</span>
                    <span>Tipo</span>
                    <span>Estado</span>
                    <span className="align-right">Acciones</span>
                  </div>
                  {alertChannels.map((channel) => (
                    <div className="admin-row" key={channel.id}>
                      <div>
                        <strong>{channel.name}</strong>
                        <div className="subtext">{channel.config?.url || 'Sin URL'}</div>
                      </div>
                      <span className="mono">{channel.type}</span>
                      <span className={`status-pill ${channel.enabled ? 'ok' : 'muted'}`}>
                        {channel.enabled ? 'Activo' : 'Off'}
                      </span>
                      <div className="admin-actions">
                        <button className="ghost" onClick={() => handleChannelEdit(channel)}>
                          Editar
                        </button>
                        <button className="danger" onClick={() => handleChannelDelete(channel)}>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                  {!alertChannels.length && (
                    <div className="empty">No hay canales configurados.</div>
                  )}
                </div>
                <form className="mini-form" onSubmit={handleChannelSubmit}>
                  <label>
                    Nombre
                    <input
                      value={channelForm.name}
                      onChange={(event) => setChannelForm({ ...channelForm, name: event.target.value })}
                      required
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Tipo
                      <select
                        value={channelForm.type}
                        onChange={(event) => setChannelForm({ ...channelForm, type: event.target.value })}
                      >
                        <option value="webhook">Webhook</option>
                        <option value="teams">Teams</option>
                        <option value="slack">Slack</option>
                        <option value="sms">SMS</option>
                      </select>
                    </label>
                    <label>
                      Activo
                      <select
                        value={channelForm.enabled ? 'yes' : 'no'}
                        onChange={(event) =>
                          setChannelForm({ ...channelForm, enabled: event.target.value === 'yes' })
                        }
                      >
                        <option value="yes">Si</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Webhook URL
                    <input
                      value={channelForm.url}
                      onChange={(event) => setChannelForm({ ...channelForm, url: event.target.value })}
                      placeholder="https://..."
                      required
                    />
                  </label>
                  <button className="primary" type="submit">
                    {channelForm.id ? 'Actualizar canal' : 'Crear canal'}
                  </button>
                </form>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Silencios</h2>
                    <span className="panel-sub">Ventanas de mantenimiento.</span>
                  </div>
                </div>
                <div className="admin-table">
                  <div className="admin-row head">
                    <span>Nombre</span>
                    <span>Alcance</span>
                    <span>Ventana</span>
                    <span className="align-right">Acciones</span>
                  </div>
                  {silences.map((silence) => {
                    const scope =
                      silence.nodeId
                        ? `Nodo ${silence.nodeId}`
                        : [silence.area, silence.groupName, silence.tag, silence.criticality]
                            .filter((value) => value && value.length)
                            .join(' | ') || 'Global';
                    const windowLabel = `${formatDate(silence.startAt)} - ${
                      silence.endAt ? formatDate(silence.endAt) : 'Sin fin'
                    }`;
                    return (
                      <div className="admin-row" key={silence.id}>
                        <div>
                          <strong>{silence.name}</strong>
                          <div className="subtext">{scope}</div>
                        </div>
                        <span className={`status-pill ${silence.enabled ? 'ok' : 'muted'}`}>
                          {silence.enabled ? 'Activo' : 'Off'}
                        </span>
                        <span className="muted">{windowLabel}</span>
                        <div className="admin-actions">
                          <button className="ghost" onClick={() => handleSilenceEdit(silence)}>
                            Editar
                          </button>
                          <button className="danger" onClick={() => handleSilenceDelete(silence)}>
                            Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!silences.length && <div className="empty">No hay silencios.</div>}
                </div>
                <form className="mini-form" onSubmit={handleSilenceSubmit}>
                  <label>
                    Nombre
                    <input
                      value={silenceForm.name}
                      onChange={(event) => setSilenceForm({ ...silenceForm, name: event.target.value })}
                      required
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Inicio
                      <input
                        type="datetime-local"
                        value={silenceForm.startAt}
                        onChange={(event) =>
                          setSilenceForm({ ...silenceForm, startAt: event.target.value })
                        }
                        required
                      />
                    </label>
                    <label>
                      Fin
                      <input
                        type="datetime-local"
                        value={silenceForm.endAt}
                        onChange={(event) =>
                          setSilenceForm({ ...silenceForm, endAt: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="form-row">
                    <label>
                      Duracion rapida
                      <select
                        value={silenceDuration}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSilenceDuration(value);
                          const minutes = Number(value);
                          if (Number.isFinite(minutes) && minutes > 0) {
                            applySilenceDuration(minutes);
                          }
                        }}
                      >
                        <option value="">Manual</option>
                        <option value="30">30 min</option>
                        <option value="60">1 hora</option>
                        <option value="120">2 horas</option>
                        <option value="240">4 horas</option>
                        <option value="480">8 horas</option>
                        <option value="1440">24 horas</option>
                      </select>
                    </label>
                    <label>
                      Activo
                      <select
                        value={silenceForm.enabled ? 'yes' : 'no'}
                        onChange={(event) =>
                          setSilenceForm({ ...silenceForm, enabled: event.target.value === 'yes' })
                        }
                      >
                        <option value="yes">Si</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                  </div>
                  <div className="form-row">
                    <label>
                      Nodo
                      <select
                        value={silenceForm.nodeId}
                        onChange={(event) =>
                          setSilenceForm({ ...silenceForm, nodeId: event.target.value })
                        }
                      >
                        <option value="">Todos</option>
                        {nodes.map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="form-row">
                    <label>
                      Area
                      <input
                        value={silenceForm.area}
                        onChange={(event) => setSilenceForm({ ...silenceForm, area: event.target.value })}
                      />
                    </label>
                    <label>
                      Grupo
                      <input
                        value={silenceForm.groupName}
                        onChange={(event) =>
                          setSilenceForm({ ...silenceForm, groupName: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="form-row">
                    <label>
                      Tag
                      <input
                        value={silenceForm.tag}
                        onChange={(event) => setSilenceForm({ ...silenceForm, tag: event.target.value })}
                      />
                    </label>
                    <label>
                      Criticidad
                      <input
                        value={silenceForm.criticality}
                        onChange={(event) =>
                          setSilenceForm({ ...silenceForm, criticality: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <button className="primary" type="submit">
                    {silenceForm.id ? 'Actualizar silencio' : 'Crear silencio'}
                  </button>
                </form>
              </div>
            </div>

            <div className="panel escalation-panel">
              <div className="panel-header">
                <div>
                  <h2>Politica de escalamiento</h2>
                  <span className="panel-sub">Niveles y tiempos de respuesta.</span>
                </div>
                <button className="ghost" onClick={handlePolicySave}>
                  Guardar
                </button>
              </div>
              <div className="policy-form">
                <div className="form-row">
                  <label>
                    Nombre
                    <input
                      value={policyForm.name}
                      onChange={(event) => setPolicyForm({ ...policyForm, name: event.target.value })}
                    />
                  </label>
                  <label>
                    Activo
                    <select
                      value={policyForm.enabled ? 'yes' : 'no'}
                      onChange={(event) =>
                        setPolicyForm({ ...policyForm, enabled: event.target.value === 'yes' })
                      }
                    >
                      <option value="yes">Si</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                </div>
                <div className="policy-levels">
                  {policyForm.levels.map((level, idx) => (
                    <div className="policy-level" key={`${level.level}-${idx}`}>
                      <div className="policy-level-header">
                        <strong>Nivel {level.level}</strong>
                        <button className="ghost" onClick={() => handlePolicyLevelRemove(idx)}>
                          Quitar
                        </button>
                      </div>
                      <div className="form-row">
                        <label>
                          Delay (min)
                          <input
                            type="number"
                            min={0}
                            value={level.delayMin}
                            onChange={(event) =>
                              handlePolicyLevelUpdate(idx, {
                                delayMin: Number(event.target.value)
                              })
                            }
                          />
                        </label>
                        <label>
                          Incluye recipients nodo
                          <select
                            value={level.includeNodeRecipients ? 'yes' : 'no'}
                            onChange={(event) =>
                              handlePolicyLevelUpdate(idx, {
                                includeNodeRecipients: event.target.value === 'yes'
                              })
                            }
                          >
                            <option value="yes">Si</option>
                            <option value="no">No</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        IDs de canal (coma)
                        <input
                          value={level.channelIds.join(', ')}
                          onChange={(event) =>
                            handlePolicyLevelUpdate(idx, {
                              channelIds: parseList(event.target.value)
                                .map((id) => Number(id))
                                .filter((id) => Number.isFinite(id))
                            })
                          }
                        />
                      </label>
                      <label>
                        Correos (coma, multiples)
                        <input
                          value={level.emails.join(', ')}
                          onChange={(event) =>
                            handlePolicyLevelUpdate(idx, {
                              emails: parseList(event.target.value)
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                  {!policyForm.levels.length && (
                    <div className="empty">Agrega niveles para la politica.</div>
                  )}
                  <button className="ghost" onClick={handlePolicyLevelAdd}>
                    Agregar nivel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {adminTab === 'incidents' && (
          <div className="admin-grid">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Incidentes</h2>
                  <span className="panel-sub">Gestion y seguimiento.</span>
                </div>
                <div className="panel-actions">
                  <button className="ghost" onClick={handleExportIncidents}>
                    Export CSV
                  </button>
                  <button className="ghost" onClick={handleExportIncidentsPdf}>
                    Export PDF
                  </button>
                </div>
              </div>
              <div className="panel-body scroll">
                <div className="incident-list">
                  {incidents.map((incident) => {
                    const active = !incident.end_at;
                    const acked = Boolean(incident.ack_at);
                    return (
                      <button
                        className={`incident-row ${selectedIncidentId === incident.id ? 'active' : ''}`}
                        key={incident.id}
                        onClick={() => handleSelectIncident(incident.id)}
                      >
                        <div>
                          <div className="node-name">{incident.node_name}</div>
                          <div className="node-meta">
                            Inicio {formatDate(incident.start_at)} ? {active ? 'En curso' : 'Cerrado'}
                          </div>
                        </div>
                        <div className="incident-meta">
                          <span className={`status-pill ${active ? 'bad' : 'ok'}`}>
                            {active ? 'Abierto' : 'Cerrado'}
                          </span>
                          <span className={`status-pill ${acked ? 'ok' : 'warn'}`}>
                            {acked ? 'Ack' : 'Sin ack'}
                          </span>
                          <span className="duration mono">{formatDuration(incident.duration_sec)}</span>
                        </div>
                      </button>
                    );
                  })}
                  {!incidents.length && <div className="empty">No hay incidentes.</div>}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Detalle</h2>
                  <span className="panel-sub">Notas y responsable.</span>
                </div>
              </div>
              {selectedIncident ? (
                <div className="incident-detail">
                  <div className="detail-header">
                    <div>
                      <div className="node-name">{selectedIncident.node_name}</div>
                      <div className="node-meta">
                        Inicio {formatDate(selectedIncident.start_at)} ?{' '}
                        {selectedIncident.end_at ? 'Cerrado' : 'Abierto'}
                      </div>
                    </div>
                    <div className="detail-actions">
                      {selectedIncident.ack_at ? (
                        <button className="ghost" onClick={() => handleClearAck(selectedIncident.id)}>
                          Quitar ack
                        </button>
                      ) : (
                        <button className="ghost" onClick={() => handleAckIncident(selectedIncident.id)}>
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="detail-meta">
                    <span className={`status-pill ${selectedIncident.ack_at ? 'ok' : 'warn'}`}>
                      {selectedIncident.ack_at ? 'Ack' : 'Sin ack'}
                    </span>
                    {selectedIncident.ack_at ? (
                      <span className="muted">
                        Por {selectedIncident.ack_by || '-'} ? {formatDate(selectedIncident.ack_at)}
                      </span>
                    ) : null}
                  </div>
                  {!selectedIncident.ack_at ? (
                    <label>
                      Nota de ack (opcional)
                      <textarea
                        value={incidentAckDraft}
                        onChange={(event) => setIncidentAckDraft(event.target.value)}
                        rows={2}
                      />
                    </label>
                  ) : selectedIncident.ack_note ? (
                    <div className="note ack-note">
                      <div className="note-meta">Nota de ack</div>
                      <div>{selectedIncident.ack_note}</div>
                    </div>
                  ) : null}
                  <label>
                    Responsable
                    <input
                      value={incidentOwnerDraft}
                      onChange={(event) => setIncidentOwnerDraft(event.target.value)}
                      placeholder="Nombre o equipo"
                    />
                  </label>
                  <button className="ghost" onClick={handleOwnerSave}>
                    Guardar responsable
                  </button>
                  <div className="notes">
                    <div className="notes-header">Notas</div>
                    {incidentNotes.map((note) => (
                      <div className="note" key={note.id}>
                        <div className="note-meta">
                          {note.author} ? {formatDate(note.createdAt)}
                        </div>
                        <div>{note.note}</div>
                      </div>
                    ))}
                    {!incidentNotes.length && <div className="empty">Sin notas.</div>}
                    <label>
                      Agregar nota
                      <textarea
                        value={incidentNoteDraft}
                        onChange={(event) => setIncidentNoteDraft(event.target.value)}
                        rows={3}
                      />
                    </label>
                    <button className="primary" type="button" onClick={handleAddIncidentNote}>
                      Guardar nota
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty">Selecciona un incidente para ver detalle.</div>
              )}
            </div>
          </div>
        )}
        {adminTab === 'reports' && (
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Reporte semanal</h2>
                <span className="panel-sub">Destinatarios del resumen.</span>
              </div>
            </div>
            <div className="report-grid">
              <div className="report-list">
                {reportRecipients.map((recipient) => (
                  <div className="admin-row" key={recipient.id}>
                    <span>{recipient.email}</span>
                    <div className="admin-actions">
                      <button className="danger" onClick={() => handleReportDelete(recipient)}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
                {!reportRecipients.length && <div className="empty">No hay destinatarios aun.</div>}
              </div>
              <div className="report-form">
                <label>
                  Agregar destinatario
                  <input
                    value={reportEmail}
                    onChange={(event) => setReportEmail(event.target.value)}
                    placeholder="ops@company.com"
                  />
                </label>
                <button className="primary" onClick={handleReportAdd}>
                  Agregar
                </button>
              </div>
            </div>
          </div>
        )}
        {adminTab === 'agents' && (
          <div className="agent-grid">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Metricas de agentes</h2>
                  <span className="panel-sub">CPU, RAM y disco reportados.</span>
                </div>
                <span className="panel-badge">Umbrales por nodo</span>
              </div>
              <div className="admin-table">
                <div className="admin-row wide head">
                  <span>Servicio</span>
                  <span>CPU</span>
                  <span>RAM</span>
                  <span>Disco</span>
                  <span>Actualizado</span>
                </div>
                {agentMetrics.map((metric) => {
                  const node = nodeById.get(metric.nodeId);
                  const thresholds = getThresholds(node);
                  const cpuHigh =
                    metric.cpuPct !== null &&
                    metric.cpuPct !== undefined &&
                    metric.cpuPct >= thresholds.cpu;
                  const memHigh =
                    metric.memPct !== null &&
                    metric.memPct !== undefined &&
                    metric.memPct >= thresholds.mem;
                  const diskHigh =
                    metric.diskPct !== null &&
                    metric.diskPct !== undefined &&
                    metric.diskPct >= thresholds.disk;
                  return (
                    <div className="admin-row wide" key={metric.nodeId}>
                      <div>
                        <strong>{metric.nodeName}</strong>
                        <div className="subtext">
                          {metric.host}:{metric.port}
                        </div>
                      </div>
                      <span className={`mono ${cpuHigh ? 'metric-high' : ''}`}>
                        {formatPercent(metric.cpuPct)}
                      </span>
                      <span className={`mono ${memHigh ? 'metric-high' : ''}`}>
                        {formatPercent(metric.memPct)}
                      </span>
                      <span className={`mono ${diskHigh ? 'metric-high' : ''}`}>
                        {formatPercent(metric.diskPct)}
                      </span>
                      <span className="mono">{formatDate(metric.collectedAt)}</span>
                    </div>
                  );
                })}
                {!agentMetrics.length && <div className="empty">No hay datos de agentes aun.</div>}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Historico por servidor</h2>
                  <span className="panel-sub">Promedios de CPU/RAM/Disk.</span>
                </div>
                <div className="panel-actions">
                  <select
                    value={agentSeriesNodeId ?? ''}
                    onChange={(event) => setAgentSeriesNodeId(Number(event.target.value))}
                  >
                    <option value="" disabled>
                      Seleccionar nodo
                    </option>
                    {agentMetrics.map((metric) => (
                      <option key={metric.nodeId} value={metric.nodeId}>
                        {metric.nodeName}
                      </option>
                    ))}
                  </select>
                  <div className="segmented">
                    {[1, 7, 30].map((days) => (
                      <button
                        key={days}
                        className={`ghost ${agentSeriesDays === days ? 'active' : ''}`}
                        onClick={() => setAgentSeriesDays(days)}
                      >
                        {days === 1 ? '24h' : `${days}d`}
                      </button>
                    ))}
                  </div>
                  <span className="panel-badge">
                    CPU {agentThresholds.cpu}% RAM {agentThresholds.mem}% DISK {agentThresholds.disk}%
                  </span>
                </div>
              </div>
              <div className="agent-series-grid">
                <div className={`agent-series-card ${agentCpuHigh ? 'bad' : ''}`}>
                  <span className="label">CPU</span>
                  <Sparkline points={agentSeriesCpu} />
                  <span className="mono">{formatPercent(agentSeriesLatest?.cpuPct ?? null)}</span>
                </div>
                <div className={`agent-series-card ${agentMemHigh ? 'bad' : ''}`}>
                  <span className="label">RAM</span>
                  <Sparkline points={agentSeriesMem} />
                  <span className="mono">{formatPercent(agentSeriesLatest?.memPct ?? null)}</span>
                </div>
                <div className={`agent-series-card ${agentDiskHigh ? 'bad' : ''}`}>
                  <span className="label">DISK</span>
                  <Sparkline points={agentSeriesDisk} />
                  <span className="mono">{formatPercent(agentSeriesLatest?.diskPct ?? null)}</span>
                </div>
              </div>
              {!agentSeries.length && (
                <div className="empty">Sin historico para el nodo seleccionado.</div>
              )}
            </div>
          </div>
        )}
        {adminTab === 'audit' && (
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Auditoria</h2>
                <span className="panel-sub">Ultimos cambios registrados.</span>
              </div>
            </div>
            <div className="admin-table">
              <div className="admin-row head">
                <span>Accion</span>
                <span>Actor</span>
                <span>Entidad</span>
                <span>Fecha</span>
              </div>
              {auditLogs.map((log) => (
                <div className="admin-row" key={log.id}>
                  <span className="mono">{log.action}</span>
                  <span>{log.actor || '-'}</span>
                  <span className="muted">{log.entity_type || '-'}</span>
                  <span className="mono">{formatDate(log.created_at)}</span>
                </div>
              ))}
              {!auditLogs.length && <div className="empty">Sin registros.</div>}
            </div>
          </div>
        )}
      </>
    )}
        </section>
      )}
    </div>
  );
}
