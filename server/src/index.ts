import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './env';
import { dbHealth, pool } from './db';
import { startScheduler } from './scheduler';
import { registerHealthRoutes } from './routes/health';
import { registerNodeRoutes } from './routes/nodes';
import { registerIncidentRoutes } from './routes/incidents';
import { registerMetricsRoutes } from './routes/metrics';
import { registerAuthRoutes } from './routes/auth';
import { registerAlertRoutes } from './routes/alerts';
import { registerReportRoutes } from './routes/reports';
import { registerAgentRoutes } from './routes/agent';
import { registerAuditRoutes } from './routes/audit';

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim())
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerNodeRoutes(app);
  await registerIncidentRoutes(app);
  await registerMetricsRoutes(app);
  await registerAlertRoutes(app);
  await registerReportRoutes(app);
  await registerAgentRoutes(app);
  await registerAuditRoutes(app);

  app.addHook('onClose', async () => {
    await pool.end();
  });

  return app;
}

async function start() {
  const app = await buildServer();
  await dbHealth();

  await app.listen({ host: env.HOST, port: env.PORT });
  await startScheduler(app.log);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
