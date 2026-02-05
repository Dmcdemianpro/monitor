import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listAreaMetrics, listGroupMetrics, listLatencySeries, listNodeMetrics } from '../store';

export async function registerMetricsRoutes(app: FastifyInstance) {
  app.get('/api/metrics/nodes', async (req) => {
    const query = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    const metrics = await listNodeMetrics(query.days);
    return { metrics };
  });

  app.get('/api/metrics/areas', async (req) => {
    const query = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    const metrics = await listAreaMetrics(query.days);
    return { metrics };
  });

  app.get('/api/metrics/groups', async (req) => {
    const query = z
      .object({
        days: z.coerce.number().int().min(1).max(365).default(30),
        area: z.string().optional()
      })
      .parse(req.query);
    const metrics = await listGroupMetrics(
      query.days,
      query.area && query.area.length ? query.area : undefined
    );
    return { metrics };
  });

  app.get('/api/metrics/latency', async (req) => {
    const query = z
      .object({
        days: z.coerce.number().int().min(1).max(365).default(7),
        bucket: z.enum(['hour', 'day']).default('hour'),
        nodeId: z.coerce.number().int().optional(),
        area: z.string().optional(),
        groupName: z.string().optional()
      })
      .parse(req.query);

    const series = await listLatencySeries({
      days: query.days,
      bucket: query.bucket,
      nodeId: query.nodeId,
      area: query.area && query.area.length ? query.area : undefined,
      groupName: query.groupName && query.groupName.length ? query.groupName : undefined
    });

    return { series };
  });
}
