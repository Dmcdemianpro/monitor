# Moni-D (Node + React)

Moni-D es una app de monitoreo independiente que revisa conectividad TCP de tus nodos, guarda historial en Postgres y envia alertas via SMTP. El dashboard es abierto (sin login) y esta pensado para operacion rapida.

## Stack
- Backend: Node.js + Fastify + TypeScript
- Frontend: React + Vite + TypeScript
- Base de datos: PostgreSQL

## Requisitos
- Node.js 18+
- PostgreSQL (local para dev, Linux server para prod)

## Inicio rapido (Windows dev)
1) Crea la base de datos (nota: comillas porque el nombre tiene guion):
```
CREATE DATABASE "moni-D";
```
2) Actualiza `C:\moni-D\server\.env` con tus credenciales SMTP y admin.
3) Instala dependencias:
```
cd C:\moni-D\server
npm install
cd ..\web
npm install
```
4) Ejecuta migraciones:
```
cd C:\moni-D\server
npm run migrate
```
5) Levanta backend:
```
npm run dev
```
6) Levanta frontend:
```
cd C:\moni-D\web
npm run dev
```

La web lee `VITE_API_URL` desde `C:\moni-D\web\.env`.

## Acceso admin
El dashboard es abierto. Administracion requiere login.

Variables requeridas en `C:\moni-D\server\.env`:
```
ADMIN_USER=tu_usuario
ADMIN_PASS=tu_password
AUTH_SECRET=cadena_larga_aleatoria
```

Roles opcionales:
```
OPERATOR_USER=ops_user
OPERATOR_PASS=ops_pass
VIEWER_USER=view_user
VIEWER_PASS=view_pass
```

## Comportamiento base
- Los nodos usan `checkIntervalSec` cuando estan OK y `retryIntervalSec` cuando caen.
- El historial se retiene segun `RETENTION_DAYS` (default 90 dias).
- Los incidentes abren en la primera falla y cierran al recuperar.

## Alertas
- Email usa credenciales SMTP.
- Canales extra (Webhook/Teams/Slack/SMS) se configuran en Admin > Alertas.
- Silencios (ventanas de mantenimiento) por nodo/area/grupo/tag/criticidad.
- Escalamiento envia alertas adicionales despues de un delay.

## Reporte semanal
Configura destinatarios en Admin > Reportes. El servidor envia el resumen semanal cuando:
```
REPORT_WEEKDAY=1   # 0=Sunday, 1=Monday, ...
REPORT_HOUR=8      # formato 24h
```
El correo semanal incluye adjuntos PDF + CSV (CSV tambien disponible via Admin > Incidentes export).

## Metricas por agente
Metricas opcionales del servidor pueden enviarse via:
```
POST /api/agent/metrics
X-Agent-Key: tu_key
```
Env:
```
AGENT_KEY=tu_key
```
Scripts disponibles en `C:\moni-D\agent` (ver `C:\moni-D\agent\README.md`).
Paso a paso para instalar agentes: `C:\moni-D\agent\README.md`.

## API (resumen)
- `GET /api/nodes`
- `POST /api/nodes` (admin)
- `PUT /api/nodes/:id` (admin)
- `PATCH /api/nodes/:id/enabled` (admin)
- `PATCH /api/nodes/:id/tls` (admin)
- `GET /api/nodes/:id/checks`
- `GET /api/incidents?days=90`
- `PATCH /api/incidents/:id/ack` (admin/operator)
- `POST /api/incidents/:id/notes` (admin/operator)
- `GET /api/incidents/export` (admin)
- `GET /api/alerts/channels` (admin)
- `GET /api/alerts/silences` (admin)
- `GET /api/alerts/escalations` (admin)
- `GET /api/reports/recipients` (admin)
- `GET /api/agent/latest` (admin)
- `GET /api/audit` (admin)

## Notas
- El dashboard es abierto (sin auth) segun lo solicitado.
- SMTP vive en `C:\moni-D\server\.env`.
- Para produccion: ejecuta el backend como servicio (systemd/PM2) y compila el frontend con `npm run build`.
