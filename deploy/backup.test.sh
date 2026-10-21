#!/usr/bin/env bash
# Run as root with Node, better-sqlite3, and Python 3.12+ available. Docker
# control is stubbed; archives, ownership, extraction, and SQLite are real.
set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this integration test as root in a disposable container." >&2
  exit 1
fi
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
fixture="$(mktemp -d /tmp/drawdb-backup-tests.XXXXXX)"
trap 'rm -rf -- "$fixture"' EXIT
mkdir -p "$fixture/bin" "$fixture/app" "$fixture/data/git" "$fixture/backups" "$fixture/run"
: >"$fixture/app/compose.production.yml"
: >"$fixture/production.env"
printf '%s\n' true >"$fixture/running"
printf '%s\n' 'git fixture' >"$fixture/data/git/fixture.txt"
node --input-type=module - "$fixture/data/drawdb.sqlite" <<'NODE'
import Database from "better-sqlite3";
import fs from "node:fs";
const target = process.argv[2];
const source = `${target}.source`;
const db = new Database(source);
db.pragma("journal_mode = WAL");
db.exec("CREATE TABLE example (value TEXT); INSERT INTO example VALUES ('preserved')");
// Keep committed WAL data without SHM so verification must create a sidecar.
fs.copyFileSync(source, target);
fs.copyFileSync(`${source}-wal`, `${target}-wal`);
db.close();
fs.rmSync(source);
NODE
chown -R 1000:1000 "$fixture/data"
chmod 0750 "$fixture/data"

cat >"$fixture/bin/docker" <<'DOCKER_STUB'
#!/usr/bin/env bash
set -Eeuo pipefail
case "$1" in
  info) exit 0 ;;
  stop) echo false >"$BACKUP_FIXTURE/running"; exit 0 ;;
  start) echo true >"$BACKUP_FIXTURE/running"; exit 0 ;;
  inspect)
    case "${3:-}" in
      *'.Mounts'*) echo "$BACKUP_FIXTURE/data" ;;
      '{{.State.Running}}') cat "$BACKUP_FIXTURE/running" ;;
      *'.State.Health'*) printf '%s healthy\n' "$(cat "$BACKUP_FIXTURE/running")" ;;
      '{{.Image}}') echo local-test-image ;;
    esac
    exit 0
    ;;
  run)
    shift
    user=1000:1000
    source=""
    entrypoint=""
    while (($#)); do
      case "$1" in
        --rm|--read-only) shift ;;
        --pull|--network) shift 2 ;;
        --user) user="$2"; shift 2 ;;
        --mount) source="${2#*source=}"; source="${source%%,*}"; shift 2 ;;
        --entrypoint) entrypoint="$2"; shift 2 ;;
        *) break ;;
      esac
    done
    [[ "$entrypoint" == node && "$source" == /tmp/drawdb-verify.* ]]
    shift # image
    [[ "$1" == --input-type=module && "$2" == -e ]]
    code="${3//\/verify/$source}"
    exec setpriv --reuid="${user%:*}" --regid="${user#*:}" --clear-groups \
      node --input-type=module -e "$code"
    ;;
esac
exit 2
DOCKER_STUB
chmod 0755 "$fixture/bin/docker"
export PATH="$fixture/bin:$PATH" BACKUP_FIXTURE="$fixture"
export DRAWDB_APP_DIR="$fixture/app" DRAWDB_ENV_FILE="$fixture/production.env" DRAWDB_RUN_DIR="$fixture/run"

archive="$("$script_dir/backup-data.sh" "$fixture/backups")"
[[ "$(cat "$fixture/running")" == true ]]
[[ "$(stat -c %a "$archive")" == 600 ]]
"$script_dir/verify-backup.sh" "$archive"
"$script_dir/restore-data.sh" "$archive" "$fixture/restored"
[[ "$(cat "$fixture/restored/git/fixture.txt")" == 'git fixture' ]]
[[ "$(stat -c %u:%g "$fixture/restored")" == 1000:1000 ]]
node --input-type=module - "$fixture/restored/drawdb.sqlite" <<'NODE'
import assert from "node:assert/strict";
import Database from "better-sqlite3";
const db = new Database(process.argv[2], { readonly: true });
assert.equal(db.prepare("SELECT value FROM example").get().value, "preserved");
db.close();
NODE

if "$script_dir/restore-data.sh" "$archive" "$fixture/data" 2>/dev/null; then
  echo "Restore unexpectedly overwrote an existing directory." >&2; exit 1
fi
[[ "$(cat "$fixture/data/git/fixture.txt")" == 'git fixture' ]]

# A failed archive operation must resume the app and report failure.
cat >"$fixture/bin/tar" <<'TAR_STUB'
#!/usr/bin/env bash
exit 42
TAR_STUB
chmod 0755 "$fixture/bin/tar"
if "$script_dir/backup-data.sh" "$fixture/backups" >/dev/null 2>&1; then
  echo "Backup unexpectedly succeeded with a failing tar." >&2; exit 1
fi
[[ "$(cat "$fixture/running")" == true ]]
rm -- "$fixture/bin/tar"

# Verification must detect a corrupt database, rather than accepting a valid tar.
mkdir "$fixture/corrupt"
echo 'not SQLite' >"$fixture/corrupt/drawdb.sqlite"
tar -czf "$fixture/corrupt.tar.gz" -C "$fixture/corrupt" .
if "$script_dir/verify-backup.sh" "$fixture/corrupt.tar.gz" >/dev/null 2>&1; then
  echo "Verification unexpectedly accepted corrupt SQLite." >&2; exit 1
fi

# Unsafe links must never write into the data directory outside extraction.
python3 - "$fixture" <<'PYTHON'
import sys, tarfile
from pathlib import Path
root = Path(sys.argv[1])
with tarfile.open(root / "unsafe.tar.gz", "w:gz") as archive:
    link = tarfile.TarInfo("escape")
    link.type = tarfile.SYMTYPE
    link.linkname = str(root / "data")
    archive.addfile(link)
PYTHON
if "$script_dir/restore-data.sh" "$fixture/unsafe.tar.gz" "$fixture/unsafe-restore" >/dev/null 2>&1; then
  echo "Restore unexpectedly accepted an escaping symlink." >&2; exit 1
fi
[[ "$(cat "$fixture/data/git/fixture.txt")" == 'git fixture' ]]

echo 'Backup scenarios passed: integrity, restore, ownership, archive failure, corruption, unsafe paths.'
