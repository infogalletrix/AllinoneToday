#!/usr/bin/env bash
set -euo pipefail
cd /opt/allinonetoday
test -f incoming.tar.gz
test "$(docker exec allinonetoday-db-1 psql -U allinonetoday -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='allinonetoday_verify'")" = 0
test -z "$(docker ps -aq --filter name='^allinonetoday-verify$')"
mkdir -p verification
tar -xzf incoming.tar.gz -C verification
docker build -t allinonetoday-verify:local verification/apps/platform_api
docker exec allinonetoday-db-1 createdb -U allinonetoday allinonetoday_verify
cleanup() {
  docker rm -f allinonetoday-verify >/dev/null 2>&1 || true
  docker exec allinonetoday-db-1 dropdb -U allinonetoday allinonetoday_verify
}
trap cleanup EXIT
set -a
source deployment/.env
set +a
setup_hash=$(printf '%s' 'staging-only-owner-setup-012345678901234567890123456789' | sha256sum | cut -d' ' -f1)
DATABASE_URL="postgres://allinonetoday:${DB_PASSWORD}@db:5432/allinonetoday_verify" \
OWNER_EMAIL='verify-owner@example.invalid' OWNER_SETUP_TOKEN_HASH="$setup_hash" \
docker run -d --name allinonetoday-verify --network allinonetoday_default \
  -p 127.0.0.1:5089:8080 -e DATABASE_URL -e OWNER_EMAIL -e OWNER_SETUP_TOKEN_HASH \
  -e PUBLIC_URL=http://127.0.0.1:5089 allinonetoday-verify:local >/dev/null
unset DB_PASSWORD RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET OPENAI_API_KEY
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:5089/api/health >/dev/null; then break; fi
  sleep 1
done
SMOKE_URL=http://127.0.0.1:5089 node verification/tools/owner-smoke.mjs
