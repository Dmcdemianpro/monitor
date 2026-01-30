import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth';
import { env } from '../env';
import { createAuditLog, listLatestAgentMetrics, recordAgentMetric } from '../store';

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

    reply.send({ ok: true });
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
