#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
temporary_root="$(mktemp -d /tmp/drawdb-update-tests.XXXXXX)"
trap 'rm -rf "$temporary_root"' EXIT

cat >"$temporary_root/docker" <<'DOCKER_STUB'
#!/usr/bin/env bash
set -Eeuo pipefail

state="$DOCKER_MOCK_STATE"
printf '%s\n' "$*" >>"$state/calls"
if [[ "$1" == info ]]; then exit 0; fi
if [[ "$1" == start ]]; then
  printf '%s\n' true >"$state/running"
  exit 0
fi
if [[ "$1" == image ]]; then
  shift
  case "$1" in
    inspect)
      if [[ "${MOCK_LOCAL_IMAGE:-0}" == 1 ]]; then
        echo sha256:old
        exit 0
      fi
      exit 1
      ;;
    tag)
      [[ "$2" == sha256:old ]]
      exit 0
      ;;
  esac
fi

if [[ "$1" == inspect ]]; then
  shift
  if [[ ! -f "$state/container" ]]; then exit 1; fi
  if [[ "$1" != --format ]]; then exit 0; fi
  format="$2"
  case "$format" in
    "{{.Image}}") cat "$state/image" ;;
    "{{.State.Running}}") cat "$state/running" ;;
    "{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}")
      printf '%s %s\n' "$(cat "$state/running")" "$(cat "$state/health")"
      ;;
    *) exit 2 ;;
  esac
  exit 0
fi

if [[ "$1" != compose ]]; then exit 2; fi
shift
override=""
while (($#)); do
  case "$1" in
    --project-directory|--env-file) shift 2 ;;
    -f)
      if [[ -f "$2" ]] && grep -q 'drawdb-local-rollback' "$2"; then override="$2"; fi
      shift 2
      ;;
    *) break ;;
  esac
done
command="$1"
shift
case "$command" in
  config)
    # A whole-project query deliberately lists Caddy first.
    if [[ " $* " == *" drawdb "* ]]; then
      echo ghcr.io/example/drawdb:production
    else
      printf '%s\n' caddy:2-alpine ghcr.io/example/drawdb:production
    fi
    ;;
  pull)
    if [[ "${MOCK_PULL_FAIL:-0}" == 1 ]]; then
      echo "mock registry unavailable" >&2
      exit 1
    fi
    ;;
  up)
    if [[ " $* " == *" drawdb "* && " $* " != *" --pull never "* ]]; then
      echo "App start must use the pulled local image." >&2
      exit 2
    fi
    if [[ -n "$override" ]]; then
      printf '%s\n' present >"$state/container"
      printf '%s\n' sha256:old >"$state/image"
      printf '%s\n' true >"$state/running"
      printf '%s\n' healthy >"$state/health"
    elif [[ " $* " == *" drawdb "* || (" $* " == *" caddy "* && " $* " != *" --no-deps "*) ]]; then
      printf '%s\n' present >"$state/container"
      printf '%s\n' sha256:new >"$state/image"
      printf '%s\n' true >"$state/running"
      printf '%s\n' "${MOCK_NEW_HEALTH:-healthy}" >"$state/health"
    fi
    ;;
  start)
    printf '%s\n' true >"$state/running"
    ;;
  *) exit 2 ;;
esac
DOCKER_STUB
chmod 0755 "$temporary_root/docker"

new_case() {
  local name="$1"
  CASE_DIR="$temporary_root/$name"
  mkdir -p "$CASE_DIR/app" "$CASE_DIR/state" "$CASE_DIR/run" "$CASE_DIR/bin"
  : >"$CASE_DIR/app/compose.production.yml"
  : >"$CASE_DIR/production.env"
  ln -s "$temporary_root/docker" "$CASE_DIR/bin/docker"
}

run_update() {
  set +e
  PATH="$CASE_DIR/bin:$PATH" \
    DOCKER_MOCK_STATE="$CASE_DIR/state" \
    DRAWDB_APP_DIR="$CASE_DIR/app" \
    DRAWDB_ENV_FILE="$CASE_DIR/production.env" \
    DRAWDB_RUN_DIR="$CASE_DIR/run" \
    MOCK_PULL_FAIL="${MOCK_PULL_FAIL:-0}" \
    MOCK_LOCAL_IMAGE="${MOCK_LOCAL_IMAGE:-0}" \
    MOCK_NEW_HEALTH="${MOCK_NEW_HEALTH:-healthy}" \
    "$script_dir/update-drawdb.sh" >"$CASE_DIR/output" 2>&1
  UPDATE_STATUS=$?
  set -e
}

seed_old_container() {
  printf '%s\n' present >"$CASE_DIR/state/container"
  printf '%s\n' sha256:old >"$CASE_DIR/state/image"
  printf '%s\n' true >"$CASE_DIR/state/running"
  printf '%s\n' healthy >"$CASE_DIR/state/health"
}

new_case pull-success
seed_old_container
run_update
[[ "$UPDATE_STATUS" -eq 0 && "$(cat "$CASE_DIR/state/image")" == sha256:new ]]

new_case registry-unavailable
seed_old_container
MOCK_PULL_FAIL=1 run_update
[[ "$UPDATE_STATUS" -eq 0 && "$(cat "$CASE_DIR/state/image")" == sha256:old ]]

new_case registry-unavailable-stopped-container
seed_old_container
printf '%s\n' false >"$CASE_DIR/state/running"
MOCK_PULL_FAIL=1 run_update
[[ "$UPDATE_STATUS" -eq 0 && "$(cat "$CASE_DIR/state/image")" == sha256:old ]]
[[ "$(cat "$CASE_DIR/state/running")" == true ]]

new_case first-start-no-image
MOCK_PULL_FAIL=1 run_update
[[ "$UPDATE_STATUS" -eq 1 ]]
grep -q "First start cannot continue" "$CASE_DIR/output"

new_case registry-unavailable-local-image
MOCK_PULL_FAIL=1 MOCK_LOCAL_IMAGE=1 run_update
[[ "$UPDATE_STATUS" -eq 0 && "$(cat "$CASE_DIR/state/image")" == sha256:old ]]

new_case healthcheck-rollback
seed_old_container
MOCK_NEW_HEALTH=unhealthy run_update
[[ "$UPDATE_STATUS" -eq 1 ]]
[[ "$(cat "$CASE_DIR/state/image")" == sha256:old ]]
[[ "$(cat "$CASE_DIR/state/health")" == healthy ]]

new_case running-unhealthy-offline
seed_old_container
printf '%s\n' unhealthy >"$CASE_DIR/state/health"
MOCK_PULL_FAIL=1 run_update
[[ "$UPDATE_STATUS" -ne 0 ]]

new_case concurrent-update
seed_old_container
(
  flock -x 8
  run_update
  [[ "$UPDATE_STATUS" -ne 0 ]]
  grep -q "Another drawDB update or backup" "$CASE_DIR/output"
) 8>"$CASE_DIR/run/drawdb-deployment.lock"

echo "Updater scenarios passed: pull, offline recovery, rollback, failed health, locking."
