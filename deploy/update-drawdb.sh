#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/common.sh"
configure_deployment

# Query only the app service: config --images for the whole project has no
# guaranteed ordering and could select Caddy as the rollback image.
configured_image="$("${compose[@]}" config --images drawdb)"
previous_image_id=""
if docker inspect "$APP_CONTAINER" >/dev/null 2>&1; then
  previous_image_id="$(docker inspect --format '{{.Image}}' "$APP_CONTAINER")"
elif docker image inspect "$configured_image" >/dev/null 2>&1; then
  previous_image_id="$(docker image inspect --format '{{.Id}}' "$configured_image")"
fi

override_file=""
trap 'if [[ -n "$override_file" ]]; then rm -f -- "$override_file"; fi' EXIT

start_proxy() {
  # Reconciliation of dependencies here would undo an image rollback.
  timeout --signal=TERM --kill-after=10s 60s "${compose[@]}" up -d --no-deps caddy
}

start_previous_image() {
  if [[ -z "$previous_image_id" ]]; then
    echo "No previous local drawDB image is available for rollback." >&2
    return 1
  fi
  local rollback_tag="drawdb-local-rollback:previous"
  override_file="$(mktemp "$RUN_DIR/drawdb-rollback.XXXXXX.yml")"
  docker image tag "$previous_image_id" "$rollback_tag"
  cat >"$override_file" <<YAML
services:
  drawdb:
    image: $rollback_tag
YAML
  "${compose[@]}" -f "$override_file" up -d --no-deps --pull never drawdb
  wait_for_health 120 || {
    echo "Previous drawDB image did not become healthy. Inspect: docker logs $APP_CONTAINER" >&2
    return 1
  }
  start_proxy
  echo "Previous drawDB image restored and healthy." >&2
}

# Bound network waits so an offline registry cannot block boot indefinitely.
if ! timeout --signal=TERM --kill-after=10s 120s "${compose[@]}" pull drawdb; then
  echo "Could not pull drawDB; using the previous local version." >&2
  if docker inspect "$APP_CONTAINER" >/dev/null 2>&1; then
    if [[ "$(docker inspect --format '{{.State.Running}}' "$APP_CONTAINER")" != true ]]; then
      docker start "$APP_CONTAINER" >/dev/null
    fi
    wait_for_health 120
    start_proxy
    exit 0
  fi
  if [[ -n "$previous_image_id" ]]; then
    start_previous_image
    exit 0
  fi
  echo "First start cannot continue: no local drawDB image is available." >&2
  exit 1
fi

if "${compose[@]}" up -d --no-deps --pull never drawdb && wait_for_health 120; then
  start_proxy
  echo "drawDB is healthy."
  exit 0
fi

echo "New drawDB container failed; restoring the previous image." >&2
start_previous_image
# A successful rollback preserves availability, but the update still failed.
exit 1
