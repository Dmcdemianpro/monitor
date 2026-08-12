import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ override: true });

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(4000),

  PGHOST: z.string(),
  PGPORT: z.coerce.number().default(5432),
  PGDATABASE: z.string(),
  PGUSER: z.string(),
  PGPASSWORD: z.string(),

  SMTP_HOST: z.string().default('smtp.office365.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  SMTP_FROM: z.string(),

  CORS_ORIGIN: z.string().default('*'),
  RETENTION_DAYS: z.coerce.number().default(90),
  SYNC_INTERVAL_SEC: z.coerce.number().default(60),

  ADMIN_USER: z.string(),
  ADMIN_PASS: z.string(),
  OPERATOR_USER: z.string().optional().default(''),
  OPERATOR_PASS: z.string().optional().default(''),
  VIEWER_USER: z.string().optional().default(''),
  VIEWER_PASS: z.string().optional().default(''),
  AUTH_SECRET: z.string(),
  AUTH_TOKEN_TTL_HOURS: z.coerce.number().default(168),

  REPORT_WEEKDAY: z.coerce.number().int().min(0).max(6).default(1),
  REPORT_HOUR: z.coerce.number().int().min(0).max(23).default(8),

  CPU_ALERT_PCT: z.coerce.number().int().min(1).max(100).default(85),
  MEM_ALERT_PCT: z.coerce.number().int().min(1).max(100).default(90),
  DISK_ALERT_PCT: z.coerce.number().int().min(1).max(100).default(90),
  ALERT_COOLDOWN_MIN: z.coerce.number().int().min(0).max(1440).default(10),

  AGENT_KEY: z.string().optional().default(''),

  // Vigilancia del propio monitor. El umbral por defecto se calcula desde el
  // check_interval_sec mas alto de los nodos activos; estos valores solo lo
  // acotan y permiten forzarlo si hiciera falta.
  // HEALTH_STALE_FACTOR: cuantos intervalos de atraso se toleran antes de
  // considerar que el monitoreo dejo de avanzar.
  HEALTH_STALE_FACTOR: z.coerce.number().min(1.5).default(3),
  // Piso del umbral, para que nodos con intervalos muy cortos no den falsos
  // positivos ante una pausa normal.
  HEALTH_STALE_MIN_SEC: z.coerce.number().int().min(60).default(300),
  // Override manual. 0 = usar el calculo automatico.
  HEALTH_STALE_AFTER_SEC: z.coerce.number().int().min(0).default(0),
  // Si el monitoreo no avanza, termina el proceso para que el supervisor
  // (PM2) lo reinicie. Un proceso trabado no se recupera solo.
  WATCHDOG_EXIT_ON_STALL: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Margen tras el arranque antes de vigilar, para no matar el proceso
  // mientras todavia no completo la primera ronda de checks.
  WATCHDOG_GRACE_SEC: z.coerce.number().int().min(60).default(600)
});

export const env = schema.parse(process.env);
