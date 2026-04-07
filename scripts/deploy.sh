#!/bin/bash
set -e
cd /home/bacon/jinsei
git pull origin main
cd web && bun run build
sudo systemctl restart jinsei
