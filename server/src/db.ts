import { Pool } from 'pg';
import { env } from './env';

export const pool = new Pool({
  host: env.PGHOST,
  port: env.PGPORT,
  database: env.PGDATABASE,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  max: 10
});

export async function dbHealth() {
  await pool.query('select 1 as ok');
}
