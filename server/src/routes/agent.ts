import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth';
import { env } from '../env';
import { sendMetricAlert } from '../email';
import {
  createAuditLog,
  createNotification,
  getAgentAlertState,
  getNodeConfig,
  getRecipientsForNode,
  isNodeSilenced,
  listAlertChannelsForNode,
  listAgentSeries,
  listLatestAgentMetrics,
  listLatestAgentMetricsPublic,
  recordAlertEvent,
  recordAgentMetric,
  setAgentMetricAlertState,
  type AgentAlertState,
  type NodeConfig
} from '../store';

function requireAgentKey(req: any, reply: any) {
  if (!env.AGENT_KEY) {
    reply.code(403).send({ error: 'agent disabled' });
    return false;
  }
  const key = req.headers['x-agent-key'];
  if (!key || key !== env.AGENT_KEY) {
    reply.code(401).send({ error: 'invalid agent key' });
    return false;
  }
  return true;
}

async function sendChannelAlert(channel: any, payload: any) {
  const config = channel.config || {};
  const url = config.url as string | undefined;
  if (!url) {
    throw new Error('channel missing url');
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.headers || {})
  };
  const method = (config.method as string) || 'POST';
  const body = config.body ? String(config.body) : JSON.stringify(payload);
  const res = await fetch(url, {
    method,
    headers,
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `channel ${channel.id} failed`);
  }
}

type MetricKey = 'cpu' | 'mem' | 'disk';
type MetricStatus = 'high' | 'recovered';

const METRIC_LABELS: Record<MetricKey, string> = {
  cpu: 'CPU',
  mem: 'RAM',
  disk: 'Disco'
};

function getMetricThreshold(node: NodeConfig, metric: MetricKey) {
  if (metric === 'cpu') return node.cpuAlertPct;
  if (metric === 'mem') return node.memAlertPct;
  return node.diskAlertPct;
}

function metricAlertType(metric: MetricKey, status: MetricStatus) {
  return `${metric}_${status === 'high' ? 'high' : 'recovered'}`;
}

function buildMetricPayload(params: {
  node: NodeConfig;
  metric: MetricKey;
  status: MetricStatus;
  value: number;
  threshold: number;
}) {
  const { node, metric, status, value, threshold } = params;
  return {
    type: metricAlertType(metric, status),
    status: status === 'high' ? 'HIGH' : 'OK',
    metric,
    metricLabel: METRIC_LABELS[metric],
    at: new Date().toISOString(),
    valuePct: value,
    thresholdPct: threshold,
    node: {
      id: node.id,
      name: node.name,
      host: node.host,
      port: node.port,
      area: node.area,
      groupName: node.groupName,
      criticality: node.criticality,
      tags: node.tags
    }
  };
}

function isCooldownActive(lastAlertAt: string | null, cooldownMin: number) {
  if (!lastAlertAt || cooldownMin <= 0) {
    return false;
  }
  const last = new Date(lastAlertAt).getTime();
  if (Number.isNaN(last)) {
    return false;
  }
  return Date.now() - last < cooldownMin * 60_000;
}

async function dispatchMetricAlert(params: {
  node: NodeConfig;
  metric: MetricKey;
  status: MetricStatus;
  value: number;
  threshold: number;
  recipients: string[];
  channels: any[];
}) {
  const { node, metric, status, value, threshold, recipients, channels } = params;
  const type = metricAlertType(metric, status);
  const payload = buildMetricPayload({ node, metric, status, value, threshold });
  const enabledChannels = channels.filter((channel) => channel.enabled);

  let emailSent = false;
  if (recipients.length) {
    try {
      const res = await sendMetricAlert({
        node,
        recipients,
        metric,
        status,
        value,
        threshold
      });
      emailSent = !res.skipped;
      if (emailSent) {
        await createNotification({
          nodeId: node.id,
          type,
          recipients,
          subject: res.subject
        });
        await recordAlertEvent({
          incidentId: null,
          nodeId: node.id,
          type,
          recipients: recipients.join(','),
          dedupKey: `${type}:${node.id}`
        });
      }
    } catch (err: any) {
      console.error('metric email alert failed', node.name, err?.message || err);
    }
  }

  let channelSent = false;
  for (const channel of enabledChannels) {
    try {
      await sendChannelAlert(channel, payload);
      channelSent = true;
      await recordAlertEvent({
        incidentId: null,
        nodeId: node.id,
        type,
        channelId: channel.id,
        recipients: channel.name,
        dedupKey: `${type}:${node.id}:${channel.id ?? 'chan'}`
      });
    } catch (err: any) {
      console.error('metric channel alert failed', channel.name, err?.message || err);
    }
  }

  return emailSent || channelSent;
}

async function handleMetricAlert(params: {
  node: NodeConfig;
  metric: MetricKey;
  value: number | null | undefined;
  state: AgentAlertState;
  silenced: boolean;
  cooldownMin: number;
  loadTargets: () => Promise<{ recipients: string[]; channels: any[] }>;
}) {
  const { node, metric, value, state, silenced, cooldownMin, loadTargets } = params;
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return;
  }
  const numericValue = Number(value);
  const threshold = getMetricThreshold(node, metric);
  const metricState = state[metric];
  const high = numericValue >= threshold;

  if (high) {
    if (metricState.active) {
      return;
    }
    if (isCooldownActive(metricState.lastAlertAt, cooldownMin)) {
      return;
    }
    if (silenced) {
      return;
    }
    const targets = await loadTargets();
    if (!targets.recipients.length && !targets.channels.length) {
      return;
    }
    const sent = await dispatchMetricAlert({
      node,
      metric,
      status: 'high',
      value: numericValue,
      threshold,
      recipients: targets.recipients,
      channels: targets.channels
    });
    if (sent) {
      await setAgentMetricAlertState({
        nodeId: node.id,
        metric,
        active: true,
        lastAlertAt: new Date().toISOString()
      });
    }
    return;
  }

  if (!metricState.active) {
    return;
  }
  if (silenced) {
    await setAgentMetricAlertState({
      nodeId: node.id,
      metric,
      active: false,
      lastAlertAt: metricState.lastAlertAt
    });
    return;
  }

  const targets = await loadTargets();
  if (targets.recipients.length || targets.channels.length) {
    await dispatchMetricAlert({
      node,
      metric,
      status: 'recovered',
      value: numericValue,
      threshold,
      recipients: targets.recipients,
      channels: targets.channels
    });
  }
  await setAgentMetricAlertState({
    nodeId: node.id,
    metric,
    active: false,
    lastAlertAt: metricState.lastAlertAt
  });
}

export async function registerAgentRoutes(app: FastifyInstance) {
  app.post('/api/agent/metrics', async (req, reply) => {
    if (!requireAgentKey(req, reply)) {
      return;
    }
    const body = z
      .object({
        nodeId: z.coerce.number().int(),
        cpuPct: z.coerce.number().optional(),
        memPct: z.coerce.number().optional(),
        diskPct: z.coerce.number().optional(),
        loadAvg: z.coerce.number().optional(),
        processes: z.any().optional()
      })
      .parse(req.body);

    const node = await getNodeConfig(body.nodeId);
    if (!node) {
      reply.code(404).send({ error: 'node not found' });
      return;
    }

    await recordAgentMetric({
      nodeId: body.nodeId,
      cpuPct: body.cpuPct ?? null,
      memPct: body.memPct ?? null,
      diskPct: body.diskPct ?? null,
      loadAvg: body.loadAvg ?? null,
      processes: body.processes ?? null
    });

    if (node.agentEnabled) {
      try {
        const state = await getAgentAlertState(node.id);
        const silenced = await isNodeSilenced({
          id: node.id,
          area: node.area ?? null,
          groupName: node.groupName ?? null,
          criticality: node.criticality ?? null,
          tags: node.tags || []
        });
        const cooldownMin = node.alertCooldownMin ?? env.ALERT_COOLDOWN_MIN;
        let targets: { recipients: string[]; channels: any[] } | null = null;
        const loadTargets = async () => {
          if (!targets) {
            const [recipients, channels] = await Promise.all([
              getRecipientsForNode(node.id),
              listAlertChannelsForNode(node.id)
            ]);
            targets = { recipients, channels };
          }
          return targets;
        };

        const metrics: Array<{ metric: MetricKey; value: number | null | undefined }> = [
          { metric: 'cpu', value: body.cpuPct },
          { metric: 'mem', value: body.memPct },
          { metric: 'disk', value: body.diskPct }
        ];

        for (const item of metrics) {
          try {
            await handleMetricAlert({
              node,
              metric: item.metric,
              value: item.value,
              state,
              silenced,
              cooldownMin,
              loadTargets
            });
          } catch (err: any) {
            console.error('metric alert handler failed', node.name, item.metric, err?.message || err);
          }
        }
      } catch (err: any) {
        console.error('agent alert handler failed', node.name, err?.message || err);
      }
    }

    reply.send({ ok: true });
  });

  app.get('/api/agent/summary', async () => {
    const metrics = await listLatestAgentMetricsPublic();
    return { metrics };
  });

  app.get('/api/agent/series', { preHandler: requireRole(['admin']) }, async (req) => {
    const query = z
      .object({
        nodeId: z.coerce.number().int(),
        days: z.coerce.number().int().min(1).max(365).default(7),
        bucket: z.enum(['hour', 'day']).default('hour')
      })
      .parse(req.query);

    const series = await listAgentSeries({
      nodeId: query.nodeId,
      days: query.days,
      bucket: query.bucket
    });
    return { series };
  });

  app.get('/api/agent/latest', { preHandler: requireRole(['admin']) }, async (req) => {
    const metrics = await listLatestAgentMetrics();
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'agent.metrics.view'
    });
    return { metrics };
  });
}
