#!/usr/bin/env bash
set -euo pipefail

NODE_ID="${NODE_ID:-}"
API_URL="${API_URL:-http://localhost:4000}"
AGENT_KEY="${AGENT_KEY:-}"
INTERVAL_SEC="${INTERVAL_SEC:-60}"
ONCE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --node-id)
      NODE_ID="$2"
      shift 2
      ;;
    --api-url)
      API_URL="$2"
      shift 2
      ;;
    --agent-key)
      AGENT_KEY="$2"
      shift 2
      ;;
    --interval)
      INTERVAL_SEC="$2"
      shift 2
      ;;
    --once)
      ONCE="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$NODE_ID" ]]; then
  echo "Missing --node-id"
  exit 1
fi

if [[ -z "$AGENT_KEY" ]]; then
  echo "Missing --agent-key (or AGENT_KEY env var)"
  exit 1
fi

read_cpu() {
  awk '/^cpu /{print $2,$3,$4,$5,$6,$7,$8}' /proc/stat
}

calc_cpu() {
  local cpu1 cpu2 idle1 idle2 total1 total2 total_delta idle_delta
  cpu1=($(read_cpu))
  sleep 1
  cpu2=($(read_cpu))
  idle1=$((cpu1[3] + cpu1[4]))
  idle2=$((cpu2[3] + cpu2[4]))
  total1=0
  total2=0
  for v in "${cpu1[@]}"; do total1=$((total1 + v)); done
  for v in "${cpu2[@]}"; do total2=$((total2 + v)); done
  total_delta=$((total2 - total1))
  idle_delta=$((idle2 - idle1))
  if [[ $total_delta -le 0 ]]; then
    echo "null"
  else
    awk -v i="$idle_delta" -v t="$total_delta" 'BEGIN {printf "%.2f", (1 - i / t) * 100}'
  fi
}

calc_mem() {
  local total available
  total=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
  available=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
  if [[ -z "$total" || "$total" -le 0 ]]; then
    echo "null"
  else
    awk -v t="$total" -v a="$available" 'BEGIN {printf "%.2f", ((t - a) / t) * 100}'
  fi
}

calc_disk() {
  df -P -x tmpfs -x devtmpfs | awk 'NR>1 {gsub(/%/,"",$5); if ($5 > max) max = $5} END {if (max=="") print "null"; else print max}'
}

calc_load() {
  awk '{print $1}' /proc/loadavg
}

send_metrics() {
  local cpu mem disk load payload
  cpu=$(calc_cpu)
  mem=$(calc_mem)
  disk=$(calc_disk)
  load=$(calc_load)

  payload=$(cat <<EOF
{"nodeId":$NODE_ID,"cpuPct":$cpu,"memPct":$mem,"diskPct":$disk,"loadAvg":$load,"processes":[]}
EOF
)

  if ! curl -sS -X POST "$API_URL/api/agent/metrics" \
    -H "Content-Type: application/json" \
    -H "X-Agent-Key: $AGENT_KEY" \
    -d "$payload" >/dev/null; then
    echo "$(date -Is) failed to send metrics"
  else
    echo "$(date -Is) sent metrics for node $NODE_ID"
  fi
}

while true; do
  send_metrics
  if [[ "$ONCE" == "true" ]]; then
    break
  fi
  sleep "$INTERVAL_SEC"
done
