import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole, hashPassword } from '../auth';
import { pool } from '../db';
import { createAuditLog } from '../store';

export async function registerUserRoutes(app: FastifyInstance) {
  app.get('/api/users', { preHandler: requireRole(['admin']) }, async () => {
    const { rows } = await pool.query(
      'SELECT id, username, role, enabled, created_at, updated_at FROM users ORDER BY id'
    );
    return { users: rows };
  });

  app.post('/api/users', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const body = z
      .object({
        username: z.string().min(1).max(64),
        password: z.string().min(4).max(128),
        role: z.enum(['admin', 'operator', 'viewer']),
        enabled: z.boolean().default(true)
      })
      .parse(req.body);

    const passwordHash = hashPassword(body.password);

    try {
      const { rows } = await pool.query(
        `INSERT INTO users (username, password_hash, role, enabled)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [body.username, passwordHash, body.role, body.enabled]
      );
      const id = rows[0].id;
      const user = (req as any).user;
      await createAuditLog({
        actor: user?.username ?? null,
        role: user?.role ?? null,
        action: 'user.create',
        entityType: 'user',
        entityId: String(id),
        payload: { username: body.username, role: body.role, enabled: body.enabled }
      });
      reply.code(201).send({ id });
    } catch (err: any) {
      if (err?.code === '23505') {
        reply.code(409).send({ error: 'El nombre de usuario ya existe' });
        return;
      }
      throw err;
    }
  });

  app.put('/api/users/:id', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z
      .object({
        username: z.string().min(1).max(64),
        role: z.enum(['admin', 'operator', 'viewer']),
        enabled: z.boolean()
      })
      .parse(req.body);

    try {
      const { rowCount } = await pool.query(
        `UPDATE users SET username = $1, role = $2, enabled = $3, updated_at = now()
         WHERE id = $4`,
        [body.username, body.role, body.enabled, id]
      );
      if (!rowCount) {
        reply.code(404).send({ error: 'not found' });
        return;
      }
      const user = (req as any).user;
      await createAuditLog({
        actor: user?.username ?? null,
        role: user?.role ?? null,
        action: 'user.update',
        entityType: 'user',
        entityId: String(id),
        payload: { username: body.username, role: body.role, enabled: body.enabled }
      });
      reply.send({ ok: true });
    } catch (err: any) {
      if (err?.code === '23505') {
        reply.code(409).send({ error: 'El nombre de usuario ya existe' });
        return;
      }
      throw err;
    }
  });

  app.patch('/api/users/:id/password', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z
      .object({
        password: z.string().min(4).max(128)
      })
      .parse(req.body);

    const passwordHash = hashPassword(body.password);
    const { rowCount } = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
      [passwordHash, id]
    );
    if (!rowCount) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'user.password.change',
      entityType: 'user',
      entityId: String(id)
    });
    reply.send({ ok: true });
  });

  app.delete('/api/users/:id', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) {
      reply.code(400).send({ error: 'invalid id' });
      return;
    }
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    if (!rowCount) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    const user = (req as any).user;
    await createAuditLog({
      actor: user?.username ?? null,
      role: user?.role ?? null,
      action: 'user.delete',
      entityType: 'user',
      entityId: String(id)
    });
    reply.send({ ok: true });
  });
}
