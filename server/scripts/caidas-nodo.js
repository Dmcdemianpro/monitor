// Extrae de la BD de Moni-D la historia de caidas de uno o mas nodos.
//   node scripts/caidas-nodo.js --list           lista nodos con su cantidad de incidentes
//   node scripts/caidas-nodo.js <id> [<id>...]   JSON con nodo, incidentes y huecos de cobertura
// Solo lectura. Usa el pg y el .env de C:\moni-D\server.
const path = require('path');
const SERVER = path.join(__dirname, '..');
require(path.join(SERVER, 'node_modules', 'dotenv')).config({ path: path.join(SERVER, '.env') });
const { Client } = require(path.join(SERVER, 'node_modules', 'pg'));

async function main() {
  const c = new Client({
    host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD,
    connectionTimeoutMillis: 10000
  });
  await c.connect();
  await c.query("SET default_transaction_read_only = on; SET TIME ZONE 'America/Santiago'");
  try {
    if (process.argv[2] === '--list') {
      const r = await c.query(`
        SELECT n.id, n.name, n.host, n.port, n.enabled, n.area, n.group_name, n.tags, n.check_interval_sec ci,
               n.retry_interval_sec ri, n.timeout_ms, n.created_at::date,
               (SELECT count(*) FROM incidents i WHERE i.node_id = n.id) AS incidentes,
               (SELECT min(checked_at)::date FROM checks k WHERE k.node_id = n.id) AS primer_check
          FROM nodes n ORDER BY n.id`);
      console.table(r.rows.map((x) => ({ ...x, tags: (x.tags || []).join(',') })));
      return;
    }
    const ids = process.argv.slice(2).map(Number);
    const out = { generado: new Date().toISOString(), nodos: [] };
    for (const id of ids) {
      const node = (await c.query('SELECT * FROM nodes WHERE id = $1', [id])).rows[0];
      const cobertura = (await c.query(
        `SELECT min(checked_at) desde, max(checked_at) hasta, count(*) checks,
                count(*) FILTER (WHERE status = 'FAILURE') fallidos
           FROM checks WHERE node_id = $1`, [id])).rows[0];
      const incidentes = (await c.query(
        `SELECT i.id, i.start_at, i.end_at,
                EXTRACT(EPOCH FROM (coalesce(i.end_at, now()) - i.start_at)) AS dur_seg,
                fc.error AS error_inicio, i.ack_at, i.ack_by, i.ack_note, i.owner,
                (SELECT count(*) FROM checks k WHERE k.node_id = i.node_id AND k.status = 'FAILURE'
                    AND k.checked_at BETWEEN i.start_at AND coalesce(i.end_at, now())) AS checks_fallidos,
                (SELECT string_agg(DISTINCT k.error, ' | ') FROM checks k WHERE k.node_id = i.node_id
                    AND k.status = 'FAILURE' AND k.checked_at BETWEEN i.start_at AND coalesce(i.end_at, now())) AS errores,
                (SELECT json_agg(json_build_object('autor', author, 'nota', note, 'fecha', created_at) ORDER BY created_at)
                   FROM incident_notes WHERE incident_id = i.id) AS notas
           FROM incidents i LEFT JOIN checks fc ON fc.id = i.first_check_id
          WHERE i.node_id = $1 ORDER BY i.start_at`, [id])).rows;
      // Huecos: tramos sin ningun check del nodo mayores a 3 veces su intervalo
      // (o 15 min). Ahi Moni-D no estaba mirando: lo que paso es desconocido.
      const umbral = Math.max(900, (node.check_interval_sec || 300) * 3);
      const huecos = (await c.query(
        `SELECT prev AS desde, checked_at AS hasta, EXTRACT(EPOCH FROM (checked_at - prev)) AS dur_seg
           FROM (SELECT checked_at, lag(checked_at) OVER (ORDER BY checked_at) prev
                   FROM checks WHERE node_id = $1) t
          WHERE prev IS NOT NULL AND checked_at - prev > make_interval(secs => $2)
          ORDER BY prev`, [id, umbral])).rows;
      const ultimo = (await c.query('SELECT max(checked_at) m FROM checks WHERE node_id = $1', [id])).rows[0].m;
      out.nodos.push({ node, cobertura, incidentes, huecos, umbralHuecoSeg: umbral, ultimoCheck: ultimo });
    }
    console.log(JSON.stringify(out, null, 1));
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
