import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth';
import {
  createAlertChannel,
  createEscalationPolicy,
  createSilence,
  deleteAlertChannel,
  deleteEscalationPolicy,
  deleteSilence,
  listAlertChannels,
  listEscalationPolicies,
  listSilences,
  updateAlertChannel,
  updateEscalationPolicy,
  updateSilence,
  createAuditLog
} from '../store';

const channelSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['webhook', 'slack', 'teams', 'sms']),
  enabled: z.coerce.boolean().default(true),
  config: z.any().default({})
});

const silenceSchema = z.object({
  name: z.string().min(1),
  enabled: z.coerce.boolean().default(true),
  startAt: z.string().min(1),
  endAt: z.string().optional().nullable().default(null),
  nodeId: z.coerce.number().int().optional().nullable().default(null),
  area: z.string().optional().default(''),
  groupName: z.string().optional().default(''),
  tag: z.string().optional().default(''),
  criticality: z.string().optional().default('')
});

const escalationLevelSchema = z.object({
  level: z.coerce.number().int().min(1),
  delayMin: z.coerce.number().int().min(0).default(0),
  includeNodeRecipients: z.coerce.boolean().default(true),
  channelIds: z.array(z.coerce.number().int()).default([]),
  emails: z.array(z.string().email()).default([])
});

const escalationSchema = z.object({
  name: z.string().min(1),
  enabled: z.coerce.boolean().default(true),
  levels: z.array(escalationLevelSchema).default([])
});

export async function registerAlertRoutes(app: FastifyInstance) {
  app.get('/api/alerts/channels', { preHandler: requireRole(['admin']) }, async () => {
    const channels = await listAlertChannels();
    return { channels };
  });

  app.post('/api/alerts/channels', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const payload = channelSchema.parse(req.body);
    const id = await createAlertChannel(payload);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'alert_channel.create',
      entityType: 'alert_channel',
      entityId: String(id),
      payload
    });
    reply.code(201).send({ id });
  });

  app.put('/api/alerts/channels/:id', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const payload = channelSchema.parse(req.body);
    await updateAlertChannel(id, payload);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'alert_channel.update',
      entityType: 'alert_channel',
      entityId: String(id),
      payload
    });
    reply.send({ ok: true });
  });

  app.delete('/api/alerts/channels/:id', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    await deleteAlertChannel(id);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'alert_channel.delete',
      entityType: 'alert_channel',
      entityId: String(id)
    });
    reply.send({ ok: true });
  });

  app.get('/api/alerts/silences', { preHandler: requireRole(['admin']) }, async () => {
    const silences = await listSilences();
    return { silences };
  });

  app.post('/api/alerts/silences', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const payload = silenceSchema.parse(req.body);
    const id = await createSilence(payload);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'silence.create',
      entityType: 'silence',
      entityId: String(id),
      payload
    });
    reply.code(201).send({ id });
  });

  app.put('/api/alerts/silences/:id', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const payload = silenceSchema.parse(req.body);
    await updateSilence(id, payload);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'silence.update',
      entityType: 'silence',
      entityId: String(id),
      payload
    });
    reply.send({ ok: true });
  });

  app.delete('/api/alerts/silences/:id', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    await deleteSilence(id);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'silence.delete',
      entityType: 'silence',
      entityId: String(id)
    });
    reply.send({ ok: true });
  });

  app.get('/api/alerts/escalations', { preHandler: requireRole(['admin']) }, async () => {
    const policies = await listEscalationPolicies();
    return { policies };
  });

  app.post('/api/alerts/escalations', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const payload = escalationSchema.parse(req.body);
    const id = await createEscalationPolicy(payload);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'escalation.create',
      entityType: 'escalation_policy',
      entityId: String(id),
      payload
    });
    reply.code(201).send({ id });
  });

  app.put('/api/alerts/escalations/:id', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const payload = escalationSchema.parse(req.body);
    await updateEscalationPolicy(id, payload);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'escalation.update',
      entityType: 'escalation_policy',
      entityId: String(id),
      payload
    });
    reply.send({ ok: true });
  });

  app.delete('/api/alerts/escalations/:id', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    await deleteEscalationPolicy(id);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'escalation.delete',
      entityType: 'escalation_policy',
      entityId: String(id)
    });
    reply.send({ ok: true });
  });
}
