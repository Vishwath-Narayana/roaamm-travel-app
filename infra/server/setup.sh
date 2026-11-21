#!/usr/bin/env bash
# One-time setup on a fresh Debian or Ubuntu LTS e2-micro. Review before running.
set -euo pipefail

sudo apt-get update
sudo apt-get install -y ca-certificates curl unattended-upgrades
curl -fsSL https://get.docker.com | sudo sh
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

sudo mkdir -p /opt/roaamm /etc/roaamm
sudo chmod 700 /etc/roaamm
sudo touch /etc/roaamm/core.env
sudo chmod 600 /etc/roaamm/core.env

echo "Next: copy docker-compose.yml and deploy.sh to /opt/roaamm,"
echo "put TUNNEL_TOKEN in /opt/roaamm/.env and app secrets in /etc/roaamm/core.env."
