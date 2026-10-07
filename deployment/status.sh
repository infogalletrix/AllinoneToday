#!/usr/bin/env bash
set -euo pipefail
docker ps --filter label=com.docker.compose.project=allinonetoday --format '{{.Names}}'
docker exec allinonetoday-db-1 psql -U allinonetoday -d allinonetoday -Atc "SELECT count(*) FROM accounts WHERE role='admin'"
