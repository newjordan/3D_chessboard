#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOTMAX_DIR="${DOTMAX_DIR:-/tmp/dotmax}"
WORK_DIR="$(mktemp -d /tmp/dotmax-piecegen-XXXXXX)"
BASE_OUTPUT_DIR="${DM_OUTPUT_DIR:-$REPO_ROOT/apps/web/public/replay/dotmax-piece-set}"
PRIMARY_DITHER="${DM_DITHER:-floyd}"
GENERATE_DITHER_PACK="${DM_GENERATE_DITHER_PACK:-1}"
DITHER_PACK_MODES="${DM_DITHER_PACK_MODES:-none,floyd,bayer,atkinson}"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

if [[ ! -f "$DOTMAX_DIR/Cargo.toml" ]]; then
  echo "[dotmax-piecegen] dotmax not found at $DOTMAX_DIR"
  echo "[dotmax-piecegen] cloning https://github.com/newjordan/dotmax ..."
  env GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 \
    git clone https://github.com/newjordan/dotmax "$DOTMAX_DIR"
fi

mkdir -p "$WORK_DIR/src"
cp "$REPO_ROOT/scripts/dotmax_piecegen/main.rs" "$WORK_DIR/src/main.rs"

cat > "$WORK_DIR/Cargo.toml" <<CARGO
[package]
name = "dotmax_piecegen"
version = "0.1.0"
edition = "2021"

[dependencies]
anyhow = "1"
dotmax = { path = "$DOTMAX_DIR", features = ["image"] }
image = "0.25"
CARGO

# Common tuning knobs (all optional):
# DM_INPUT_DIR, DM_OUTPUT_DIR, DM_DITHER, DM_BRIGHTNESS, DM_CONTRAST, DM_GAMMA,
# DM_DOT_PITCH, DM_DOT_OUTER_R, DM_DOT_MID_R, DM_DOT_CORE_R,
# DM_DOT_OUTER_ALPHA, DM_DOT_MID_ALPHA, DM_DOT_CORE_ALPHA,
# DM_SCALE_KING, DM_SCALE_QUEEN, DM_SCALE_ROOK, DM_SCALE_BISHOP, DM_SCALE_KNIGHT, DM_SCALE_PAWN
# DM_GENERATE_DITHER_PACK=1, DM_DITHER_PACK_MODES=none,floyd,bayer,atkinson

cargo build --release --manifest-path "$WORK_DIR/Cargo.toml"
BIN="$WORK_DIR/target/release/dotmax_piecegen"

run_piecegen() {
  local mode="$1"
  local outdir="$2"
  echo "[dotmax-piecegen] mode=$mode output=$outdir"
  REPO_ROOT="$REPO_ROOT" DM_DITHER="$mode" DM_OUTPUT_DIR="$outdir" "$BIN"
}

run_piecegen "$PRIMARY_DITHER" "$BASE_OUTPUT_DIR"

if [[ "$GENERATE_DITHER_PACK" == "1" || "$GENERATE_DITHER_PACK" == "true" || "$GENERATE_DITHER_PACK" == "yes" ]]; then
  IFS=',' read -r -a modes <<< "$DITHER_PACK_MODES"
  for mode in "${modes[@]}"; do
    clean_mode="$(echo "$mode" | xargs)"
    [[ -z "$clean_mode" ]] && continue
    run_piecegen "$clean_mode" "$BASE_OUTPUT_DIR/modes/$clean_mode"
  done
fi
