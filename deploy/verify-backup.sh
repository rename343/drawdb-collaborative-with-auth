#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$#" -ne 1 || ! -r "$1" ]]; then
  echo "Usage: $0 /path/to/drawdb-data-backup.tar.gz" >&2
  exit 2
fi

archive="$(realpath "$1")"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
temporary_dir="$(mktemp -d /tmp/drawdb-verify.XXXXXX)"
trap 'rm -rf "$temporary_dir"' EXIT
tar -tzf "$archive" >/dev/null
python3 "$script_dir/extract-backup.py" "$archive" "$temporary_dir"
if [[ ! -f "$temporary_dir/drawdb.sqlite" ]]; then
  echo "Archive does not contain drawdb.sqlite at its root." >&2
  exit 1
fi

if [[ -n "${DRAWDB_VERIFY_IMAGE:-}" ]]; then
  image="$DRAWDB_VERIFY_IMAGE"
elif docker inspect "${DRAWDB_CONTAINER:-drawdb-app}" >/dev/null 2>&1; then
  image="$(docker inspect --format '{{.Image}}' "${DRAWDB_CONTAINER:-drawdb-app}")"
else
  echo "Set DRAWDB_VERIFY_IMAGE to a local app image when no app container exists." >&2
  exit 1
fi

# The extracted copy is private to this invocation. Root can traverse the
# root-owned temporary directory; SQLite may create WAL/SHM sidecars here.
docker run --rm --pull never --network none --read-only --user 0:0 \
  --mount "type=bind,source=$temporary_dir,target=/verify" --entrypoint node "$image" \
  --input-type=module -e 'import Database from "better-sqlite3"; const db = new Database("/verify/drawdb.sqlite", { readonly: true, fileMustExist: true }); const result = db.pragma("integrity_check", { simple: true }); db.close(); if (result !== "ok") { console.error(result); process.exit(1); } console.log("SQLite integrity_check: ok");'
