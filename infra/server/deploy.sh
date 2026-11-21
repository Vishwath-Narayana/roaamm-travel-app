#!/usr/bin/env bash
# Usage: deploy.sh <image-tag>. Pulls the tag, restarts, health-checks, rolls back on failure.
set -euo pipefail

cd /opt/roaamm
NEW_TAG="${1:?image tag required}"
PREV_TAG="$(cat .current_tag 2>/dev/null || echo latest)"

export IMAGE_TAG="$NEW_TAG"
docker compose pull core
docker compose up -d

for _ in $(seq 1 12); do
  if [ "$(docker inspect --format '{{.State.Health.Status}}' roaamm-core-1 2>/dev/null)" = "healthy" ]; then
    echo "$NEW_TAG" > .current_tag
    echo "deployed $NEW_TAG"
    exit 0
  fi
  sleep 5
done

echo "health check failed, rolling back to $PREV_TAG" >&2
export IMAGE_TAG="$PREV_TAG"
docker compose up -d
exit 1
