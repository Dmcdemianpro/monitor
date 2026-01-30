import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth';
import { pool } from '../db';

export async function registerAuditRoutes(app: FastifyInstance) {
  app.get('/api/audit', { preHandler: requireRole(['admin']) }, async (req) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    const res = await pool.query(
      `
      SELECT id, actor, role, action, entity_type, entity_id, payload, ip, created_at
        FROM audit_logs
       ORDER BY created_at DESC
       LIMIT $1
      `,
      [query.limit]
    );
    return { logs: res.rows };
  });
}
