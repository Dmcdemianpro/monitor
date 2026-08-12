import { Pool } from 'pg';
import { env } from './env';

export const pool = new Pool({
  host: env.PGHOST,
  port: env.PGPORT,
  database: env.PGDATABASE,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  max: 10,
  // Detecta conexiones muertas (equipo suspendido, corte de red, reinicio de
  // Postgres). Sin esto los sockets quedan medio abiertos en ESTABLISHED y el
  // pool se satura con clientes zombis: toda query espera para siempre.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  // Recicla clientes ociosos en vez de mantenerlos abiertos indefinidamente.
  idleTimeoutMillis: 30_000,
  // Falla rapido si el pool esta saturado o Postgres no responde, en lugar de
  // dejar la request colgada.
  connectionTimeoutMillis: 10_000,
  // Libera el cliente si una query se traba del lado del servidor.
  statement_timeout: 20_000,
  query_timeout: 20_000
});

// El pool emite 'error' cuando un cliente ocioso se cae. Sin listener, Node
// puede tumbar el proceso; con listener, pg descarta el cliente y sigue.
pool.on('error', (err) => {
  console.error('[db] error en cliente ocioso del pool:', err.message);
});

export async function dbHealth() {
  await pool.query('select 1 as ok');
}
