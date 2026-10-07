#!/usr/bin/env bash
set -euo pipefail
cd /opt/allinonetoday
test -f payment-test/apps/platform_api/src/billing-config.js
test -f payment-test/deployment/compose.yml
test -f deployment/.env
umask 077
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker exec allinonetoday-db-1 pg_dump -U allinonetoday -d allinonetoday | gzip > "backups/before-billing-guard-$stamp.sql.gz"
tar -czf "backups/before-billing-guard-$stamp.tar.gz" apps/platform_api deployment/compose.yml
umask 022
cp -a payment-test/apps/platform_api apps/
cp payment-test/deployment/compose.yml deployment/
find apps/platform_api -type d -exec chmod 755 {} +
find apps/platform_api -type f -exec chmod 644 {} +
chmod 644 deployment/compose.yml
docker compose -p allinonetoday -f deployment/compose.yml --env-file deployment/.env up -d --build api
for attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:5088/api/health >/dev/null; then break; fi
    sleep 2
done
node --input-type=module -e 'const r=await fetch("http://127.0.0.1:5088/api/health");const v=await r.json();if(!r.ok||v.data.paymentEnvironment!=="live"||v.data.billingEnabled)throw Error("Public billing environment verification failed");console.log("Public API verified: Live environment only; billing remains disabled until Live credentials are provided.");'
