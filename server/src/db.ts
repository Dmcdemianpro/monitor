import { Pool, type PoolClient } from 'pg';
import { env } from './env';

export const pool = new Pool({
  host: env.PGHOST,
  port: env.PGPORT,
  database: env.PGDATABASE,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  // El dashboard pide 7 recursos por vuelta y puede haber varios navegadores
  // abiertos, ademas de los runners del scheduler.
  max: 20,
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

/**
 * Ejecuta `fn` dentro de una transaccion con un cliente propio del pool.
 *
 * Toda transaccion debe pasar por aqui y no usar pool.connect() a mano:
 * mientras un cliente esta prestado, pg-pool le quita su listener de 'error'.
 * Si la conexion se corta en ese lapso, pg emite 'error' sobre el cliente y,
 * sin nadie que lo escuche, Node tumba el proceso entero. Asi murio Moni-D el
 * 16-11-2026 a las 11:02 ("Unhandled 'error' event ... Connection terminated
 * unexpectedly") y quedo un dia sin monitorear.
 *
 * Ademas, un cliente con la conexion rota se devuelve con release(err) para
 * que el pool lo descarte en vez de prestarlo de nuevo.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  const onError = (err: Error) => {
    broken = err;
    console.error('[db] se corto la conexion de un cliente en uso:', err.message);
  };
  client.on('error', onError);

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Si ni el ROLLBACK pasa, la conexion esta rota: se descarta al liberar.
      broken = broken ?? (rollbackErr as Error);
    }
    throw err;
  } finally {
    // Con la conexion rota el listener se deja puesto: el pool la cierra al
    // liberarla y un 'error' tardio no debe quedar sin escuchar.
    if (!broken) {
      client.off('error', onError);
    }
    client.release(broken);
  }
}
