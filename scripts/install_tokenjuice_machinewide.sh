#!/usr/bin/env bash
set -euo pipefail
SHARED_BIN="/mnt/e/3d_chess/.shared-node-prefix/bin/tokenjuice"
if [ ! -x "$SHARED_BIN" ]; then
  echo "missing shared tokenjuice binary at $SHARED_BIN" >&2
  exit 1
fi
mkdir -p /root/.codex
PATH=/mnt/e/3d_chess/.shared-node-prefix/bin:/usr/bin:/bin HOME=/root "$SHARED_BIN" install codex
mkdir -p /etc/skel/.codex
PATH=/mnt/e/3d_chess/.shared-node-prefix/bin:/usr/bin:/bin HOME=/etc/skel "$SHARED_BIN" install codex
printf '\n---ROOT_HOOKS---\n'
sed -n '1,220p' /root/.codex/hooks.json
printf '\n---SKEL_HOOKS---\n'
sed -n '1,220p' /etc/skel/.codex/hooks.json
printf '\n---DOCTOR_ROOT---\n'
PATH=/mnt/e/3d_chess/.shared-node-prefix/bin:/usr/bin:/bin HOME=/root "$SHARED_BIN" doctor hooks
