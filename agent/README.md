# Moni-D Agent Scripts

These scripts push CPU/RAM/disk metrics to the Moni-D backend.

## Prerequisites
- Backend has `AGENT_KEY` set in `C:\moni-D\server\.env`.
- Backend is reachable at `http://HOST:4000`.

## Node ID
You need the `nodeId` for each server:
```
GET http://HOST:4000/api/nodes
```
Use the `id` field from the response.

## Windows (PowerShell)
```
.\windows-agent.ps1 -NodeId 1 -ApiUrl http://10.7.50.58:4000 -AgentKey YOUR_KEY -IntervalSec 60
```
Run once:
```
.\windows-agent.ps1 -NodeId 1 -ApiUrl http://10.7.50.58:4000 -AgentKey YOUR_KEY -Once
```

If scripts are blocked:
```
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Linux (bash)
```
./linux-agent.sh --node-id 1 --api-url http://10.7.50.58:4000 --agent-key YOUR_KEY --interval 60
```
Run once:
```
./linux-agent.sh --node-id 1 --api-url http://10.7.50.58:4000 --agent-key YOUR_KEY --once
```

## Notes
- Disk usage is the worst (max) percent across mounted disks.
- Windows script sends top 5 processes by CPU as optional detail.
