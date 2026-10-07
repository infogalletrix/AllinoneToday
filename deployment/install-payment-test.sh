#!/usr/bin/env bash
set -euo pipefail
umask 022
cd /opt/allinonetoday
test -f incoming-payment-test.tar.gz
mkdir -p payment-test
tar -xzf incoming-payment-test.tar.gz -C payment-test
test -f payment-test/deployment/.env
cp payment-test/deployment/pricing.example.json payment-test/deployment/pricing.json
find payment-test/apps/platform_api -type d -exec chmod 755 {} +
find payment-test/apps/platform_api -type f -exec chmod 644 {} +
chmod 644 payment-test/deployment/payment-test.compose.yml payment-test/deployment/pricing.json
chmod 600 payment-test/deployment/.env
docker compose -p allinonetoday-payment-test -f payment-test/deployment/payment-test.compose.yml --env-file payment-test/deployment/.env up -d --build
for attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:5090/api/health >/dev/null; then break; fi
    sleep 2
done
curl -fsS http://127.0.0.1:5090/api/health
cp payment-test/deployment/nginx-payment-test.conf /etc/nginx/snippets/allinonetoday-payment-test.conf
chmod 644 /etc/nginx/snippets/allinonetoday-payment-test.conf
node --input-type=module -e 'import{readFileSync,writeFileSync,copyFileSync,chmodSync}from"node:fs";const path="/etc/nginx/sites-available/allinonetoday";const original=readFileSync(path,"utf8");const directive="include /etc/nginx/snippets/allinonetoday-payment-test.conf;";if(!original.includes(directive)){const marker="    location /api/ {";if(original.split(marker).length!==2)throw Error("Unexpected marketplace nginx configuration; refusing to edit");const backup=path+".before-payment-test-"+Date.now();copyFileSync(path,backup);chmodSync(backup,384);writeFileSync(path,original.replace(marker,"    "+directive+"\n"+marker),{mode:420});}'
nginx -t
systemctl reload nginx
curl -fsS --resolve allinonetoday.galletrix.com:443:127.0.0.1 https://allinonetoday.galletrix.com/payment-test/api/health
echo 'Isolated Android payment test API deployed. No public marketplace data or credentials were changed.'
