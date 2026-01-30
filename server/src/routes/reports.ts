import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth';
import { addReportRecipient, createAuditLog, listReportRecipients, removeReportRecipient } from '../store';

export async function registerReportRoutes(app: FastifyInstance) {
  app.get('/api/reports/recipients', { preHandler: requireRole(['admin']) }, async () => {
    const recipients = await listReportRecipients();
    return { recipients };
  });

  app.post('/api/reports/recipients', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    await addReportRecipient(body.email);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'report_recipient.add',
      entityType: 'report_recipient',
      entityId: body.email,
      payload: body
    });
    reply.code(201).send({ ok: true });
  });

  app.delete('/api/reports/recipients/:id', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    await removeReportRecipient(id);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'report_recipient.delete',
      entityType: 'report_recipient',
      entityId: String(id)
    });
    reply.send({ ok: true });
  });
}
