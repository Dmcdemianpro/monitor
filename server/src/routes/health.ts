import { FastifyInstance } from 'fastify';
import { dbHealth } from '../db';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    await dbHealth();
    return { ok: true };
  });
}
