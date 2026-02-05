import nodemailer from 'nodemailer';
import { env } from './env';
import type { NodeConfig } from './store';

const PDFDocument = require('pdfkit');

export type AlertType = 'lost' | 'restored' | 'escalation';
export type MetricAlertType = 'cpu' | 'mem' | 'disk';
export type MetricAlertStatus = 'high' | 'recovered';

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS
  }
});

function buildSubject(type: AlertType, node: NodeConfig, level?: number) {
  if (type === 'lost') {
    return `Moni-D alerta: ${node.name} DOWN`;
  }
  if (type === 'escalation') {
    return `Moni-D escalamiento L${level ?? 1}: ${node.name}`;
  }
  return `Moni-D recuperado: ${node.name} UP`;
}

function renderRows(rows: Array<[string, string]>) {
  return rows
    .map(
      ([label, value]) =>
        '<tr>' +
        `<td style="padding: 6px 10px; font-weight: 600; color: #0f172a;">${label}</td>` +
        `<td style="padding: 6px 10px; color: #0f172a;">${value}</td>` +
        '</tr>'
    )
    .join('');
}

function wrapCard(title: string, statusLabel: string, statusColor: string, bodyHtml: string) {
  return (
    '<div style="background:#f8fafc;padding:24px;font-family:Verdana,sans-serif;">' +
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">' +
    `<div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;">` +
    `<div style="font-size:16px;font-weight:700;color:#0f172a;">${title}</div>` +
    `<div style="padding:6px 10px;border-radius:999px;background:${statusColor};color:#ffffff;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">${statusLabel}</div>` +
    `</div>` +
    `<div style="padding:18px 20px;">${bodyHtml}</div>` +
    '</div>' +
    '<p style="margin:12px auto 0;max-width:640px;color:#64748b;font-size:12px;text-align:center;">Moni-D automated monitoring</p>' +
    '</div>'
  );
}

function buildHtml(
  type: AlertType,
  node: NodeConfig,
  whenIso: string,
  error?: string,
  level?: number
) {
  const statusLabel =
    type === 'restored'
      ? 'UP'
      : type === 'escalation'
        ? `ESC L${level ?? 1}`
        : 'DOWN';
  const statusColor = type === 'restored' ? '#16a34a' : type === 'escalation' ? '#f59e0b' : '#ef4444';
  const header =
    type === 'lost'
      ? 'Alerta de servicio'
      : type === 'escalation'
        ? 'Escalamiento de incidente'
        : 'Recuperacion de servicio';
  const rows: Array<[string, string]> = [
    ['Servicio', node.name],
    ['Host', `${node.host}:${node.port}`],
    ['Area', node.area || '-'],
    ['Grupo', node.groupName || '-'],
    ['Criticidad', node.criticality || '-'],
    ['Tags', node.tags?.length ? node.tags.join(', ') : '-'],
    ['Hora', whenIso]
  ];
  if (error) {
    rows.push(['Error', error]);
  }

  const body =
    `<p style="margin:0 0 12px;color:#475569;">${header}</p>` +
    `<table style="width:100%;border-collapse:collapse;">${renderRows(rows)}</table>`;

  return wrapCard('Moni-D alerta', statusLabel, statusColor, body);
}

export async function sendAlert(params: {
  type: AlertType;
  node: NodeConfig;
  recipients: string[];
  error?: string;
  level?: number;
}) {
  const { type, node, recipients, error, level } = params;
  if (!recipients.length) {
    return { subject: buildSubject(type, node, level), skipped: true };
  }

  const subject = buildSubject(type, node, level);
  const html = buildHtml(type, node, new Date().toISOString(), error, level);

  await transport.sendMail({
    from: env.SMTP_FROM,
    to: recipients.join(','),
    subject,
    html
  });

  return { subject, skipped: false };
}

const METRIC_META: Record<MetricAlertType, { label: string }> = {
  cpu: { label: 'CPU' },
  mem: { label: 'RAM' },
  disk: { label: 'Disco' }
};

function buildMetricSubject(params: {
  node: NodeConfig;
  metric: MetricAlertType;
  status: MetricAlertStatus;
  value: number;
  threshold: number;
}) {
  const { node, metric, status, value, threshold } = params;
  const label = METRIC_META[metric].label;
  if (status === 'recovered') {
    return `Moni-D recuperacion ${label}: ${node.name}`;
  }
  return `Moni-D alerta ${label}: ${node.name} ${value.toFixed(1)}% (umbral ${threshold}%)`;
}

function buildMetricHtml(params: {
  node: NodeConfig;
  metric: MetricAlertType;
  status: MetricAlertStatus;
  value: number;
  threshold: number;
}) {
  const { node, metric, status, value, threshold } = params;
  const label = METRIC_META[metric].label;
  const statusLabel = status === 'recovered' ? 'OK' : 'ALTO';
  const statusColor = status === 'recovered' ? '#16a34a' : '#ef4444';
  const header =
    status === 'recovered'
      ? `${label} normalizado.`
      : `${label} alto detectado.`;
  const rows: Array<[string, string]> = [
    ['Servicio', node.name],
    ['Host', `${node.host}:${node.port}`],
    ['Area', node.area || '-'],
    ['Grupo', node.groupName || '-'],
    ['Criticidad', node.criticality || '-'],
    [label, `${value.toFixed(1)}%`],
    ['Umbral', `${threshold}%`],
    ['Hora', new Date().toISOString()]
  ];
  const body =
    `<p style="margin:0 0 12px;color:#475569;">${header}</p>` +
    `<table style="width:100%;border-collapse:collapse;">${renderRows(rows)}</table>`;
  return wrapCard(`Moni-D alerta ${label}`, statusLabel, statusColor, body);
}

export async function sendMetricAlert(params: {
  node: NodeConfig;
  recipients: string[];
  metric: MetricAlertType;
  status: MetricAlertStatus;
  value: number;
  threshold: number;
}) {
  const { node, recipients, metric, status, value, threshold } = params;
  const subject = buildMetricSubject({ node, metric, status, value, threshold });
  if (!recipients.length) {
    return { subject, skipped: true };
  }

  const html = buildMetricHtml({ node, metric, status, value, threshold });

  await transport.sendMail({
    from: env.SMTP_FROM,
    to: recipients.join(','),
    subject,
    html
  });

  return { subject, skipped: false };
}

export async function sendDiskAlert(params: {
  node: NodeConfig;
  recipients: string[];
  diskPct: number;
  threshold: number;
}) {
  const { node, recipients, diskPct, threshold } = params;
  return sendMetricAlert({
    node,
    recipients,
    metric: 'disk',
    status: 'high',
    value: diskPct,
    threshold
  });
}

export async function sendWeeklyReport(params: {
  recipients: string[];
  incidents: Array<{
    id: number;
    node_name: string;
    start_at: string;
    end_at: string | null;
    duration_sec: number;
    ack_by?: string | null;
    owner?: string | null;
  }>;
}) {
  const { recipients, incidents } = params;
  if (!recipients.length) {
    return { skipped: true };
  }

  const csv = buildIncidentCsv(incidents);
  const pdf = await buildIncidentPdf(incidents);

  const rows = incidents
    .map((incident) => {
      const status = incident.end_at ? 'CLOSED' : 'OPEN';
      return (
        '<tr>' +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${incident.node_name}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${incident.start_at}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${incident.end_at || '-'}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${status}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${incident.duration_sec}s</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${incident.owner || '-'}</td>` +
        '</tr>'
      );
    })
    .join('');

  const html =
    '<div style="font-family: Verdana, sans-serif; line-height: 1.5;">' +
    '<h2 style="margin: 0 0 8px;">Moni-D Weekly Report</h2>' +
    `<p style="margin: 0 0 12px;">Incidents in the last 7 days: ${incidents.length}</p>` +
    '<table style="border-collapse: collapse; width: 100%; font-size: 12px;">' +
    '<thead><tr>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Node</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Start</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">End</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Status</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Duration</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Owner</th>' +
    '</tr></thead>' +
    `<tbody>${rows || '<tr><td colspan="6" style="padding:6px 10px;">No incidents</td></tr>'}</tbody>` +
    '</table>' +
    '<p style="margin-top: 16px; color: #666;">Moni-D automated report</p>' +
    '</div>';

  await transport.sendMail({
    from: env.SMTP_FROM,
    to: recipients.join(','),
    subject: 'Moni-D weekly report',
    html,
    attachments: [
      {
        filename: 'moni-d-weekly-report.pdf',
        content: pdf,
        contentType: 'application/pdf'
      },
      {
        filename: 'moni-d-weekly-report.csv',
        content: csv,
        contentType: 'text/csv'
      }
    ]
  });

  return { skipped: false };
}

function buildIncidentCsv(incidents: Array<any>) {
  const header = ['id', 'node', 'start_at', 'end_at', 'duration_sec', 'ack_by', 'owner'];
  const rows = incidents.map((incident) => [
    incident.id,
    incident.node_name,
    incident.start_at,
    incident.end_at ?? '',
    incident.duration_sec ?? '',
    incident.ack_by ?? '',
    incident.owner ?? ''
  ]);

  return [header, ...rows]
    .map((row) =>
      row
        .map((value) => {
          const str = String(value ?? '');
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(',')
    )
    .join('\n');
}

export async function buildIncidentPdf(incidents: Array<any>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Moni-D Weekly Report');
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
    doc.text(`Total incidents: ${incidents.length}`);
    doc.moveDown();

    const columns = [
      { label: 'Node', width: 150 },
      { label: 'Start', width: 110 },
      { label: 'End', width: 110 },
      { label: 'Status', width: 60 },
      { label: 'Duration', width: 70 },
      { label: 'Owner', width: 70 }
    ];

    const truncate = (value: string, max: number) => {
      if (value.length <= max) return value;
      return `${value.slice(0, max - 3)}...`;
    };

    const drawRow = (values: string[], bold = false) => {
      const y = doc.y;
      let x = doc.page.margins.left;
      if (bold) {
        doc.font('Helvetica-Bold');
      } else {
        doc.font('Helvetica');
      }
      values.forEach((value, idx) => {
        doc.text(truncate(value, 24), x, y, { width: columns[idx].width });
        x += columns[idx].width;
      });
      doc.moveDown(0.8);
    };

    drawRow(columns.map((col) => col.label), true);

    for (const incident of incidents) {
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
        drawRow(columns.map((col) => col.label), true);
      }
      const status = incident.end_at ? 'CLOSED' : 'OPEN';
      drawRow([
        String(incident.node_name || ''),
        String(incident.start_at || ''),
        String(incident.end_at || '-'),
        status,
        `${incident.duration_sec ?? ''}s`,
        String(incident.owner || '-')
      ]);
    }

    doc.end();
  });
}
