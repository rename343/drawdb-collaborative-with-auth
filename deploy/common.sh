#!/usr/bin/env bash

# Shared by the updater and backup so they cannot change the same container
# concurrently. Keep all configuration in Compose's env file; never source it.
configure_deployment() {
  APP_DIR="${DRAWDB_APP_DIR:-/opt/drawdb}"
  ENV_FILE="${DRAWDB_ENV_FILE:-/etc/drawdb/production.env}"
  APP_CONTAINER="${DRAWDB_CONTAINER:-drawdb-app}"
  RUN_DIR="${DRAWDB_RUN_DIR:-/run}"
  if [[ ! -r "$ENV_FILE" || ! -r "$APP_DIR/compose.production.yml" ]]; then
    echo "drawDB deployment files or environment file are missing." >&2
    return 1
  fi
  compose=(docker compose --project-directory "$APP_DIR" --env-file "$ENV_FILE" -f "$APP_DIR/compose.production.yml")
  exec 9>"$RUN_DIR/drawdb-deployment.lock"
  if ! flock -n 9; then
    echo "Another drawDB update or backup is in progress." >&2
    return 1
  fi
  docker info >/dev/null
}

wait_for_health() {
  local seconds="${1:-120}"
  local deadline=$((SECONDS + seconds))
  local state
  while ((SECONDS < deadline)); do
    state="$(docker inspect --format '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$APP_CONTAINER")" || return 1
    case "$state" in
      'true healthy') return 0 ;;
      'false '*|*' unhealthy'|*' missing') return 1 ;;
    esac
    sleep 2
  done
  echo "Timed out waiting for drawDB healthcheck." >&2
  return 1
}
