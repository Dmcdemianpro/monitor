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
    return `Moni-D - Alerta de servicio: ${node.name} no disponible`;
  }
  if (type === 'escalation') {
    return `Moni-D - Escalamiento L${level ?? 1}: ${node.name}`;
  }
  return `Moni-D - Recuperacion de servicio: ${node.name} operativo`;
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
    '<p style="margin:12px auto 0;max-width:640px;color:#64748b;font-size:12px;text-align:center;">Moni-D monitoreo automatico</p>' +
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
      ? 'OPERATIVO'
      : type === 'escalation'
        ? `ESC L${level ?? 1}`
        : 'CAIDO';
  const statusColor = type === 'restored' ? '#16a34a' : type === 'escalation' ? '#f59e0b' : '#ef4444';
  const header =
    type === 'lost'
      ? 'Se detecto una caida del servicio.'
      : type === 'escalation'
        ? 'Escalamiento del incidente en curso.'
        : 'Servicio recuperado y operativo.';
  const rows: Array<[string, string]> = [
    ['Servicio', node.name],
    ['Host', `${node.host}:${node.port}`],
    ['Area', node.area || '-'],
    ['Grupo', node.groupName || '-'],
    ['Criticidad', node.criticality || '-'],
    ['Tags', node.tags?.length ? node.tags.join(', ') : '-'],
    ['Fecha/Hora', whenIso]
  ];
  if (error) {
    rows.push(['Error', error]);
  }

  const body =
    `<p style="margin:0 0 12px;color:#475569;">${header}</p>` +
    `<table style="width:100%;border-collapse:collapse;">${renderRows(rows)}</table>`;

  return wrapCard('Moni-D - Alerta de servicio', statusLabel, statusColor, body);
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
    return `Moni-D - Normalizacion de ${label}: ${node.name}`;
  }
  return `Moni-D - Alerta de ${label}: ${node.name} ${value.toFixed(1)}% (umbral ${threshold}%)`;
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
  const statusLabel = status === 'recovered' ? 'NORMALIZADO' : 'ALTO';
  const statusColor = status === 'recovered' ? '#16a34a' : '#ef4444';
  const header =
    status === 'recovered'
      ? `Uso de ${label} normalizado.`
      : `Uso de ${label} sobre el umbral.`;
  const rows: Array<[string, string]> = [
    ['Servicio', node.name],
    ['Host', `${node.host}:${node.port}`],
    ['Area', node.area || '-'],
    ['Grupo', node.groupName || '-'],
    ['Criticidad', node.criticality || '-'],
    [`Uso ${label}`, `${value.toFixed(1)}%`],
    ['Umbral', `${threshold}%`],
    ['Fecha/Hora', new Date().toISOString()]
  ];
  const body =
    `<p style="margin:0 0 12px;color:#475569;">${header}</p>` +
    `<table style="width:100%;border-collapse:collapse;">${renderRows(rows)}</table>`;
  return wrapCard(`Moni-D - Alerta de ${label}`, statusLabel, statusColor, body);
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
  const pdf = await buildIncidentPdf(incidents, {
    title: 'Informe semanal de incidentes',
    periodLabel: 'Ultimos 7 dias'
  });

  const total = incidents.length;
  const openCount = incidents.filter((incident) => !incident.end_at).length;
  const closedCount = total - openCount;
  const ackedCount = incidents.filter((incident) => incident.ack_by).length;
  const unackedCount = total - ackedCount;

  const rows = incidents
    .map((incident) => {
      const status = incident.end_at ? 'CERRADO' : 'ABIERTO';
      return (
        '<tr>' +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${incident.node_name}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${incident.start_at}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${incident.end_at || '-'}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${status}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${formatDurationSec(
          incident.duration_sec
        )}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${incident.owner || '-'}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${incident.ack_by || '-'}</td>` +
        '</tr>'
      );
    })
    .join('');

  const html =
    '<div style="font-family: Verdana, sans-serif; line-height: 1.5;">' +
    '<h2 style="margin: 0 0 8px;">Moni-D - Informe semanal de incidentes</h2>' +
    '<p style="margin: 0 0 12px;">Periodo: Ultimos 7 dias</p>' +
    '<table style="border-collapse: collapse; width: 100%; font-size: 12px; margin-bottom: 12px;">' +
    '<thead><tr>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Total</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Abiertos</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Cerrados</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Ack</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Sin ack</th>' +
    '</tr></thead>' +
    `<tbody><tr>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${total}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${openCount}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${closedCount}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${ackedCount}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${unackedCount}</td>` +
    `</tr></tbody>` +
    '</table>' +
    '<table style="border-collapse: collapse; width: 100%; font-size: 12px;">' +
    '<thead><tr>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Servicio</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Inicio</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Fin</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Estado</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Duracion</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Responsable</th>' +
    '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;">Ack</th>' +
    '</tr></thead>' +
    `<tbody>${rows || '<tr><td colspan="7" style="padding:6px 10px;">Sin incidentes</td></tr>'}</tbody>` +
    '</table>' +
    '<p style="margin-top: 16px; color: #666;">Reporte generado automaticamente por Moni-D.</p>' +
    '</div>';

  await transport.sendMail({
    from: env.SMTP_FROM,
    to: recipients.join(','),
    subject: 'Moni-D - Informe semanal de incidentes',
    html,
    attachments: [
      {
        filename: 'moni-d-informe-semanal.pdf',
        content: pdf,
        contentType: 'application/pdf'
      },
      {
        filename: 'moni-d-informe-semanal.csv',
        content: csv,
        contentType: 'text/csv'
      }
    ]
  });

  return { skipped: false };
}

function buildIncidentCsv(incidents: Array<any>) {
  const header = ['id', 'servicio', 'inicio', 'fin', 'duracion_seg', 'ack_por', 'responsable'];
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

function formatDurationSec(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) {
    return '-';
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours}h ${remMin}m`;
}

function formatDateTime(value: any) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  const pad = (num: number) => String(num).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export async function buildIncidentPdf(
  incidents: Array<any>,
  options?: { title?: string; periodLabel?: string; generatedAt?: string }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const title = options?.title || 'Informe de incidentes';
    const periodLabel = options?.periodLabel || 'Ultimos dias';
    const generatedAt = options?.generatedAt || new Date().toISOString();
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const total = incidents.length;
    const openCount = incidents.filter((incident) => !incident.end_at).length;
    const closedCount = total - openCount;
    const ackedCount = incidents.filter((incident) => incident.ack_by).length;
    const unackedCount = total - ackedCount;

    doc.fontSize(18).font('Helvetica-Bold').text(title);
    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica').text(`Periodo: ${periodLabel}`);
    doc.text(`Generado: ${formatDateTime(generatedAt)}`);
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').text('Resumen');
    doc.font('Helvetica');
    doc.text(`Total incidentes: ${total}`);
    doc.text(`Abiertos: ${openCount}`);
    doc.text(`Cerrados: ${closedCount}`);
    doc.text(`Ack: ${ackedCount}`);
    doc.text(`Sin ack: ${unackedCount}`);
    doc.moveDown();

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnDefs = [
      { label: 'Servicio', ratio: 0.28 },
      { label: 'Inicio', ratio: 0.2 },
      { label: 'Fin', ratio: 0.2 },
      { label: 'Estado', ratio: 0.12 },
      { label: 'Duracion', ratio: 0.1 },
      { label: 'Responsable', ratio: 0.1 }
    ];
    const columns = columnDefs.map((col) => ({
      label: col.label,
      width: Math.floor(contentWidth * col.ratio)
    }));

    const truncate = (value: string, max: number) => {
      if (value.length <= max) return value;
      return `${value.slice(0, Math.max(0, max - 3))}...`;
    };

    const drawRow = (values: string[], bold = false) => {
      const y = doc.y;
      let x = doc.page.margins.left;
      const rowHeight = 16;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      values.forEach((value, idx) => {
        const width = columns[idx].width;
        const maxChars = Math.max(8, Math.floor(width / 5));
        const text = truncate(value, maxChars);
        doc.text(text, x, y, { width, lineBreak: false });
        x += width;
      });
      doc.y = y + rowHeight;
    };

    drawRow(columns.map((col) => col.label), true);

    for (const incident of incidents) {
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
        drawRow(columns.map((col) => col.label), true);
      }
      const status = incident.end_at ? 'CERRADO' : 'ABIERTO';
      drawRow([
        String(incident.node_name || ''),
        formatDateTime(incident.start_at),
        formatDateTime(incident.end_at || null),
        status,
        formatDurationSec(incident.duration_sec),
        String(incident.owner || '-')
      ]);
    }

    doc.end();
  });
}
