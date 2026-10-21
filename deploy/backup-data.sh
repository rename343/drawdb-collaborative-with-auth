#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this script with sudo so it can stop the container and preserve file ownership." >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/common.sh"
configure_deployment
BACKUP_DIR="${1:-/srv/drawdb/backups}"

data_dir="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "$APP_CONTAINER")"
if [[ -z "$data_dir" || ! -d "$data_dir" ]]; then
  echo "Could not find the drawDB /data bind mount." >&2
  exit 1
fi
data_dir="$(realpath "$data_dir")"
backup_real="$(realpath -m "$BACKUP_DIR")"
case "$backup_real/" in
  "$data_dir/"*)
    echo "The backup destination must be outside the drawDB data directory." >&2
    exit 1
    ;;
esac

umask 077
mkdir -p "$BACKUP_DIR"
archive="$BACKUP_DIR/drawdb-data-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz"
if [[ -e "$archive" ]]; then
  echo "Backup archive already exists: $archive" >&2
  exit 1
fi
was_running="$(docker inspect --format '{{.State.Running}}' "$APP_CONTAINER")"
stopped=0
restart_app() {
  local status=$?
  trap - EXIT
  if ((stopped)); then
    if ! docker start "$APP_CONTAINER" >/dev/null || ! wait_for_health 120; then
      echo "Warning: drawDB did not restart; start it manually." >&2
      status=1
    fi
  fi
  exit "$status"
}
trap restart_app EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ "$was_running" == true ]]; then
  stopped=1
  docker stop --timeout 30 "$APP_CONTAINER" >/dev/null
fi
tar --numeric-owner -czf "$archive" -C "$data_dir" .
chmod 600 "$archive"
echo "$archive"
