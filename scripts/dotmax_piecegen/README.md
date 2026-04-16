# Dotmax Piece Generator

This generator converts the 6 chess piece source PNGs into dot-matrix PNG assets using the `dotmax` image pipeline.

## Run

From repo root:

```bash
./scripts/generate_dotmax_pieces.sh
```

Live tuner window + export final settings:

```bash
./scripts/dotmax_live_tuner.sh
# or: npm run dotmax:tune
```

Note: this uses the `script` terminal command to capture and export your final tune preset.

After quitting tuner (`Q`), it exports a reusable preset:

- `scripts/dotmax_piecegen/presets/final_from_tuner.env`

Then apply + regenerate:

```bash
set -a; source scripts/dotmax_piecegen/presets/final_from_tuner.env; set +a
./scripts/generate_dotmax_pieces.sh
```

Outputs:

- `apps/web/public/replay/dotmax-piece-set/white/*.png`
- `apps/web/public/replay/dotmax-piece-set/black/*.png`
- `apps/web/public/replay/dotmax-piece-set/modes/none/{white,black}/*.png`
- `apps/web/public/replay/dotmax-piece-set/modes/floyd/{white,black}/*.png`
- `apps/web/public/replay/dotmax-piece-set/modes/bayer/{white,black}/*.png`
- `apps/web/public/replay/dotmax-piece-set/modes/atkinson/{white,black}/*.png`
- `apps/web/public/replay/dotmax-piece-set/preview_white_strip.png`
- `apps/web/public/replay/dotmax-piece-set/preview_black_strip.png`

## Main Tune Knobs

```bash
# Input/output
DM_INPUT_DIR=apps/web/public/replay/openai-piece-set/white
DM_OUTPUT_DIR=apps/web/public/replay/dotmax-piece-set
DM_GENERATE_DITHER_PACK=1
DM_DITHER_PACK_MODES=none,floyd,bayer,atkinson

# Dotmax image pipeline
DM_DITHER=floyd            # floyd | bayer | atkinson | none
DM_BRIGHTNESS=1.02
DM_CONTRAST=1.18
DM_GAMMA=0.92
DM_THRESHOLD=              # blank => auto (Otsu)
DM_COLOR_MODE=truecolor    # monochrome | grayscale | truecolor
DM_GRID_W=24
DM_GRID_H=30

# Dot geometry
DM_DOT_PITCH=7.0
DM_DOT_OUTER_R=0.92
DM_DOT_MID_R=0.58
DM_DOT_CORE_R=0.26
DM_DOT_OUTER_ALPHA=132
DM_DOT_MID_ALPHA=204
DM_DOT_CORE_ALPHA=235

# Piece scale balance
DM_SCALE_KING=0.98
DM_SCALE_QUEEN=0.98
DM_SCALE_ROOK=0.97
DM_SCALE_BISHOP=0.96
DM_SCALE_KNIGHT=0.99
DM_SCALE_PAWN=1.08
```

## Example Tune Run

```bash
DM_DITHER=atkinson \
DM_DOT_PITCH=6.6 \
DM_DOT_OUTER_R=0.78 \
DM_DOT_MID_R=0.45 \
DM_SCALE_PAWN=1.12 \
./scripts/generate_dotmax_pieces.sh
```

## Dotmax Source Path

By default the wrapper expects dotmax at `/tmp/dotmax`.
Override with:

```bash
DOTMAX_DIR=/path/to/your/dotmax ./scripts/generate_dotmax_pieces.sh
```

If missing, the wrapper attempts to clone `https://github.com/newjordan/dotmax`.
