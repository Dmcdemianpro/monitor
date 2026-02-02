# Moni-D Agent Scripts

Estos scripts envian metricas CPU/RAM/disco al backend Moni-D.

## Requisitos
- Backend con `AGENT_KEY` definido en `.env`.
- API accesible en `http://HOST:4000`.

## Obtener NodeId
- Desde UI: Administracion > Nodos.
- O via API: `GET http://HOST:4000/api/nodes`.

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

## Notas
- Disco es el maximo uso (%) entre discos montados.
- Windows incluye top 5 procesos por CPU como detalle opcional.
