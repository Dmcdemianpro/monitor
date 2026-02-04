import nodemailer from 'nodemailer';
import { env } from './env';
import type { NodeConfig } from './store';

const PDFDocument = require('pdfkit');

export type AlertType = 'lost' | 'restored' | 'escalation';

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
    return `Moni-D alert: ${node.name} down`;
  }
  if (type === 'escalation') {
    return `Moni-D escalation L${level ?? 1}: ${node.name}`;
  }
  return `Moni-D recovery: ${node.name} up`;
}

function buildHtml(
  type: AlertType,
  node: NodeConfig,
  whenIso: string,
  error?: string,
  level?: number
) {
  const statusLine = type === 'restored' ? 'Status: UP' : 'Status: DOWN';
  const note =
    type === 'lost'
      ? 'Connection failed'
      : type === 'escalation'
        ? `Escalation level ${level ?? 1}`
        : 'Connection restored';

  return (
    '<div style="font-family: Verdana, sans-serif; line-height: 1.5;">' +
    '<h2 style="margin: 0 0 8px;">Moni-D Notification</h2>' +
    `<p style="margin: 0 0 10px;">${note}</p>` +
    '<table style="border-collapse: collapse;">' +
    '<tr><td style="padding: 4px 10px; font-weight: bold;">Node</td>' +
    `<td style="padding: 4px 10px;">${node.name}</td></tr>` +
    '<tr><td style="padding: 4px 10px; font-weight: bold;">Host</td>' +
    `<td style="padding: 4px 10px;">${node.host}:${node.port}</td></tr>` +
    '<tr><td style="padding: 4px 10px; font-weight: bold;">Time</td>' +
    `<td style="padding: 4px 10px;">${whenIso}</td></tr>` +
    '<tr><td style="padding: 4px 10px; font-weight: bold;">Status</td>' +
    `<td style="padding: 4px 10px;">${statusLine}</td></tr>` +
    (error ? `<tr><td style="padding: 4px 10px; font-weight: bold;">Error</td><td style="padding: 4px 10px;">${error}</td></tr>` : '') +
    '</table>' +
    '<p style="margin-top: 16px; color: #666;">Moni-D automated monitoring</p>' +
    '</div>'
  );
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

function buildDiskSubject(node: NodeConfig, diskPct: number, threshold: number) {
  return `Moni-D disk alert: ${node.name} ${diskPct.toFixed(1)}%`;
}

function buildDiskHtml(node: NodeConfig, diskPct: number, threshold: number) {
  return (
    '<div style="font-family: Verdana, sans-serif; line-height: 1.5;">' +
    '<h2 style="margin: 0 0 8px;">Moni-D Disk Alert</h2>' +
    `<p style="margin: 0 0 10px;">Disk usage reached ${diskPct.toFixed(1)}% (threshold ${threshold}%).</p>` +
    '<table style="border-collapse: collapse;">' +
    '<tr><td style="padding: 4px 10px; font-weight: bold;">Node</td>' +
    `<td style="padding: 4px 10px;">${node.name}</td></tr>` +
    '<tr><td style="padding: 4px 10px; font-weight: bold;">Host</td>' +
    `<td style="padding: 4px 10px;">${node.host}:${node.port}</td></tr>` +
    '<tr><td style="padding: 4px 10px; font-weight: bold;">Time</td>' +
    `<td style="padding: 4px 10px;">${new Date().toISOString()}</td></tr>` +
    '<tr><td style="padding: 4px 10px; font-weight: bold;">Disk usage</td>' +
    `<td style="padding: 4px 10px;">${diskPct.toFixed(1)}%</td></tr>` +
    '</table>' +
    '<p style="margin-top: 16px; color: #666;">Moni-D automated monitoring</p>' +
    '</div>'
  );
}

export async function sendDiskAlert(params: {
  node: NodeConfig;
  recipients: string[];
  diskPct: number;
  threshold: number;
}) {
  const { node, recipients, diskPct, threshold } = params;
  const subject = buildDiskSubject(node, diskPct, threshold);
  if (!recipients.length) {
    return { subject, skipped: true };
  }

  const html = buildDiskHtml(node, diskPct, threshold);

  await transport.sendMail({
    from: env.SMTP_FROM,
    to: recipients.join(','),
    subject,
    html
  });

  return { subject, skipped: false };
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

async function buildIncidentPdf(incidents: Array<any>): Promise<Buffer> {
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
