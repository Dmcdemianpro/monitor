# Moni-D (Node + React)

Moni-D is a standalone monitoring app that checks TCP connectivity for your nodes, stores history in Postgres, and sends alerts via SMTP. The dashboard is open (no login) and designed for fast operations.

## Stack
- Backend: Node.js + Fastify + TypeScript
- Frontend: React + Vite + TypeScript
- Database: PostgreSQL

## Prerequisites
- Node.js 18+
- PostgreSQL (local for dev, Linux server for prod)

## Quick start (Windows dev)
1) Create the database (note the quotes because the name has a dash):
```
CREATE DATABASE "moni-D";
```
2) Update `C:\moni-D\server\.env` with your SMTP + admin credentials.
3) Install dependencies:
```
cd C:\moni-D\server
npm install
cd ..\web
npm install
```
4) Run migrations:
```
cd C:\moni-D\server
npm run migrate
```
5) Start backend:
```
npm run dev
```
6) Start frontend:
```
cd C:\moni-D\web
npm run dev
```

The frontend reads `VITE_API_URL` from `C:\moni-D\web\.env`.

## Admin access
The dashboard is open. Administration requires login.

Required env vars in `C:\moni-D\server\.env`:
```
ADMIN_USER=your_user
ADMIN_PASS=your_pass
AUTH_SECRET=long_random_string
```

Optional roles:
```
OPERATOR_USER=ops_user
OPERATOR_PASS=ops_pass
VIEWER_USER=view_user
VIEWER_PASS=view_pass
```

## Core behavior
- Nodes check on `checkIntervalSec` while healthy and `retryIntervalSec` while down.
- History is retained for `RETENTION_DAYS` (default 90 days).
- Incidents open on first failure and close on recovery.

## Alerting
- Email alerts use SMTP credentials.
- Extra channels (Webhook/Teams/Slack/SMS) are configured from Admin > Alertas.
- Silences (maintenance windows) can be scoped by node/area/group/tag/criticality.
- Escalation policies send additional alerts after a delay.

## Weekly report
Configure recipients in Admin > Reportes. The server sends a weekly summary when:
```
REPORT_WEEKDAY=1   # 0=Sunday, 1=Monday, ...
REPORT_HOUR=8      # 24h format
```
The weekly email includes PDF + CSV attachments (CSV also available via Admin > Incidentes export).

## Agent metrics
Optional server metrics can be pushed via:
```
POST /api/agent/metrics
X-Agent-Key: your_key
```
Env:
```
AGENT_KEY=your_key
```
Scripts are available in `C:\moni-D\agent` (see `C:\moni-D\agent\README.md`).

## API (summary)
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

## Notes
- Dashboard is open (no auth) as requested.
- SMTP settings live in `C:\moni-D\server\.env`.
- For production, run the backend as a service (systemd/PM2) and build the web app with `npm run build`.
