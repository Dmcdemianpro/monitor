// Configuracion de PM2 para el backend de Moni-D.
//
//   npm run build            compila TypeScript a dist/
//   pm2 start ecosystem.config.js
//   pm2 save                 recuerda el proceso entre reinicios de PM2
//   pm2 logs moni-d          ver salida en vivo
//   pm2 status               estado y cantidad de reinicios
//
// Corre dist/ y no tsx: el watcher de desarrollo reinicia ante cualquier
// cambio de archivo, que en produccion es un modo de falla, no una comodidad.
module.exports = {
  apps: [
    {
      name: 'moni-d',
      script: 'dist/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production'
      },

      // El watchdog termina el proceso cuando el monitoreo deja de avanzar;
      // esto es lo que lo vuelve a levantar. Sin autorestart, salir de un
      // cuelgue seria simplemente quedarse muerto.
      autorestart: true,

      // Espera creciente entre reintentos. Si la causa es persistente (base
      // caida, .env mal configurado), evita un bucle de reinicios que llene
      // el disco de logs sin arreglar nada.
      exp_backoff_restart_delay: 1000,

      // Un arranque cuenta como estable recien tras 60s en pie. Asi un proceso
      // que muere durante el arranque no se reintenta indefinidamente.
      min_uptime: '60s',
      max_restarts: 10,

      // Reinicio preventivo si la memoria se dispara.
      max_memory_restart: '500M',

      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
