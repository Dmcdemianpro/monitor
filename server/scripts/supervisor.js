#!/usr/bin/env node
/**
 * Supervisor de Moni-D: relanza el servidor cada vez que termina.
 *
 * Por que existe: el 16-11-2026 a las 11:02 el servidor murio por un error de
 * Postgres y quedo un dia entero sin monitorear. Lo corria `tsx watch`, que
 * solo reinicia ante cambios de archivo: con el hijo muerto el watcher seguia
 * vivo, y el Panel de control lo mostraba como ACTIVO. El watchdog del
 * scheduler tambien depende de esto, porque termina el proceso a proposito
 * cuando el monitoreo se traba y espera que alguien lo vuelva a levantar.
 *
 * Uso:
 *   node scripts/supervisor.js          corre src/ con tsx, sin watch
 *   node scripts/supervisor.js --dist   corre dist/index.js (requiere npm run build)
 *
 * `npm run dev` apunta aqui porque es lo que lanza el Panel de control. Para
 * desarrollar con recarga automatica esta `npm run dev:watch`.
 *
 * Detenerlo (Ctrl+C, o taskkill /t desde el Panel) detiene tambien al hijo.
 * En Linux no hace falta: systemd con Restart=always cumple esta funcion
 * (ver DEPLOY.md).
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const useDist = process.argv.includes('--dist');

const args = useDist
  ? [path.join(root, 'dist', 'index.js')]
  : [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(root, 'src', 'index.ts')];

if (!fs.existsSync(args[0])) {
  console.error(
    useDist
      ? `[supervisor] No existe ${args[0]}. Compila primero con: npm run build`
      : `[supervisor] No existe ${args[0]}. Instala dependencias con: npm ci`
  );
  process.exit(1);
}

// Un arranque cuenta como estable tras 60 s en pie. Si muere antes, la causa
// suele ser persistente (base caida, .env mal configurado): se espacian los
// reintentos para no llenar el log sin arreglar nada, pero sin pasar de un
// minuto, porque cuando la base vuelve el monitor tiene que volver pronto.
const STABLE_AFTER_MS = 60_000;
const backoffMs = (failedStarts) => (failedStarts >= 5 ? 60_000 : failedStarts >= 3 ? 30_000 : 5_000);

let child = null;
let stopping = false;
let failedStarts = 0;
let restarts = 0;

function log(msg) {
  const ts = new Date().toLocaleString('sv-SE'); // yyyy-mm-dd hh:mm:ss, hora local
  console.log(`[supervisor ${ts}] ${msg}`);
}

function run() {
  const startedAt = Date.now();
  log(`iniciando moni-d (${useDist ? 'dist' : 'tsx src'})${restarts ? `, reinicio #${restarts}` : ''}`);

  child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });

  child.on('error', (err) => log(`no se pudo lanzar el proceso: ${err.message}`));

  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) {
      process.exit(0);
    }

    const upMs = Date.now() - startedAt;
    failedStarts = upMs < STABLE_AFTER_MS ? failedStarts + 1 : 0;
    const waitMs = backoffMs(failedStarts);
    restarts += 1;

    log(
      `moni-d termino (codigo ${code ?? '-'}${signal ? `, senal ${signal}` : ''}) ` +
        `tras ${Math.round(upMs / 1000)} s. Reinicio en ${waitMs / 1000} s` +
        (failedStarts >= 3 ? ` (${failedStarts} arranques fallidos seguidos, revisa el log)` : '')
    );
    setTimeout(run, waitMs);
  });
}

function shutdown(signal) {
  if (stopping) {
    return;
  }
  stopping = true;
  log(`${signal} recibido, deteniendo moni-d`);
  if (!child) {
    process.exit(0);
  }
  child.kill(signal);
  // Si el hijo no termina solo, no se deja colgado al supervisor.
  setTimeout(() => {
    if (child) {
      child.kill('SIGKILL');
    }
    process.exit(0);
  }, 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

run();
