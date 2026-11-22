#!/usr/bin/env bash
# Runs the core image next to a throwaway Postgres and checks /health, /ready
# and a demo login. Used by CI; works locally with Docker too:
#   scripts/ci/core-native-smoke.sh roaamm-core:ci
set -euo pipefail

IMAGE="${1:?usage: $0 <image>}"
NET="roaamm-smoke-$$"
# Throwaway local credentials for a container that lives for this script only.
PGPASS="smoke-$RANDOM-$RANDOM"
WEB="https://roaamm.plinthwell.com"

cleanup() {
  docker logs core-smoke 2>&1 | tail -n 40 || true
  docker rm -f core-smoke pg-smoke > /dev/null 2>&1 || true
  docker network rm "$NET" > /dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$NET" > /dev/null
docker run -d --name pg-smoke --network "$NET" \
  -e POSTGRES_PASSWORD="$PGPASS" -e POSTGRES_DB=roaamm postgres:17-alpine > /dev/null
for _ in $(seq 1 30); do
  if docker exec pg-smoke pg_isready -U postgres -d roaamm > /dev/null 2>&1; then break; fi
  sleep 1
done

start=$(date +%s%N)
docker run -d --name core-smoke --network "$NET" -p 9090:9090 -e PORT=9090 \
  -e DATABASE_URL="postgresql://postgres:${PGPASS}@pg-smoke:5432/roaamm?sslmode=disable" \
  "$IMAGE" > /dev/null

for _ in $(seq 1 60); do
  if health=$(curl -fsS http://localhost:9090/health 2> /dev/null); then break; fi
  sleep 0.5
done
echo "startup to first /health (incl. Flyway): $((($(date +%s%N) - start) / 1000000)) ms"
test "$health" = '{"status":"ok"}'

ready=$(curl -fsS http://localhost:9090/ready)
test "$ready" = '{"status":"ok"}'

headers=$(mktemp)
body=$(curl -fsS -D "$headers" -X POST http://localhost:9090/v1/demo/session \
  -H "Origin: $WEB" -H "X-Roaamm-Csrf: 1" -H "Content-Type: application/json" \
  -d '{"role":"guide"}')
test "$body" = '{"role":"guide","displayName":"Demo guide","isDemo":true}'
token=$(tr -d '\r' < "$headers" | sed -n 's/^set-cookie: __Host-roaamm_session=\([^;]*\).*/\1/ip')
rm -f "$headers"
test -n "$token"
me=$(curl -fsS http://localhost:9090/v1/me -H "Cookie: __Host-roaamm_session=$token")
test "$me" = '{"role":"guide","displayName":"Demo guide","isDemo":true}'

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:9090/v1/demo/session \
  -H "Content-Type: application/json" -d '{"role":"guide"}')
test "$code" = 403

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:9090/v1/demo/session \
  -H "Origin: $WEB" -H "X-Roaamm-Csrf: 1" -H "Content-Type: application/json" -d '{"role":"root"}')
test "$code" = 400

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:9090/v1/logout \
  -H "Origin: $WEB" -H "X-Roaamm-Csrf: 1" -H "Cookie: __Host-roaamm_session=$token")
test "$code" = 204
code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:9090/v1/me -H "Cookie: __Host-roaamm_session=$token")
test "$code" = 401

echo "native smoke ok: /health, /ready, demo session, /v1/me, bad role, CSRF, logout"
