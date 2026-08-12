# Despliegue en Linux (systemd)

Guia para llevar Moni-D de la PC de desarrollo a un servidor Linux.

El codigo no tiene rutas ni dependencias especificas de Windows, asi que porta
sin cambios. Lo que cambia es el entorno: base de datos, `.env`, supervision y
como se sirve el frontend.

En Linux **no hace falta PM2**: systemd ya viene con el sistema y cubre lo
mismo (reinicio automatico, arranque al boot, logs centralizados). Queda un
`server/ecosystem.config.js` por si algun dia se usa PM2, pero para un servidor
Linux la via recomendada es la de este documento.

---

## 1. Requisitos

```bash
node --version     # 20 o superior (en desarrollo se uso 22)
psql --version     # PostgreSQL 14+
```

---

## 2. Base de datos

El nombre `moni-D` lleva mayuscula y guion, asi que **siempre va entre
comillas**. Sin ellas Postgres lo pasa a minusculas y falla con "database does
not exist", que es un error confuso porque la base si existe.

En la PC de origen:

```bash
pg_dump -h localhost -U postgres -d "moni-D" -Fc -f moni-d.dump
```

En el servidor:

```bash
sudo -u postgres createdb "moni-D"
sudo -u postgres pg_restore -d "moni-D" moni-d.dump
```

Si se parte de cero en vez de migrar, basta con `npm run migrate`.

Verificar que llegaron los datos:

```bash
sudo -u postgres psql -d "moni-D" -c "select count(*) from checks;"
```

---

## 3. Codigo y compilacion

```bash
sudo mkdir -p /opt/moni-d
sudo chown $USER:$USER /opt/moni-d
git clone <repo> /opt/moni-d
cd /opt/moni-d

# Backend: compila TypeScript a dist/
cd server && npm ci && npm run build

# Frontend: genera web/dist/ para servir con nginx
cd ../web && npm ci && npm run build
```

---

## 4. Configuracion (`.env`)

`server/.env` esta en `.gitignore` a proposito: contiene SMTP, contrasenias y
`AUTH_SECRET`, y **no viaja con el repo**. Hay que recrearlo en el servidor
partiendo de `server/.env.example`.

```bash
cd /opt/moni-d/server
cp .env.example .env
chmod 600 .env          # solo el dueno puede leerlo
$EDITOR .env
```

Valores a ajustar respecto a desarrollo:

| Variable | En el servidor |
|---|---|
| `NODE_ENV` | `production` |
| `PGHOST` / `PGPASSWORD` | credenciales del Postgres del servidor |
| `CORS_ORIGIN` | la URL real del frontend, **no** `*` |
| `AUTH_SECRET` | cadena larga y nueva, distinta a la de desarrollo |
| `SMTP_*` | las mismas credenciales, si el servidor tiene salida SMTP |

> **Trampa importante:** la unit de systemd de mas abajo **no** usa
> `EnvironmentFile`. La app ya carga `.env` por su cuenta con
> `dotenv.config({ override: true })`, y ese `override: true` hace que `.env`
> le gane a cualquier variable que systemd inyecte. Usar las dos vias produce
> el resultado desconcertante de cambiar una variable en la unit y que el
> proceso siga tomando la del `.env`. Se configura en un solo lugar: `.env`.

---

## 5. Usuario del servicio

No conviene correrlo como root:

```bash
sudo useradd --system --home /opt/moni-d --shell /usr/sbin/nologin monid
sudo chown -R monid:monid /opt/moni-d
```

---

## 6. Unit de systemd

`/etc/systemd/system/moni-d.service`:

```ini
[Unit]
Description=Moni-D monitoring backend
Documentation=https://github.com/Dmcdemianpro/monitor
After=network-online.target postgresql.service
Wants=network-online.target

# Si falla 10 veces en 5 minutos, systemd deja de intentar. Sin esto, una
# causa persistente (base caida, .env mal escrito) produce un bucle de
# reinicios que llena el disco de logs sin arreglar nada.
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
User=monid
Group=monid
WorkingDirectory=/opt/moni-d/server
ExecStart=/usr/bin/node dist/index.js

# El watchdog de la app termina el proceso cuando el monitoreo deja de
# avanzar; esto es lo que lo vuelve a levantar. Sin Restart, salir de un
# cuelgue seria simplemente quedarse muerto.
Restart=always
RestartSec=5

StandardOutput=journal
StandardError=journal
SyslogIdentifier=moni-d

# Endurecimiento basico
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

Activar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now moni-d
sudo systemctl status moni-d
```

Operacion diaria:

```bash
journalctl -u moni-d -f          # logs en vivo
journalctl -u moni-d -p err      # solo errores (incluye avisos del watchdog)
sudo systemctl restart moni-d
```

---

## 7. Frontend con nginx

`/etc/nginx/sites-available/moni-d`:

```nginx
server {
    listen 80;
    server_name monitor.tu-dominio.cl;

    root /opt/moni-d/web/dist;
    index index.html;

    # La app usa rutas (/monitor, /admin) resueltas en el cliente: si no se
    # cae de vuelta a index.html, recargar en cualquiera de ellas da 404.
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/moni-d /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Sirviendo la API detras del mismo dominio bajo `/api/`, el frontend la alcanza
sin configuracion extra y `CORS_ORIGIN` deja de ser un problema. Si en cambio
se expone el backend en otro host o puerto, hay que fijar `VITE_API_URL` en
`web/.env` **antes** de `npm run build` (Vite incrusta el valor en el bundle;
cambiarlo despues no tiene efecto hasta recompilar).

---

## 8. Verificacion

```bash
curl -s localhost:4000/api/health | jq
```

Sano:

```json
{ "ok": true, "db": "ok", "monitoring": "ok",
  "ageSec": 262, "staleAfterSec": 900, "enabledNodes": 21 }
```

`monitoring` puede ser:

| Valor | HTTP | Significa |
|---|---|---|
| `ok` | 200 | Los checks avanzan al ritmo esperado |
| `stale` | 503 | El proceso vive pero el monitoreo se detuvo |

El 503 permite engancharlo a cualquier chequeo externo sin parsear el cuerpo.
Umbral: `max(HEALTH_STALE_MIN_SEC, intervalo_mayor * HEALTH_STALE_FACTOR)`, hoy
900 s. Se puede forzar con `HEALTH_STALE_AFTER_SEC`.

---

## 9. Pendientes conocidos

- **Indice sobre `checked_at`.** Las agregaciones de `store.ts` que filtran
  solo por fecha hacen seq scan (medido: 254 ms sobre 371k filas), porque el
  unico indice es `(node_id, checked_at)` y `node_id` va primero. Conviene
  medir con `EXPLAIN ANALYZE` antes de crearlo; no esta confirmado que sea el
  cuello de botella real.
- **`loadData` del dashboard lanza 7 requests en paralelo cada 10 s** contra un
  pool de 10 conexiones. Con varios navegadores abiertos satura el pool y las
  respuestas se encolan. Si se nota lento, las palancas son subir `max` en
  `db.ts`, espaciar el intervalo o cachear las agregaciones.
- **`engines` sin declarar** en `server/package.json`. Fijar la version de Node
  evita sorpresas si el servidor trae una distinta.
