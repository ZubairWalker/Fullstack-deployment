#!/usr/bin/env bash
set -euo pipefail

printf '\n== Docker services ==\n'
docker compose ps

printf '\n== Frontend health ==\n'
curl -fsS http://localhost/health || true

printf '\n== Backend health ==\n'
curl -fsS http://localhost:3000/health || true

printf '\n== Nginx status ==\n'
curl -fsS http://localhost/nginx-status || true
