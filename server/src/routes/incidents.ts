import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth';
import { buildIncidentPdf } from '../email';
import {
  acknowledgeIncident,
  addIncidentNote,
  clearIncidentAck,
  listIncidentNotes,
  listIncidents,
  listIncidentsForReport,
  setIncidentOwner,
  createAuditLog
} from '../store';

export async function registerIncidentRoutes(app: FastifyInstance) {
  app.get('/api/incidents', async (req) => {
    const query = z.object({ days: z.coerce.number().int().min(1).max(365).default(90) }).parse(req.query);
    const incidents = await listIncidents(query.days);
    return { incidents };
  });

  app.get('/api/incidents/:id/notes', { preHandler: requireRole(['admin', 'operator']) }, async (req) => {
    const id = Number((req.params as any).id);
    const notes = await listIncidentNotes(id);
    return { notes };
  });

  app.post('/api/incidents/:id/notes', { preHandler: requireRole(['admin', 'operator']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z.object({ author: z.string().min(1), note: z.string().min(1) }).parse(req.body);
    const noteId = await addIncidentNote(id, body.author, body.note);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'incident.note.add',
      entityType: 'incident',
      entityId: String(id),
      payload: body
    });
    reply.code(201).send({ id: noteId });
  });

  app.patch('/api/incidents/:id/ack', { preHandler: requireRole(['admin', 'operator']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z
      .object({
        acknowledged: z.coerce.boolean().default(true),
        by: z.string().min(1),
        note: z.string().optional().default('')
      })
      .parse(req.body);

    if (body.acknowledged) {
      await acknowledgeIncident(id, body.by, body.note);
    } else {
      await clearIncidentAck(id);
    }
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: body.acknowledged ? 'incident.ack' : 'incident.unack',
      entityType: 'incident',
      entityId: String(id),
      payload: body
    });
    reply.send({ ok: true });
  });

  app.patch('/api/incidents/:id/owner', { preHandler: requireRole(['admin', 'operator']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z.object({ owner: z.string().optional().default('') }).parse(req.body);
    await setIncidentOwner(id, body.owner || null);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'incident.owner.set',
      entityType: 'incident',
      entityId: String(id),
      payload: body
    });
    reply.send({ ok: true });
  });

  app.get('/api/incidents/export', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const query = z.object({ days: z.coerce.number().int().min(1).max(365).default(90) }).parse(req.query);
    const incidents = await listIncidentsForReport(query.days);
    const header = ['id', 'node', 'start_at', 'end_at', 'duration_sec', 'ack_by', 'owner'];
    const rows = incidents.map((incident: any) => [
      incident.id,
      incident.node_name,
      incident.start_at,
      incident.end_at ?? '',
      incident.duration_sec,
      incident.ack_by ?? '',
      incident.owner ?? ''
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((value) => {
            const str = String(value ?? '');
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(',')
      )
      .join('\n');
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="incidents.csv"');
    reply.send(csv);
  });

  app.get('/api/incidents/export/pdf', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const query = z.object({ days: z.coerce.number().int().min(1).max(365).default(90) }).parse(req.query);
    const incidents = await listIncidentsForReport(query.days);
    const pdf = await buildIncidentPdf(incidents, {
      title: 'Informe de incidentes',
      periodLabel: `Ultimos ${query.days} dias`
    });
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', 'attachment; filename="incidents.pdf"');
    reply.send(pdf);
  });
}
