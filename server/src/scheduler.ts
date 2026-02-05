import net from 'net';
import tls from 'tls';
import { env } from './env';
import {
  cleanupOldRows,
  createNotification,
  getActiveNodes,
  getRecipientsForNode,
  getEscalationPolicyForNode,
  hasAlertEvent,
  isNodeSilenced,
  listAlertChannelsForNode,
  listIncidentsForReport,
  listReportRecipients,
  getLastReportRun,
  recordAlertEvent,
  recordReportRun,
  recordCheck,
  type AlertChannel,
  type NodeConfig
} from './store';
import { sendAlert, sendWeeklyReport } from './email';

type Logger = {
  info: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

function tcpPing(host: string, port: number, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let done = false;
    const started = Date.now();

    const finish = (err?: Error) => {
      if (done) {
        return;
      }
      done = true;
      socket.destroy();
      if (err) {
        reject(err);
      } else {
        resolve(Date.now() - started);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('error', (err) => finish(err));
    socket.once('timeout', () => finish(new Error('timeout')));

    socket.connect(port, host, () => finish());
  });
}

function tlsPing(host: string, port: number, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = tls.connect({
      host,
      port,
      servername: host,
      rejectUnauthorized: false
    });

    let done = false;
    const finish = (err?: Error) => {
      if (done) {
        return;
      }
      done = true;
      socket.destroy();
      if (err) {
        reject(err);
      } else {
        resolve(Date.now() - started);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('secureConnect', () => finish());
    socket.once('error', (err) => finish(err));
    socket.once('timeout', () => finish(new Error('timeout')));
  });
}

function buildAlertPayload(params: {
  type: string;
  level?: number | null;
  node: NodeConfig;
  error?: string | null;
}) {
  const { type, level, node, error } = params;
  return {
    type,
    level: level ?? null,
    status: type === 'restored' ? 'UP' : 'DOWN',
    at: new Date().toISOString(),
    node: {
      id: node.id,
      name: node.name,
      host: node.host,
      port: node.port,
      area: node.area,
      groupName: node.groupName,
      criticality: node.criticality,
      tags: node.tags
    },
    error: error ?? null
  };
}

async function sendChannelAlert(channel: AlertChannel, payload: any) {
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

async function dispatchAlert(params: {
  type: 'lost' | 'restored' | 'escalation';
  node: NodeConfig;
  incidentId: number;
  recipients: string[];
  error?: string | null;
  level?: number | null;
  channels: AlertChannel[];
  logger: Logger;
}) {
  const { type, node, incidentId, recipients, error, level, channels, logger } = params;
  const payload = buildAlertPayload({ type, level, node, error });

  if (recipients.length) {
    const exists = await hasAlertEvent({ incidentId, type, level, channelId: null });
    if (!exists) {
      try {
        const { subject } = await sendAlert({
          type,
          node,
          recipients,
          error: error ?? undefined,
          level: level ?? undefined
        });
        await createNotification({
          nodeId: node.id,
          type,
          recipients,
          subject
        });
        await recordAlertEvent({
          incidentId,
          nodeId: node.id,
          type,
          level,
          channelId: null,
          recipients: recipients.join(',')
        });
      } catch (err: any) {
        logger.error('email alert failed', node.name, err?.message || err);
      }
    }
  }

  for (const channel of channels) {
    if (!channel.enabled) {
      continue;
    }
    const exists = await hasAlertEvent({ incidentId, type, level, channelId: channel.id });
    if (exists) {
      continue;
    }
    try {
      await sendChannelAlert(channel, payload);
      await recordAlertEvent({
        incidentId,
        nodeId: node.id,
        type,
        level,
        channelId: channel.id,
        recipients: channel.name
      });
    } catch (err: any) {
      logger.error('channel alert failed', channel.name, err?.message || err);
    }
  }
}

async function handleEscalations(params: {
  node: NodeConfig;
  incidentId: number;
  incidentStartAt: string | null;
  logger: Logger;
}) {
  const { node, incidentId, incidentStartAt, logger } = params;
  if (!incidentStartAt) {
    return;
  }
  const policy = await getEscalationPolicyForNode(node.escalationPolicyId);
  if (!policy || !policy.enabled) {
    return;
  }
  const incidentAgeMin = Math.floor(
    (Date.now() - new Date(incidentStartAt).getTime()) / 60000
  );
  const allChannels = await listAlertChannelsForNode(node.id);
  const nodeRecipients = await getRecipientsForNode(node.id);

  for (const level of policy.levels.sort((a, b) => a.level - b.level)) {
    if (incidentAgeMin < level.delayMin) {
      continue;
    }
    const recipients = new Set<string>();
    if (level.includeNodeRecipients) {
      nodeRecipients.forEach((email) => recipients.add(email));
    }
    level.emails.forEach((email) => recipients.add(email));
    const channels = allChannels.filter((channel) => level.channelIds.includes(channel.id));
    if (!recipients.size && !channels.length) {
      continue;
    }
    await dispatchAlert({
      type: 'escalation',
      node,
      incidentId,
      recipients: Array.from(recipients),
      level: level.level,
      channels,
      logger
    });
  }
}

function getWeekKey(date: Date) {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${temp.getUTCFullYear()}-${week}`;
}

class NodeRunner {
  private node: NodeConfig;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private running = false;
  private logger: Logger;

  constructor(node: NodeConfig, logger: Logger) {
    this.node = node;
    this.logger = logger;
  }

  update(node: NodeConfig) {
    this.node = node;
  }

  start() {
    this.scheduleNext(0);
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number) {
    if (this.stopped) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.runOnce(), delayMs);
  }

  private async runOnce() {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;

    let status = 'FAILURE';
    let latency: number | null = null;
    let error: string | null = null;

    try {
      latency = this.node.tlsEnabled
        ? await tlsPing(this.node.host, this.node.port, this.node.timeoutMs)
        : await tcpPing(this.node.host, this.node.port, this.node.timeoutMs);
      status = 'SUCCESS';
    } catch (err: any) {
      status = 'FAILURE';
      error = err?.message || 'unknown error';
    }

    try {
      const { prevStatus, incidentId, incidentStartAt } = await recordCheck({
        nodeId: this.node.id,
        status,
        latencyMs: latency,
        error
      });

      const silenced = await isNodeSilenced({
        id: this.node.id,
        area: this.node.area ?? null,
        groupName: this.node.groupName ?? null,
        criticality: this.node.criticality ?? null,
        tags: this.node.tags || []
      });

      if (incidentId && !silenced) {
        const channels = await listAlertChannelsForNode(this.node.id);
        if (status === 'FAILURE' && prevStatus !== 'FAILURE') {
          const recipients = await getRecipientsForNode(this.node.id);
          await dispatchAlert({
            type: 'lost',
            node: this.node,
            incidentId,
            recipients,
            error,
            channels,
            logger: this.logger
          });
        }

        if (status === 'SUCCESS' && prevStatus === 'FAILURE') {
          const recipients = await getRecipientsForNode(this.node.id);
          await dispatchAlert({
            type: 'restored',
            node: this.node,
            incidentId,
            recipients,
            channels,
            logger: this.logger
          });
        }

        if (status === 'FAILURE') {
          await handleEscalations({
            node: this.node,
            incidentId,
            incidentStartAt,
            logger: this.logger
          });
        }
      }
    } catch (err: any) {
      this.logger.error('check failed', this.node.name, err?.message || err);
    } finally {
      this.running = false;
      const nextDelay =
        status === 'SUCCESS'
          ? this.node.checkIntervalSec * 1000
          : this.node.retryIntervalSec * 1000;
      this.scheduleNext(nextDelay);
    }
  }
}

export async function startScheduler(logger: Logger = console) {
  const runners = new Map<number, NodeRunner>();
  let syncing = false;

  const syncNodes = async () => {
    if (syncing) {
      return;
    }
    syncing = true;
    try {
      const nodes = await getActiveNodes();
      const seen = new Set<number>();

      for (const node of nodes) {
        seen.add(node.id);
        const existing = runners.get(node.id);
        if (existing) {
          existing.update(node);
        } else {
          const runner = new NodeRunner(node, logger);
          runners.set(node.id, runner);
          runner.start();
          logger.info(`runner started for ${node.name}`);
        }
      }

      for (const [nodeId, runner] of runners.entries()) {
        if (!seen.has(nodeId)) {
          runner.stop();
          runners.delete(nodeId);
          logger.info(`runner stopped for node ${nodeId}`);
        }
      }
    } catch (err: any) {
      logger.error('sync failed', err?.message || err);
    } finally {
      syncing = false;
    }
  };

  const startCleanupJob = () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const run = async () => {
      try {
        await cleanupOldRows(env.RETENTION_DAYS);
        logger.info('retention cleanup completed');
      } catch (err: any) {
        logger.error('retention cleanup failed', err?.message || err);
      }
    };
    run();
    setInterval(run, dayMs);
  };

  const startReportJob = () => {
    const hourMs = 60 * 60 * 1000;
    const run = async () => {
      try {
        const now = new Date();
        if (now.getDay() !== env.REPORT_WEEKDAY) {
          return;
        }
        if (now.getHours() < env.REPORT_HOUR) {
          return;
        }
        const lastRun = await getLastReportRun('weekly');
        if (lastRun) {
          const lastKey = getWeekKey(new Date(lastRun));
          const nowKey = getWeekKey(now);
          if (lastKey === nowKey) {
            return;
          }
        }
        const recipients = await listReportRecipients();
        if (!recipients.length) {
          return;
        }
        const incidents = await listIncidentsForReport(7);
        await sendWeeklyReport({
          recipients: recipients.map((rec) => rec.email),
          incidents
        });
        await recordReportRun('weekly');
        logger.info('weekly report sent');
      } catch (err: any) {
        logger.error('weekly report failed', err?.message || err);
      }
    };
    run();
    setInterval(run, hourMs);
  };

  await syncNodes();
  setInterval(syncNodes, env.SYNC_INTERVAL_SEC * 1000);
  startCleanupJob();
  startReportJob();
}
