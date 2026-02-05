import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth';
import { env } from '../env';
import { sendDiskAlert } from '../email';
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
  setAgentDiskAlertState,
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

function buildDiskPayload(params: {
  node: NodeConfig;
  diskPct: number;
  threshold: number;
}) {
  const { node, diskPct, threshold } = params;
  return {
    type: 'disk_high',
    at: new Date().toISOString(),
    thresholdPct: threshold,
    diskPct,
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

async function handleDiskAlert(params: { nodeId: number; diskPct: number }) {
  const { nodeId, diskPct } = params;
  if (!Number.isFinite(diskPct)) {
    return;
  }
  const node = await getNodeConfig(nodeId);
  if (!node) {
    return;
  }
  if (!node.agentEnabled) {
    return;
  }

  const threshold = env.DISK_ALERT_PCT;
  const isHigh = diskPct >= threshold;
  const state = await getAgentAlertState(nodeId);

  if (!isHigh) {
    if (state.diskAlertActive) {
      await setAgentDiskAlertState({ nodeId, active: false, lastAlertAt: null });
    }
    return;
  }

  if (state.diskAlertActive) {
    return;
  }

  const silenced = await isNodeSilenced({
    id: node.id,
    area: node.area ?? null,
    groupName: node.groupName ?? null,
    criticality: node.criticality ?? null,
    tags: node.tags || []
  });
  if (silenced) {
    return;
  }

  const recipients = await getRecipientsForNode(node.id);
  const channels = await listAlertChannelsForNode(node.id);
  const payload = buildDiskPayload({ node, diskPct, threshold });
  const enabledChannels = channels.filter((channel) => channel.enabled);

  let emailSent = false;
  let subject = '';
  if (recipients.length) {
    try {
      const res = await sendDiskAlert({
        node,
        recipients,
        diskPct,
        threshold
      });
      subject = res.subject;
      emailSent = !res.skipped;
      if (emailSent) {
        await createNotification({
          nodeId: node.id,
          type: 'disk_high',
          recipients,
          subject
        });
      }
    } catch (err: any) {
      console.error('disk email alert failed', node.name, err?.message || err);
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
        type: 'disk_high',
        channelId: channel.id,
        recipients: channel.name,
        dedupKey: `disk_high:${node.id}`
      });
    } catch (err: any) {
      console.error('disk channel alert failed', channel.name, err?.message || err);
    }
  }

  if (emailSent || channelSent) {
    await recordAlertEvent({
      incidentId: null,
      nodeId: node.id,
      type: 'disk_high',
      recipients: recipients.join(','),
      dedupKey: `disk_high:${node.id}`
    });
    await setAgentDiskAlertState({
      nodeId: node.id,
      active: true,
      lastAlertAt: new Date().toISOString()
    });
  }
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

    await recordAgentMetric({
      nodeId: body.nodeId,
      cpuPct: body.cpuPct ?? null,
      memPct: body.memPct ?? null,
      diskPct: body.diskPct ?? null,
      loadAvg: body.loadAvg ?? null,
      processes: body.processes ?? null
    });

    if (body.diskPct !== undefined && body.diskPct !== null) {
      try {
        await handleDiskAlert({ nodeId: body.nodeId, diskPct: Number(body.diskPct) });
      } catch (err: any) {
        console.error('disk alert handler failed', err?.message || err);
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
