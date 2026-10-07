#!/usr/bin/env bash
set -euo pipefail
umask 022
cd /opt/allinonetoday
test -f incoming.tar.gz
umask 077
mkdir -p backups
docker exec allinonetoday-db-1 pg_dump -U allinonetoday -d allinonetoday | gzip > "backups/before-release-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
umask 022
mkdir -p releases
release="releases/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$release"
tar -xzf incoming.tar.gz -C "$release"
mkdir -p apps deployment web
cp -a "$release/apps/platform_api" apps/
cp -a "$release/apps/web_app/dist/." web/
cp "$release/deployment/compose.yml" deployment/
if [ ! -f deployment/pricing.json ]; then cp "$release/deployment/pricing.example.json" deployment/pricing.json; fi
# This release uses the user-confirmed INR499/month small-shop policy. Larger
# capacities require an individually approved quote, not guessed category fees.
node --input-type=module -e 'import {readFileSync,writeFileSync} from "node:fs";const p=JSON.parse(readFileSync("deployment/pricing.json","utf8"));if(!p.approved){writeFileSync("deployment/pricing.json",readFileSync(process.argv[1]));}' "$release/deployment/pricing.example.json"
if [ ! -f deployment/.env ]; then
    umask 077
    db_secret="$(openssl rand -hex 32)"
    printf 'DB_PASSWORD=%s\n' "$db_secret" > deployment/.env
    unset db_secret
fi
chmod 600 deployment/.env
# Archives created on Windows can retain permissive modes. Web content and
# application source must not be writable by unrelated server users.
find web apps/platform_api -type d -exec chmod 755 {} +
find web apps/platform_api -type f -exec chmod 644 {} +
chmod 644 deployment/compose.yml deployment/pricing.json
docker compose -p allinonetoday -f deployment/compose.yml --env-file deployment/.env up -d --build
for attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:5088/api/health >/dev/null; then break; fi
    sleep 2
done
curl -fsS http://127.0.0.1:5088/api/health
if [ ! -f /etc/nginx/sites-available/allinonetoday ]; then
    cp "$release/deployment/nginx-http.conf" /etc/nginx/sites-available/allinonetoday
    ln -s /etc/nginx/sites-available/allinonetoday /etc/nginx/sites-enabled/allinonetoday
fi
nginx -t
systemctl reload nginx
echo 'All in One Today release deployed. Existing applications were not modified.'
