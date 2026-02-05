import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

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
  AUTH_TOKEN_TTL_HOURS: z.coerce.number().default(24),

  REPORT_WEEKDAY: z.coerce.number().int().min(0).max(6).default(1),
  REPORT_HOUR: z.coerce.number().int().min(0).max(23).default(8),

  CPU_ALERT_PCT: z.coerce.number().int().min(1).max(100).default(85),
  MEM_ALERT_PCT: z.coerce.number().int().min(1).max(100).default(90),
  DISK_ALERT_PCT: z.coerce.number().int().min(1).max(100).default(90),
  ALERT_COOLDOWN_MIN: z.coerce.number().int().min(0).max(1440).default(30),

  AGENT_KEY: z.string().optional().default('')
});

export const env = schema.parse(process.env);
