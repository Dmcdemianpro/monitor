# Moni-D Agent Scripts

Estos scripts envian metricas CPU/RAM/disco al backend Moni-D.

## Requisitos
- Backend con `AGENT_KEY` definido en `.env`.
- API accesible en `http://HOST:4000`.

## Obtener NodeId
- Desde UI: Administracion > Nodos.
- O via API: `GET http://HOST:4000/api/nodes`.

## Paso a paso (Linux, recomendado con systemd)
1) Descarga los archivos del agente:
```
sudo mkdir -p /opt/moni-d/agent
cd /opt/moni-d/agent
sudo curl -fsSL https://raw.githubusercontent.com/Dmcdemianpro/monitor/main/agent/linux-agent.sh -o linux-agent.sh
sudo curl -fsSL https://raw.githubusercontent.com/Dmcdemianpro/monitor/main/agent/install-linux-agent.sh -o install-linux-agent.sh
sudo curl -fsSL https://raw.githubusercontent.com/Dmcdemianpro/monitor/main/agent/agent.env.example -o agent.env.example
sudo curl -fsSL https://raw.githubusercontent.com/Dmcdemianpro/monitor/main/agent/moni-d-agent.service -o moni-d-agent.service
sudo chmod +x linux-agent.sh install-linux-agent.sh
```
2) Instala el servicio:
```
sudo ./install-linux-agent.sh
```
3) Edita el archivo de entorno:
```
sudo nano /etc/moni-d/agent.env
```
Ejemplo:
```
NODE_ID=5
API_URL=http://10.7.50.58:4000
AGENT_KEY=tu_clave_larga
INTERVAL_SEC=60
```
4) Reinicia y valida:
```
sudo systemctl restart moni-d-agent.service
sudo systemctl status --no-pager moni-d-agent.service
```
5) Verifica en la UI: Administracion > Agentes.

## Windows (PowerShell)
```
.\windows-agent.ps1 -NodeId 1 -ApiUrl http://10.7.50.58:4000 -AgentKey TU_KEY -IntervalSec 60
```
Ejecutar una sola vez:
```
.\windows-agent.ps1 -NodeId 1 -ApiUrl http://10.7.50.58:4000 -AgentKey TU_KEY -Once
```

Si hay bloqueo de scripts:
```
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Linux (bash)
```
./linux-agent.sh --node-id 1 --api-url http://10.7.50.58:4000 --agent-key TU_KEY --interval 60
```
Ejecutar una sola vez:
```
./linux-agent.sh --node-id 1 --api-url http://10.7.50.58:4000 --agent-key TU_KEY --once
```

## Linux (systemd)
1) Copia el script:
```
sudo mkdir -p /opt/moni-d/agent
sudo cp linux-agent.sh /opt/moni-d/agent/linux-agent.sh
sudo chmod +x /opt/moni-d/agent/linux-agent.sh
```
2) Crea el archivo de entorno:
```
sudo mkdir -p /etc/moni-d
sudo cp agent.env.example /etc/moni-d/agent.env
sudo nano /etc/moni-d/agent.env
```
3) Instala el servicio:
```
sudo cp moni-d-agent.service /etc/systemd/system/moni-d-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now moni-d-agent.service
sudo systemctl status --no-pager moni-d-agent.service
```

## Instalador rapido (opcional)
```
sudo ./install-linux-agent.sh
```

## Verificacion
- Backend: revisa que `AGENT_KEY` exista en `C:\moni-D\server\.env` y reinicia el backend.
- Conectividad: `curl http://HOST:4000/api/health` debe responder `{ "ok": true }`.
- Logs: `sudo journalctl -u moni-d-agent.service -f`.

## Notas
- Disco es el maximo uso (%) entre discos montados.
- Windows incluye top 5 procesos por CPU como detalle opcional.
- Umbrales CPU/RAM/Disco se configuran en backend por nodo (Administracion > Nodos).
