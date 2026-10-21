#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this script with sudo so restored ownership is preserved." >&2
  exit 1
fi
if [[ "$#" -ne 2 || ! -r "$1" ]]; then
  echo "Usage: sudo $0 /path/to/backup.tar.gz /new/path/to/data" >&2
  exit 2
fi

archive="$(realpath "$1")"
destination="$2"
if [[ -e "$destination" || -L "$destination" ]]; then
  echo "Restore destination already exists; choose a new directory: $destination" >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
"$script_dir/verify-backup.sh" "$archive"
mkdir -p "$(dirname -- "$destination")"
mkdir -m 0750 -- "$destination"
python3 "$script_dir/extract-backup.py" "$archive" "$destination"
echo "Restored to $destination. Set DATA_DIR to this path and restart drawDB after review."
