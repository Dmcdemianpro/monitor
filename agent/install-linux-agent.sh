#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)."
  exit 1
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -d /opt/moni-d/agent /etc/moni-d
install -m 755 "$SRC_DIR/linux-agent.sh" /opt/moni-d/agent/linux-agent.sh
install -m 644 "$SRC_DIR/moni-d-agent.service" /etc/systemd/system/moni-d-agent.service

if [[ ! -f /etc/moni-d/agent.env ]]; then
  install -m 600 "$SRC_DIR/agent.env.example" /etc/moni-d/agent.env
  echo "Created /etc/moni-d/agent.env (edit values)."
fi

systemctl daemon-reload
systemctl enable --now moni-d-agent.service
systemctl status --no-pager moni-d-agent.service
