import { pool } from './db';

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
  cpuAlertPct: number;
  memAlertPct: number;
  diskAlertPct: number;
  alertCooldownMin: number;
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

export type NodeConfig = {
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
  cpuAlertPct: number;
  memAlertPct: number;
  diskAlertPct: number;
  alertCooldownMin: number;
  area: string | null;
  groupName: string | null;
  criticality: string;
  tags: string[];
  lastStatus: string | null;
};

export type NodeInput = {
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
  area: string | null;
  groupName: string | null;
  criticality: string;
  tags: string[];
  recipients: string[];
  channelIds: number[];
};

function mapRowToNode(row: any): NodeRecord {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    enabled: row.enabled,
    checkIntervalSec: row.check_interval_sec,
    retryIntervalSec: row.retry_interval_sec,
    timeoutMs: row.timeout_ms,
    tlsEnabled: row.tls_enabled,
    escalationPolicyId: row.escalation_policy_id ?? null,
    agentEnabled: row.agent_enabled ?? false,
    cpuAlertPct: Number(row.cpu_alert_pct ?? 85),
    memAlertPct: Number(row.mem_alert_pct ?? 90),
    diskAlertPct: Number(row.disk_alert_pct ?? 90),
    alertCooldownMin: Number(row.alert_cooldown_min ?? 30),
    area: row.area ?? null,
    groupName: row.group_name ?? null,
    criticality: row.criticality ?? 'MEDIUM',
    tags: row.tags || [],
    lastStatus: row.last_status,
    lastCheckAt: row.last_check_at,
    lastChangeAt: row.last_change_at,
    recipients: row.recipients || [],
    channelIds: row.channel_ids || []
  };
}

function normalizeTags(tags: string[]) {
  const cleaned = tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  return Array.from(new Set(cleaned));
}

function normalizeText(value?: string | null) {
  const trimmed = (value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

export async function listNodes(): Promise<NodeRecord[]> {
  const res = await pool.query(
    `
    SELECT n.id, n.name, n.host, n.port, n.enabled, n.tls_enabled,
           n.area, n.group_name, n.criticality, n.tags,
           n.escalation_policy_id, n.agent_enabled,
           n.cpu_alert_pct, n.mem_alert_pct, n.disk_alert_pct, n.alert_cooldown_min,
           n.check_interval_sec, n.retry_interval_sec, n.timeout_ms,
           n.last_status, n.last_check_at, n.last_change_at,
           COALESCE(rec.recipients, '{}') AS recipients,
           COALESCE(chan.channel_ids, '{}') AS channel_ids
      FROM nodes n
      LEFT JOIN (
        SELECT nr.node_id, array_agg(r.email ORDER BY r.email) AS recipients
          FROM node_recipients nr
          JOIN recipients r ON r.id = nr.recipient_id
         GROUP BY nr.node_id
      ) rec ON rec.node_id = n.id
      LEFT JOIN (
        SELECT node_id, array_agg(channel_id ORDER BY channel_id) AS channel_ids
          FROM node_alert_channels
         GROUP BY node_id
      ) chan ON chan.node_id = n.id
     ORDER BY n.name
    `
  );
  return res.rows.map(mapRowToNode);
}

export async function getActiveNodes(): Promise<NodeConfig[]> {
  const res = await pool.query(
    `
    SELECT id,
           name,
           host,
           port,
           enabled,
           tls_enabled,
           escalation_policy_id,
           agent_enabled,
           cpu_alert_pct,
           mem_alert_pct,
           disk_alert_pct,
           alert_cooldown_min,
           area,
           group_name,
           criticality,
           tags,
           check_interval_sec,
           retry_interval_sec,
           timeout_ms,
           last_status
      FROM nodes
     WHERE enabled = true
     ORDER BY id
    `
  );

  return res.rows.map((row) => ({
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    enabled: row.enabled,
    checkIntervalSec: row.check_interval_sec,
    retryIntervalSec: row.retry_interval_sec,
    timeoutMs: row.timeout_ms,
    tlsEnabled: row.tls_enabled,
    escalationPolicyId: row.escalation_policy_id ?? null,
    agentEnabled: row.agent_enabled ?? false,
    cpuAlertPct: Number(row.cpu_alert_pct ?? 85),
    memAlertPct: Number(row.mem_alert_pct ?? 90),
    diskAlertPct: Number(row.disk_alert_pct ?? 90),
    alertCooldownMin: Number(row.alert_cooldown_min ?? 30),
    area: row.area ?? null,
    groupName: row.group_name ?? null,
    criticality: row.criticality ?? 'MEDIUM',
    tags: row.tags || [],
    lastStatus: row.last_status
  }));
}

export async function getNodeConfig(nodeId: number): Promise<NodeConfig | null> {
  const res = await pool.query(
    `
    SELECT id,
           name,
           host,
           port,
           enabled,
           tls_enabled,
           escalation_policy_id,
           agent_enabled,
           cpu_alert_pct,
           mem_alert_pct,
           disk_alert_pct,
           alert_cooldown_min,
           area,
           group_name,
           criticality,
           tags,
           check_interval_sec,
           retry_interval_sec,
           timeout_ms,
           last_status
      FROM nodes
     WHERE id = $1
     LIMIT 1
    `,
    [nodeId]
  );

  if (!res.rowCount) {
    return null;
  }

  const row = res.rows[0];
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    enabled: row.enabled,
    checkIntervalSec: row.check_interval_sec,
    retryIntervalSec: row.retry_interval_sec,
    timeoutMs: row.timeout_ms,
    tlsEnabled: row.tls_enabled,
    escalationPolicyId: row.escalation_policy_id ?? null,
    agentEnabled: row.agent_enabled ?? false,
    cpuAlertPct: Number(row.cpu_alert_pct ?? 85),
    memAlertPct: Number(row.mem_alert_pct ?? 90),
    diskAlertPct: Number(row.disk_alert_pct ?? 90),
    alertCooldownMin: Number(row.alert_cooldown_min ?? 30),
    area: row.area ?? null,
    groupName: row.group_name ?? null,
    criticality: row.criticality ?? 'MEDIUM',
    tags: row.tags || [],
    lastStatus: row.last_status
  };
}

export async function getRecipientsForNode(nodeId: number): Promise<string[]> {
  const res = await pool.query(
    `
    SELECT r.email
      FROM recipients r
      JOIN node_recipients nr ON nr.recipient_id = r.id
     WHERE nr.node_id = $1
     ORDER BY r.email
    `,
    [nodeId]
  );
  return res.rows.map((row) => row.email);
}

function normalizeRecipients(recipients: string[]): string[] {
  const cleaned = recipients
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
  return Array.from(new Set(cleaned));
}

async function setRecipients(client: any, nodeId: number, recipients: string[]) {
  const cleaned = normalizeRecipients(recipients);
  await client.query('DELETE FROM node_recipients WHERE node_id = $1', [nodeId]);
  if (!cleaned.length) {
    return;
  }

  await client.query(
    'INSERT INTO recipients (email) SELECT DISTINCT UNNEST($1::text[]) ON CONFLICT (email) DO NOTHING',
    [cleaned]
  );

  const rec = await client.query('SELECT id FROM recipients WHERE email = ANY($1::text[])', [cleaned]);
  const ids = rec.rows.map((row: any) => row.id);

  if (!ids.length) {
    return;
  }

  await client.query(
    'INSERT INTO node_recipients (node_id, recipient_id) SELECT $1, UNNEST($2::int[])',
    [nodeId, ids]
  );
}

function normalizeChannelIds(channelIds: number[]): number[] {
  const cleaned = channelIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  return Array.from(new Set(cleaned));
}

async function setNodeChannels(client: any, nodeId: number, channelIds: number[]) {
  const cleaned = normalizeChannelIds(channelIds);
  await client.query('DELETE FROM node_alert_channels WHERE node_id = $1', [nodeId]);
  if (!cleaned.length) {
    return;
  }
  await client.query(
    'INSERT INTO node_alert_channels (node_id, channel_id) SELECT $1, UNNEST($2::int[])',
    [nodeId, cleaned]
  );
}

export async function createNode(data: NodeInput): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `
      INSERT INTO nodes (
        name,
        host,
        port,
        enabled,
        check_interval_sec,
        retry_interval_sec,
        timeout_ms,
        tls_enabled,
        escalation_policy_id,
        agent_enabled,
        cpu_alert_pct,
        mem_alert_pct,
        disk_alert_pct,
        alert_cooldown_min,
        area,
        group_name,
        criticality,
        tags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id
      `,
      [
        data.name,
        data.host,
        data.port,
        data.enabled,
        data.checkIntervalSec,
        data.retryIntervalSec,
        data.timeoutMs,
        data.tlsEnabled,
        data.escalationPolicyId,
        data.agentEnabled,
        data.cpuAlertPct,
        data.memAlertPct,
        data.diskAlertPct,
        data.alertCooldownMin,
        normalizeText(data.area),
        normalizeText(data.groupName),
        data.criticality,
        normalizeTags(data.tags)
      ]
    );
    const nodeId = res.rows[0].id as number;
    await setRecipients(client, nodeId, data.recipients);
    await setNodeChannels(client, nodeId, data.channelIds);
    await client.query('COMMIT');
    return nodeId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateNode(nodeId: number, data: NodeInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `
      UPDATE nodes
         SET name = $1,
             host = $2,
             port = $3,
             enabled = $4,
             check_interval_sec = $5,
             retry_interval_sec = $6,
             timeout_ms = $7,
             tls_enabled = $8,
             escalation_policy_id = $9,
             agent_enabled = $10,
             cpu_alert_pct = $11,
             mem_alert_pct = $12,
             disk_alert_pct = $13,
             alert_cooldown_min = $14,
             area = $15,
             group_name = $16,
             criticality = $17,
             tags = $18,
             updated_at = now()
       WHERE id = $19
      `,
      [
        data.name,
        data.host,
        data.port,
        data.enabled,
        data.checkIntervalSec,
        data.retryIntervalSec,
        data.timeoutMs,
        data.tlsEnabled,
        data.escalationPolicyId,
        data.agentEnabled,
        data.cpuAlertPct,
        data.memAlertPct,
        data.diskAlertPct,
        data.alertCooldownMin,
        normalizeText(data.area),
        normalizeText(data.groupName),
        data.criticality,
        normalizeTags(data.tags),
        nodeId
      ]
    );

    if (res.rowCount === 0) {
      throw new Error('node not found');
    }

    await setRecipients(client, nodeId, data.recipients);
    await setNodeChannels(client, nodeId, data.channelIds);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setNodeEnabled(nodeId: number, enabled: boolean) {
  await pool.query('UPDATE nodes SET enabled = $1, updated_at = now() WHERE id = $2', [enabled, nodeId]);
}

export async function setNodeTlsEnabled(nodeId: number, tlsEnabled: boolean) {
  await pool.query('UPDATE nodes SET tls_enabled = $1, updated_at = now() WHERE id = $2', [
    tlsEnabled,
    nodeId
  ]);
}

export async function deleteNode(nodeId: number) {
  const res = await pool.query('DELETE FROM nodes WHERE id = $1', [nodeId]);
  return res.rowCount || 0;
}

export async function listChecks(nodeId: number, limit: number) {
  const res = await pool.query(
    `
    SELECT id, status, checked_at, latency_ms, error
      FROM checks
     WHERE node_id = $1
     ORDER BY checked_at DESC
     LIMIT $2
    `,
    [nodeId, limit]
  );
  return res.rows;
}

export async function listIncidents(days: number) {
  const res = await pool.query(
    `
    SELECT i.id,
           i.node_id,
           n.name AS node_name,
           i.start_at,
           i.end_at,
           i.ack_at,
           i.ack_by,
           i.ack_note,
           i.owner,
           COALESCE(notes.notes_count, 0) AS notes_count,
           EXTRACT(EPOCH FROM (COALESCE(i.end_at, now()) - i.start_at))::int AS duration_sec
      FROM incidents i
      JOIN nodes n ON n.id = i.node_id
      LEFT JOIN (
        SELECT incident_id, COUNT(*) AS notes_count
          FROM incident_notes
         GROUP BY incident_id
      ) notes ON notes.incident_id = i.id
     WHERE i.start_at >= now() - ($1 || ' days')::interval
     ORDER BY i.start_at DESC
    `,
    [days]
  );
  return res.rows;
}

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

export type AlertChannel = {
  id: number;
  name: string;
  type: string;
  config: any;
  enabled: boolean;
};

export type AlertChannelInput = {
  name: string;
  type: string;
  config: any;
  enabled: boolean;
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

export async function listNodeMetrics(days: number): Promise<NodeMetric[]> {
  const res = await pool.query(
    `
    WITH checks_window AS (
      SELECT node_id,
             COUNT(*) AS total_checks,
             COUNT(*) FILTER (WHERE status = 'SUCCESS') AS ok_checks,
             AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_latency_ms
        FROM checks
       WHERE checked_at >= now() - ($1 || ' days')::interval
       GROUP BY node_id
    ),
    mttr AS (
      SELECT node_id,
             AVG(EXTRACT(EPOCH FROM (end_at - start_at))) AS mttr_sec
        FROM incidents
       WHERE end_at IS NOT NULL
         AND start_at >= now() - ($1 || ' days')::interval
       GROUP BY node_id
    ),
    mtbf AS (
      SELECT node_id,
             AVG(EXTRACT(EPOCH FROM (start_at - prev_end))) AS mtbf_sec
        FROM (
          SELECT node_id,
                 start_at,
                 end_at,
                 LAG(end_at) OVER (PARTITION BY node_id ORDER BY start_at) AS prev_end
            FROM incidents
           WHERE end_at IS NOT NULL
             AND start_at >= now() - ($1 || ' days')::interval
        ) t
       WHERE prev_end IS NOT NULL
       GROUP BY node_id
    )
    SELECT n.id AS node_id,
           CASE
             WHEN c.total_checks IS NULL OR c.total_checks = 0 THEN NULL
             ELSE ROUND(100.0 * c.ok_checks / c.total_checks, 2)
           END AS uptime_pct,
           c.avg_latency_ms,
           COALESCE(c.total_checks, 0) AS total_checks,
           mttr.mttr_sec,
           mtbf.mtbf_sec
      FROM nodes n
      LEFT JOIN checks_window c ON c.node_id = n.id
      LEFT JOIN mttr ON mttr.node_id = n.id
      LEFT JOIN mtbf ON mtbf.node_id = n.id
     ORDER BY n.id
    `,
    [days]
  );

  return res.rows.map((row) => ({
    nodeId: row.node_id,
    uptimePct: row.uptime_pct === null ? null : Number(row.uptime_pct),
    avgLatencyMs: row.avg_latency_ms === null ? null : Number(row.avg_latency_ms),
    totalChecks: Number(row.total_checks || 0),
    mttrSec: row.mttr_sec === null ? null : Number(row.mttr_sec),
    mtbfSec: row.mtbf_sec === null ? null : Number(row.mtbf_sec)
  }));
}

export async function listAreaMetrics(days: number): Promise<AreaMetric[]> {
  const res = await pool.query(
    `
    WITH checks_window AS (
      SELECT n.id,
             COALESCE(NULLIF(n.area, ''), 'Unassigned') AS area,
             COUNT(c.id) AS total_checks,
             COUNT(c.id) FILTER (WHERE c.status = 'SUCCESS') AS ok_checks,
             AVG(c.latency_ms) FILTER (WHERE c.latency_ms IS NOT NULL) AS avg_latency_ms
        FROM nodes n
        LEFT JOIN checks c
          ON c.node_id = n.id
         AND c.checked_at >= now() - ($1 || ' days')::interval
       GROUP BY n.id, area
    ),
    mttr AS (
      SELECT n.id AS node_id,
             COALESCE(NULLIF(n.area, ''), 'Unassigned') AS area,
             AVG(EXTRACT(EPOCH FROM (i.end_at - i.start_at))) AS mttr_sec
        FROM nodes n
        JOIN incidents i ON i.node_id = n.id
       WHERE i.end_at IS NOT NULL
         AND i.start_at >= now() - ($1 || ' days')::interval
       GROUP BY n.id, area
    ),
    mtbf AS (
      SELECT t.node_id,
             COALESCE(NULLIF(t.area, ''), 'Unassigned') AS area,
             AVG(EXTRACT(EPOCH FROM (t.start_at - t.prev_end))) AS mtbf_sec
        FROM (
          SELECT n.id AS node_id,
                 n.area,
                 i.start_at,
                 i.end_at,
                 LAG(i.end_at) OVER (PARTITION BY i.node_id ORDER BY i.start_at) AS prev_end
            FROM nodes n
            JOIN incidents i ON i.node_id = n.id
           WHERE i.end_at IS NOT NULL
             AND i.start_at >= now() - ($1 || ' days')::interval
        ) t
       WHERE prev_end IS NOT NULL
       GROUP BY node_id, area
    )
    SELECT c.area,
           CASE
             WHEN SUM(c.total_checks) = 0 THEN NULL
             ELSE ROUND(100.0 * SUM(c.ok_checks) / SUM(c.total_checks), 2)
           END AS uptime_pct,
           AVG(c.avg_latency_ms) AS avg_latency_ms,
           SUM(c.total_checks) AS total_checks,
           AVG(mttr.mttr_sec) AS mttr_sec,
           AVG(mtbf.mtbf_sec) AS mtbf_sec
      FROM checks_window c
      LEFT JOIN mttr ON mttr.node_id = c.id
      LEFT JOIN mtbf ON mtbf.node_id = c.id
     GROUP BY c.area
     ORDER BY c.area
    `,
    [days]
  );

  return res.rows.map((row) => ({
    area: row.area,
    uptimePct: row.uptime_pct === null ? null : Number(row.uptime_pct),
    avgLatencyMs: row.avg_latency_ms === null ? null : Number(row.avg_latency_ms),
    totalChecks: Number(row.total_checks || 0),
    mttrSec: row.mttr_sec === null ? null : Number(row.mttr_sec),
    mtbfSec: row.mtbf_sec === null ? null : Number(row.mtbf_sec)
  }));
}

export async function listLatencySeries(params: {
  days: number;
  bucket: 'hour' | 'day';
  nodeId?: number;
  area?: string;
  groupName?: string;
}): Promise<LatencyPoint[]> {
  const conditions: string[] = [];
  const values: Array<string | number> = [params.days];
  let idx = 2;

  if (params.nodeId) {
    conditions.push(`c.node_id = $${idx++}`);
    values.push(params.nodeId);
  }

  if (params.area) {
    conditions.push(`COALESCE(NULLIF(n.area, ''), 'Unassigned') = $${idx++}`);
    values.push(params.area);
  }

  if (params.groupName) {
    conditions.push(`COALESCE(NULLIF(n.group_name, ''), 'Unassigned') = $${idx++}`);
    values.push(params.groupName);
  }

  const whereExtra = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

  const res = await pool.query(
    `
    SELECT date_trunc('${params.bucket}', c.checked_at) AS bucket,
           AVG(c.latency_ms) FILTER (WHERE c.latency_ms IS NOT NULL) AS avg_latency_ms
      FROM checks c
      JOIN nodes n ON n.id = c.node_id
     WHERE c.checked_at >= now() - ($1 || ' days')::interval
       ${whereExtra}
     GROUP BY bucket
     ORDER BY bucket
    `,
    values
  );

  return res.rows.map((row) => ({
    bucket: row.bucket,
    avgLatencyMs: row.avg_latency_ms === null ? null : Number(row.avg_latency_ms)
  }));
}

export async function recordCheck(params: {
  nodeId: number;
  status: string;
  latencyMs: number | null;
  error: string | null;
}) {
  const { nodeId, status, latencyMs, error } = params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prevRes = await client.query('SELECT last_status FROM nodes WHERE id = $1 FOR UPDATE', [nodeId]);
    const prevStatus = prevRes.rows[0]?.last_status || 'UNKNOWN';
    let incidentId: number | null = null;
    let incidentStartAt: string | null = null;

    const checkRes = await client.query(
      'INSERT INTO checks (node_id, status, latency_ms, error) VALUES ($1, $2, $3, $4) RETURNING id',
      [nodeId, status, latencyMs, error]
    );
    const checkId = checkRes.rows[0].id as number;

    if (status === 'FAILURE' && prevStatus !== 'FAILURE') {
      const incidentRes = await client.query(
        'INSERT INTO incidents (node_id, start_at, first_check_id, last_check_id) VALUES ($1, now(), $2, $2) RETURNING id, start_at',
        [nodeId, checkId]
      );
      incidentId = incidentRes.rows[0]?.id ?? null;
      incidentStartAt = incidentRes.rows[0]?.start_at ?? null;
    } else if (status === 'FAILURE' && prevStatus === 'FAILURE') {
      await client.query(
        'UPDATE incidents SET last_check_id = $2 WHERE node_id = $1 AND end_at IS NULL',
        [nodeId, checkId]
      );
      const incidentRes = await client.query(
        'SELECT id, start_at FROM incidents WHERE node_id = $1 AND end_at IS NULL ORDER BY start_at DESC LIMIT 1',
        [nodeId]
      );
      incidentId = incidentRes.rows[0]?.id ?? null;
      incidentStartAt = incidentRes.rows[0]?.start_at ?? null;
    } else if (status === 'SUCCESS' && prevStatus === 'FAILURE') {
      const incidentRes = await client.query(
        'UPDATE incidents SET end_at = now(), last_check_id = $2 WHERE node_id = $1 AND end_at IS NULL RETURNING id, start_at',
        [nodeId, checkId]
      );
      incidentId = incidentRes.rows[0]?.id ?? null;
      incidentStartAt = incidentRes.rows[0]?.start_at ?? null;
    }

    await client.query(
      `
      UPDATE nodes
         SET last_status = $2,
             last_check_at = now(),
             last_change_at = CASE WHEN last_status IS DISTINCT FROM $2 THEN now() ELSE last_change_at END,
             updated_at = now()
       WHERE id = $1
      `,
      [nodeId, status]
    );

    await client.query('COMMIT');
    return { prevStatus, checkId, incidentId, incidentStartAt };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createNotification(params: {
  nodeId: number;
  type: string;
  recipients: string[];
  subject: string;
}) {
  const { nodeId, type, recipients, subject } = params;
  await pool.query(
    'INSERT INTO notifications (node_id, type, recipients, subject) VALUES ($1, $2, $3, $4)',
    [nodeId, type, recipients.join(','), subject]
  );
}

export async function cleanupOldRows(days: number) {
  await pool.query('DELETE FROM checks WHERE checked_at < now() - ($1 || \' days\')::interval', [days]);
  await pool.query('DELETE FROM notifications WHERE sent_at < now() - ($1 || \' days\')::interval', [days]);
  await pool.query(
    'DELETE FROM incidents WHERE end_at IS NOT NULL AND end_at < now() - ($1 || \' days\')::interval',
    [days]
  );
}

export async function listAlertChannels(): Promise<AlertChannel[]> {
  const res = await pool.query(
    `
    SELECT id, name, type, config, enabled
      FROM alert_channels
     ORDER BY name
    `
  );
  return res.rows;
}

export async function createAlertChannel(data: AlertChannelInput): Promise<number> {
  const res = await pool.query(
    `
    INSERT INTO alert_channels (name, type, config, enabled)
    VALUES ($1, $2, $3, $4)
    RETURNING id
    `,
    [data.name, data.type, data.config, data.enabled]
  );
  return res.rows[0].id as number;
}

export async function updateAlertChannel(id: number, data: AlertChannelInput) {
  await pool.query(
    `
    UPDATE alert_channels
       SET name = $1,
           type = $2,
           config = $3,
           enabled = $4,
           updated_at = now()
     WHERE id = $5
    `,
    [data.name, data.type, data.config, data.enabled, id]
  );
}

export async function deleteAlertChannel(id: number) {
  await pool.query('DELETE FROM alert_channels WHERE id = $1', [id]);
}

export async function listAlertChannelsForNode(nodeId: number): Promise<AlertChannel[]> {
  const res = await pool.query(
    `
    SELECT c.id, c.name, c.type, c.config, c.enabled
      FROM alert_channels c
      JOIN node_alert_channels nc ON nc.channel_id = c.id
     WHERE nc.node_id = $1
     ORDER BY c.name
    `,
    [nodeId]
  );
  return res.rows;
}

export async function listSilences(): Promise<Silence[]> {
  const res = await pool.query(
    `
    SELECT id,
           name,
           enabled,
           start_at,
           end_at,
           node_id,
           area,
           group_name,
           tag,
           criticality
      FROM silences
     ORDER BY start_at DESC
    `
  );
  return res.rows.map((row) => ({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    startAt: row.start_at,
    endAt: row.end_at,
    nodeId: row.node_id ?? null,
    area: row.area ?? null,
    groupName: row.group_name ?? null,
    tag: row.tag ?? null,
    criticality: row.criticality ?? null
  }));
}

export async function createSilence(data: Omit<Silence, 'id'>): Promise<number> {
  const res = await pool.query(
    `
    INSERT INTO silences (name, enabled, start_at, end_at, node_id, area, group_name, tag, criticality)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
    `,
    [
      data.name,
      data.enabled,
      data.startAt,
      data.endAt,
      data.nodeId,
      normalizeText(data.area),
      normalizeText(data.groupName),
      normalizeText(data.tag),
      normalizeText(data.criticality)
    ]
  );
  return res.rows[0].id as number;
}

export async function updateSilence(id: number, data: Omit<Silence, 'id'>) {
  await pool.query(
    `
    UPDATE silences
       SET name = $1,
           enabled = $2,
           start_at = $3,
           end_at = $4,
           node_id = $5,
           area = $6,
           group_name = $7,
           tag = $8,
           criticality = $9,
           updated_at = now()
     WHERE id = $10
    `,
    [
      data.name,
      data.enabled,
      data.startAt,
      data.endAt,
      data.nodeId,
      normalizeText(data.area),
      normalizeText(data.groupName),
      normalizeText(data.tag),
      normalizeText(data.criticality),
      id
    ]
  );
}

export async function deleteSilence(id: number) {
  await pool.query('DELETE FROM silences WHERE id = $1', [id]);
}

export async function isNodeSilenced(node: {
  id: number;
  area: string | null;
  groupName: string | null;
  criticality: string | null;
  tags: string[];
}): Promise<boolean> {
  const res = await pool.query(
    `
    SELECT id
      FROM silences
     WHERE enabled = true
       AND start_at <= now()
       AND (end_at IS NULL OR end_at >= now())
       AND (
         node_id = $1
         OR (area IS NOT NULL AND area = $2)
         OR (group_name IS NOT NULL AND group_name = $3)
         OR (criticality IS NOT NULL AND criticality = $4)
         OR (tag IS NOT NULL AND tag = ANY($5::text[]))
         OR (node_id IS NULL AND area IS NULL AND group_name IS NULL AND tag IS NULL AND criticality IS NULL)
       )
     LIMIT 1
    `,
    [node.id, node.area, node.groupName, node.criticality, node.tags]
  );
  return res.rowCount > 0;
}

async function ensureDefaultEscalationPolicy(): Promise<EscalationPolicy> {
  const existing = await listEscalationPolicies();
  if (existing.length > 0) {
    return existing[0];
  }
  const id = await createEscalationPolicy({
    name: 'Default',
    enabled: true,
    levels: [
      {
        level: 1,
        delayMin: 0,
        includeNodeRecipients: true,
        channelIds: [],
        emails: []
      }
    ]
  });
  const policies = await listEscalationPolicies();
  return policies.find((policy) => policy.id === id) ?? policies[0];
}

export async function listEscalationPolicies(): Promise<EscalationPolicy[]> {
  const policyRes = await pool.query(
    `
    SELECT id, name, enabled
      FROM escalation_policies
     ORDER BY id
    `
  );
  const levelRes = await pool.query(
    `
    SELECT policy_id, level, delay_min, include_node_recipients, channel_ids, emails
      FROM escalation_levels
     ORDER BY policy_id, level
    `
  );
  const levelsByPolicy = new Map<number, EscalationLevel[]>();
  for (const row of levelRes.rows) {
    const list = levelsByPolicy.get(row.policy_id) ?? [];
    list.push({
      level: Number(row.level),
      delayMin: Number(row.delay_min),
      includeNodeRecipients: row.include_node_recipients,
      channelIds: row.channel_ids || [],
      emails: row.emails || []
    });
    levelsByPolicy.set(row.policy_id, list);
  }
  return policyRes.rows.map((row) => ({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    levels: levelsByPolicy.get(row.id) ?? []
  }));
}

export async function createEscalationPolicy(data: {
  name: string;
  enabled: boolean;
  levels: EscalationLevel[];
}): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const policyRes = await client.query(
      'INSERT INTO escalation_policies (name, enabled) VALUES ($1, $2) RETURNING id',
      [data.name, data.enabled]
    );
    const policyId = policyRes.rows[0].id as number;
    for (const level of data.levels) {
      await client.query(
        `
        INSERT INTO escalation_levels (policy_id, level, delay_min, include_node_recipients, channel_ids, emails)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          policyId,
          level.level,
          level.delayMin,
          level.includeNodeRecipients,
          level.channelIds,
          level.emails
        ]
      );
    }
    await client.query('COMMIT');
    return policyId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateEscalationPolicy(
  id: number,
  data: { name: string; enabled: boolean; levels: EscalationLevel[] }
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE escalation_policies SET name = $1, enabled = $2, updated_at = now() WHERE id = $3', [
      data.name,
      data.enabled,
      id
    ]);
    await client.query('DELETE FROM escalation_levels WHERE policy_id = $1', [id]);
    for (const level of data.levels) {
      await client.query(
        `
        INSERT INTO escalation_levels (policy_id, level, delay_min, include_node_recipients, channel_ids, emails)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [id, level.level, level.delayMin, level.includeNodeRecipients, level.channelIds, level.emails]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteEscalationPolicy(id: number) {
  await pool.query('DELETE FROM escalation_policies WHERE id = $1', [id]);
}

export async function getEscalationPolicyForNode(policyId: number | null): Promise<EscalationPolicy | null> {
  const policies = await listEscalationPolicies();
  if (!policies.length) {
    return ensureDefaultEscalationPolicy();
  }
  if (!policyId) {
    return policies[0];
  }
  return policies.find((policy) => policy.id === policyId) ?? policies[0];
}

export async function hasAlertEvent(params: {
  incidentId: number;
  type: string;
  level?: number | null;
  channelId?: number | null;
}): Promise<boolean> {
  const res = await pool.query(
    `
    SELECT 1
      FROM alert_events
     WHERE incident_id = $1
       AND type = $2
       AND COALESCE(level, 0) = COALESCE($3, 0)
       AND channel_id IS NOT DISTINCT FROM $4
     LIMIT 1
    `,
    [params.incidentId, params.type, params.level ?? null, params.channelId ?? null]
  );
  return res.rowCount > 0;
}

export async function hasRecentAlertEvent(params: {
  nodeId: number;
  type: string;
  level?: number | null;
  channelId?: number | null;
  windowMin: number;
}): Promise<boolean> {
  if (params.windowMin <= 0) {
    return false;
  }
  const res = await pool.query(
    `
    SELECT 1
      FROM alert_events
     WHERE node_id = $1
       AND type = $2
       AND COALESCE(level, 0) = COALESCE($3, 0)
       AND channel_id IS NOT DISTINCT FROM $4
       AND sent_at >= now() - ($5 || ' minutes')::interval
     LIMIT 1
    `,
    [params.nodeId, params.type, params.level ?? null, params.channelId ?? null, params.windowMin]
  );
  return res.rowCount > 0;
}

export async function recordAlertEvent(params: {
  incidentId: number | null;
  nodeId: number;
  type: string;
  level?: number | null;
  channelId?: number | null;
  recipients?: string;
  dedupKey?: string;
}) {
  await pool.query(
    `
    INSERT INTO alert_events (incident_id, node_id, type, level, channel_id, recipients, dedup_key)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      params.incidentId,
      params.nodeId,
      params.type,
      params.level ?? null,
      params.channelId ?? null,
      params.recipients ?? null,
      params.dedupKey ?? null
    ]
  );
}

export async function listIncidentNotes(incidentId: number): Promise<IncidentNote[]> {
  const res = await pool.query(
    `
    SELECT id, incident_id, author, note, created_at
      FROM incident_notes
     WHERE incident_id = $1
     ORDER BY created_at DESC
    `,
    [incidentId]
  );
  return res.rows.map((row) => ({
    id: row.id,
    incidentId: row.incident_id,
    author: row.author,
    note: row.note,
    createdAt: row.created_at
  }));
}

export async function addIncidentNote(incidentId: number, author: string, note: string): Promise<number> {
  const res = await pool.query(
    `
    INSERT INTO incident_notes (incident_id, author, note)
    VALUES ($1, $2, $3)
    RETURNING id
    `,
    [incidentId, author, note]
  );
  return res.rows[0].id as number;
}

export async function acknowledgeIncident(incidentId: number, ackBy: string, ackNote?: string) {
  await pool.query(
    `
    UPDATE incidents
       SET ack_at = now(),
           ack_by = $1,
           ack_note = $2
     WHERE id = $3
    `,
    [ackBy, ackNote ?? null, incidentId]
  );
}

export async function clearIncidentAck(incidentId: number) {
  await pool.query(
    `
    UPDATE incidents
       SET ack_at = NULL,
           ack_by = NULL,
           ack_note = NULL
     WHERE id = $1
    `,
    [incidentId]
  );
}

export async function setIncidentOwner(incidentId: number, owner: string | null) {
  await pool.query('UPDATE incidents SET owner = $1 WHERE id = $2', [normalizeText(owner), incidentId]);
}

export async function listReportRecipients(): Promise<ReportRecipient[]> {
  const res = await pool.query('SELECT id, email FROM report_recipients ORDER BY email');
  return res.rows;
}

export async function addReportRecipient(email: string) {
  await pool.query(
    'INSERT INTO report_recipients (email) VALUES ($1) ON CONFLICT (email) DO NOTHING',
    [email.trim()]
  );
}

export async function removeReportRecipient(id: number) {
  await pool.query('DELETE FROM report_recipients WHERE id = $1', [id]);
}

export async function listIncidentsForReport(days: number) {
  const res = await pool.query(
    `
    SELECT i.id,
           i.node_id,
           n.name AS node_name,
           i.start_at,
           i.end_at,
           i.ack_at,
           i.ack_by,
           i.owner,
           EXTRACT(EPOCH FROM (COALESCE(i.end_at, now()) - i.start_at))::int AS duration_sec
      FROM incidents i
      JOIN nodes n ON n.id = i.node_id
     WHERE i.start_at >= now() - ($1 || ' days')::interval
     ORDER BY i.start_at DESC
    `,
    [days]
  );
  return res.rows;
}

export async function getLastReportRun(type: string): Promise<string | null> {
  const res = await pool.query(
    'SELECT sent_at FROM report_runs WHERE type = $1 ORDER BY sent_at DESC LIMIT 1',
    [type]
  );
  return res.rows[0]?.sent_at ?? null;
}

export async function recordReportRun(type: string) {
  await pool.query('INSERT INTO report_runs (type) VALUES ($1)', [type]);
}

export type AgentAlertState = {
  cpu: { active: boolean; lastAlertAt: string | null };
  mem: { active: boolean; lastAlertAt: string | null };
  disk: { active: boolean; lastAlertAt: string | null };
};

export async function getAgentAlertState(nodeId: number): Promise<AgentAlertState> {
  const res = await pool.query(
    `
    SELECT cpu_alert_active,
           mem_alert_active,
           disk_alert_active,
           last_cpu_alert_at,
           last_mem_alert_at,
           last_disk_alert_at
      FROM agent_alert_state
     WHERE node_id = $1
     LIMIT 1
    `,
    [nodeId]
  );

  if (!res.rowCount) {
    return {
      cpu: { active: false, lastAlertAt: null },
      mem: { active: false, lastAlertAt: null },
      disk: { active: false, lastAlertAt: null }
    };
  }

  const row = res.rows[0];
  return {
    cpu: {
      active: Boolean(row.cpu_alert_active),
      lastAlertAt: row.last_cpu_alert_at
    },
    mem: {
      active: Boolean(row.mem_alert_active),
      lastAlertAt: row.last_mem_alert_at
    },
    disk: {
      active: Boolean(row.disk_alert_active),
      lastAlertAt: row.last_disk_alert_at
    }
  };
}

export async function setAgentMetricAlertState(params: {
  nodeId: number;
  metric: 'cpu' | 'mem' | 'disk';
  active: boolean;
  lastAlertAt: string | null;
}) {
  const columns: Record<'cpu' | 'mem' | 'disk', [string, string]> = {
    cpu: ['cpu_alert_active', 'last_cpu_alert_at'],
    mem: ['mem_alert_active', 'last_mem_alert_at'],
    disk: ['disk_alert_active', 'last_disk_alert_at']
  };
  const [activeCol, lastCol] = columns[params.metric];
  await pool.query(
    `
    INSERT INTO agent_alert_state (node_id, ${activeCol}, ${lastCol})
    VALUES ($1, $2, $3)
    ON CONFLICT (node_id)
    DO UPDATE SET ${activeCol} = EXCLUDED.${activeCol},
                  ${lastCol} = EXCLUDED.${lastCol}
    `,
    [params.nodeId, params.active, params.lastAlertAt]
  );
}

export async function recordAgentMetric(params: {
  nodeId: number;
  cpuPct?: number | null;
  memPct?: number | null;
  diskPct?: number | null;
  loadAvg?: number | null;
  processes?: any;
}) {
  await pool.query(
    `
    INSERT INTO agent_metrics (node_id, cpu_pct, mem_pct, disk_pct, load_avg, processes)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      params.nodeId,
      params.cpuPct ?? null,
      params.memPct ?? null,
      params.diskPct ?? null,
      params.loadAvg ?? null,
      params.processes ?? null
    ]
  );
}

export async function listLatestAgentMetricsPublic(): Promise<
  Array<AgentMetric & { nodeName: string; host: string; port: number }>
> {
  const res = await pool.query(
    `
    SELECT DISTINCT ON (m.node_id)
           m.node_id,
           m.collected_at,
           m.cpu_pct,
           m.mem_pct,
           m.disk_pct,
           m.load_avg,
           n.name AS node_name,
           n.host,
           n.port
      FROM agent_metrics m
      JOIN nodes n ON n.id = m.node_id
     WHERE n.agent_enabled = true
     ORDER BY m.node_id, m.collected_at DESC
    `
  );

  return res.rows.map((row) => ({
    nodeId: row.node_id,
    collectedAt: row.collected_at,
    cpuPct: row.cpu_pct === null ? null : Number(row.cpu_pct),
    memPct: row.mem_pct === null ? null : Number(row.mem_pct),
    diskPct: row.disk_pct === null ? null : Number(row.disk_pct),
    loadAvg: row.load_avg === null ? null : Number(row.load_avg),
    processes: null,
    nodeName: row.node_name,
    host: row.host,
    port: row.port
  }));
}

export async function listLatestAgentMetrics(): Promise<
  Array<AgentMetric & { nodeName: string; host: string; port: number }>
> {
  const res = await pool.query(
    `
    SELECT DISTINCT ON (m.node_id)
           m.node_id,
           m.collected_at,
           m.cpu_pct,
           m.mem_pct,
           m.disk_pct,
           m.load_avg,
           m.processes,
           n.name AS node_name,
           n.host,
           n.port
      FROM agent_metrics m
      JOIN nodes n ON n.id = m.node_id
     ORDER BY m.node_id, m.collected_at DESC
    `
  );
  return res.rows.map((row) => ({
    nodeId: row.node_id,
    collectedAt: row.collected_at,
    cpuPct: row.cpu_pct === null ? null : Number(row.cpu_pct),
    memPct: row.mem_pct === null ? null : Number(row.mem_pct),
    diskPct: row.disk_pct === null ? null : Number(row.disk_pct),
    loadAvg: row.load_avg === null ? null : Number(row.load_avg),
    processes: row.processes,
    nodeName: row.node_name,
    host: row.host,
    port: row.port
  }));
}

export async function listAgentSeries(params: {
  nodeId: number;
  days: number;
  bucket: 'hour' | 'day';
}): Promise<AgentSeriesPoint[]> {
  const res = await pool.query(
    `
    SELECT date_trunc('${params.bucket}', m.collected_at) AS bucket,
           AVG(m.cpu_pct) AS cpu_pct,
           AVG(m.mem_pct) AS mem_pct,
           AVG(m.disk_pct) AS disk_pct
      FROM agent_metrics m
     WHERE m.collected_at >= now() - ($1 || ' days')::interval
       AND m.node_id = $2
     GROUP BY bucket
     ORDER BY bucket
    `,
    [params.days, params.nodeId]
  );

  return res.rows.map((row) => ({
    bucket: row.bucket,
    cpuPct: row.cpu_pct === null ? null : Number(row.cpu_pct),
    memPct: row.mem_pct === null ? null : Number(row.mem_pct),
    diskPct: row.disk_pct === null ? null : Number(row.disk_pct)
  }));
}

export async function createAuditLog(params: {
  actor: string | null;
  role: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: any;
  ip?: string | null;
}) {
  await pool.query(
    `
    INSERT INTO audit_logs (actor, role, action, entity_type, entity_id, payload, ip)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      params.actor ?? null,
      params.role ?? null,
      params.action,
      params.entityType ?? null,
      params.entityId ?? null,
      params.payload ?? null,
      params.ip ?? null
    ]
  );
}
