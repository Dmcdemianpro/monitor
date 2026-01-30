import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth';
import {
  createNode,
  createAuditLog,
  deleteNode,
  listNodes,
  listChecks,
  setNodeEnabled,
  setNodeTlsEnabled,
  updateNode
} from '../store';

const nodeSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  enabled: z.coerce.boolean().default(true),
  checkIntervalSec: z.coerce.number().int().min(10).max(86400).default(300),
  retryIntervalSec: z.coerce.number().int().min(10).max(3600).default(60),
  timeoutMs: z.coerce.number().int().min(100).max(60000).default(5000),
  tlsEnabled: z.coerce.boolean().default(false),
  escalationPolicyId: z.coerce.number().int().nullable().optional().default(null),
  agentEnabled: z.coerce.boolean().default(false),
  area: z.string().max(64).optional().default(''),
  groupName: z.string().max(64).optional().default(''),
  criticality: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  tags: z.array(z.string().max(32)).default([]),
  recipients: z.array(z.string().email()).default([]),
  channelIds: z.array(z.coerce.number().int()).default([])
});

export async function registerNodeRoutes(app: FastifyInstance) {
  app.get('/api/nodes', async () => {
    const nodes = await listNodes();
    return { nodes };
  });

  app.post('/api/nodes', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const payload = nodeSchema.parse(req.body);
    const id = await createNode(payload);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'node.create',
      entityType: 'node',
      entityId: String(id),
      payload
    });
    reply.code(201).send({ id });
  });

  app.put('/api/nodes/:id', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const payload = nodeSchema.parse(req.body);
    await updateNode(id, payload);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'node.update',
      entityType: 'node',
      entityId: String(id),
      payload
    });
    reply.send({ ok: true });
  });

  app.patch('/api/nodes/:id/enabled', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z.object({ enabled: z.coerce.boolean() }).parse(req.body);
    await setNodeEnabled(id, body.enabled);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'node.enabled.toggle',
      entityType: 'node',
      entityId: String(id),
      payload: body
    });
    reply.send({ ok: true });
  });

  app.patch('/api/nodes/:id/tls', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z.object({ tlsEnabled: z.coerce.boolean() }).parse(req.body);
    await setNodeTlsEnabled(id, body.tlsEnabled);
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'node.tls.toggle',
      entityType: 'node',
      entityId: String(id),
      payload: body
    });
    reply.send({ ok: true });
  });

  app.get('/api/nodes/:id/checks', async (req) => {
    const id = Number((req.params as any).id);
    const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    const checks = await listChecks(id, query.limit);
    return { checks };
  });

  app.delete('/api/nodes/:id', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) {
      reply.code(400).send({ error: 'invalid id' });
      return;
    }
    const deleted = await deleteNode(id);
    if (!deleted) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'node.delete',
      entityType: 'node',
      entityId: String(id)
    });
    reply.send({ ok: true });
  });
}
