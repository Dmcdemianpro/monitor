import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './env';
import { dbHealth, pool } from './db';
import { startScheduler } from './scheduler';
import { verifyEmailTransport } from './email';
import { registerHealthRoutes } from './routes/health';
import { registerNodeRoutes } from './routes/nodes';
import { registerIncidentRoutes } from './routes/incidents';
import { registerMetricsRoutes } from './routes/metrics';
import { registerAuthRoutes } from './routes/auth';
import { registerAlertRoutes } from './routes/alerts';
import { registerReportRoutes } from './routes/reports';
import { registerAgentRoutes } from './routes/agent';
import { registerAuditRoutes } from './routes/audit';
import { registerUserRoutes } from './routes/users';

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
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
  await registerUserRoutes(app);

  app.addHook('onClose', async () => {
    await pool.end();
  });

  return app;
}

async function start() {
  const app = await buildServer();

  // Cualquier error que se escape termina el proceso con codigo 1 para que el
  // supervisor lo relance. Seguir vivo despues de un error desconocido es
  // peor: el proceso puede quedar en un estado en que no monitorea nada.
  const fatal = (kind: string) => (err: unknown) => {
    app.log.fatal({ err }, `${kind}: el proceso termina para que el supervisor lo reinicie`);
    process.exit(1);
  };
  process.on('uncaughtException', fatal('uncaughtException'));
  process.on('unhandledRejection', fatal('unhandledRejection'));

  // Al detenerlo (Ctrl+C, systemd stop) cierra el servidor y el pool en orden.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info(`${signal} recibido, cerrando`);
      app
        .close()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    });
  }

  await dbHealth();

  await app.listen({ host: env.HOST, port: env.PORT });
  await verifyEmailTransport(app.log);
  await startScheduler(app.log);
}

/** Una linea legible: los errores de conexion de pg llegan como AggregateError sin mensaje. */
function describeError(err: any): string {
  if (Array.isArray(err?.errors) && err.errors.length) {
    return err.errors
      .map((e: any) => [e.code, e.address && `${e.address}:${e.port}`].filter(Boolean).join(' ') || e.message)
      .join(' / ');
  }
  return err?.message || String(err);
}

start().catch((err) => {
  console.error(`[moni-d] no pudo arrancar: ${describeError(err)}`);
  process.exit(1);
});
