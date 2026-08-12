import { FastifyInstance } from 'fastify';
import { dbHealth } from '../db';
import { getMonitorFreshness } from '../store';

export async function registerHealthRoutes(app: FastifyInstance) {
  /**
   * Salud del monitor. No alcanza con comprobar que la base responde: el
   * proceso puede seguir en pie y atendiendo requests mientras el scheduler
   * dejo de registrar checks, que es justo el caso que paso inadvertido 15
   * horas. Por eso tambien se reporta la antiguedad del ultimo check y se
   * responde 503 cuando el monitoreo dejo de avanzar, para que cualquier
   * chequeo externo lo note sin tener que interpretar el cuerpo.
   */
  app.get('/api/health', async (_req, reply) => {
    await dbHealth();
    const freshness = await getMonitorFreshness();

    if (freshness.stale) {
      reply.code(503);
    }

    return {
      ok: !freshness.stale,
      db: 'ok',
      monitoring: freshness.stale ? 'stale' : 'ok',
      lastCheckAt: freshness.lastCheckAt,
      ageSec: freshness.ageSec === null ? null : Math.round(freshness.ageSec),
      staleAfterSec: freshness.staleAfterSec,
      enabledNodes: freshness.enabledNodes
    };
  });
}
