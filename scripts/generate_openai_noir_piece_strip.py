#!/usr/bin/env python3
"""
Generate a consistent white chess piece set with OpenAI Images API, then split
the returned strip image into modular per-piece PNG assets.

Output files (default):
  apps/web/public/replay/openai-piece-set/white/01_king.png
  apps/web/public/replay/openai-piece-set/white/02_queen.png
  apps/web/public/replay/openai-piece-set/white/03_rook.png
  apps/web/public/replay/openai-piece-set/white/04_bishop.png
  apps/web/public/replay/openai-piece-set/white/05_knight.png
  apps/web/public/replay/openai-piece-set/white/06_pawn.png
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image

API_URL = "https://api.openai.com/v1/images/generations"
PIECE_FILES = [
    "01_king.png",
    "02_queen.png",
    "03_rook.png",
    "04_bishop.png",
    "05_knight.png",
    "06_pawn.png",
]

STYLE_PROMPT = (
    "Flat 2D retro CRT chess icon style. No photorealism, no 3D rendering, no glossy "
    "shading, no noise grain, no metallic texture. Use clean electric-cyan contour lines "
    "with a mild bloom and uniform tiny dot-matrix interior fill. Crisp readable silhouette "
    "at small size on transparent black background. No text."
)

STRIP_PROMPT = (
    "Create exactly six separate chess pieces in one horizontal row, left to right: "
    "king, queen, rook, bishop, knight, pawn. "
    "Front orthographic view. Keep the same design language and stroke weight for all. "
    "All six must be fully visible with transparent space before king and after pawn. "
    "Leave clear transparent vertical gutters between each piece. "
    "Use a smaller scale so no piece touches image edges. "
    "Transparent background. "
    f"{STYLE_PROMPT}"
)


def _post_json(url: str, payload: Dict, api_key: str, timeout_s: int) -> Dict:
    req = urllib.request.Request(
        url=url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _download_bytes(url: str, timeout_s: int) -> bytes:
    req = urllib.request.Request(url=url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        return resp.read()


def generate_strip_png(
    api_key: str,
    model: str,
    size: str,
    quality: str,
    prompt: str,
    timeout_s: int,
) -> bytes:
    # Retry with progressively simpler payloads for compatibility across model variants.
    payloads = [
        {
            "model": model,
            "prompt": prompt,
            "size": size,
            "quality": quality,
            "background": "transparent",
            "output_format": "png",
        },
        {
            "model": model,
            "prompt": prompt,
            "size": size,
            "background": "transparent",
            "output_format": "png",
        },
        {
            "model": model,
            "prompt": prompt,
            "size": size,
            "background": "transparent",
        },
    ]

    last_error = None
    for payload in payloads:
        try:
            data = _post_json(API_URL, payload, api_key, timeout_s)
            items = data.get("data") or []
            if not items:
                raise RuntimeError(f"Images API returned no data: {json.dumps(data)[:1000]}")
            item = items[0]
            b64 = item.get("b64_json")
            if b64:
                return base64.b64decode(b64)
            url = item.get("url")
            if url:
                return _download_bytes(url, timeout_s)
            raise RuntimeError(f"Images API returned unknown item shape: {json.dumps(item)[:1000]}")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            last_error = RuntimeError(f"HTTP {exc.code} from Images API: {detail[:2000]}")
        except Exception as exc:  # noqa: BLE001
            last_error = exc

    raise RuntimeError(f"Failed to generate strip image. Last error: {last_error}")


def connected_components(mask: List[List[bool]]) -> List[List[Tuple[int, int]]]:
    h = len(mask)
    w = len(mask[0]) if h else 0
    seen = [[False] * w for _ in range(h)]
    comps: List[List[Tuple[int, int]]] = []
    neighbors = (
        (1, 0),
        (-1, 0),
        (0, 1),
        (0, -1),
        (1, 1),
        (-1, -1),
        (1, -1),
        (-1, 1),
    )
    for y in range(h):
        for x in range(w):
            if not mask[y][x] or seen[y][x]:
                continue
            q = deque([(x, y)])
            seen[y][x] = True
            comp: List[Tuple[int, int]] = []
            while q:
                cx, cy = q.popleft()
                comp.append((cx, cy))
                for dx, dy in neighbors:
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            comps.append(comp)
    return comps


def alpha_column_runs(alpha: Image.Image, threshold: int, min_width: int = 10) -> List[Tuple[int, int]]:
    w, h = alpha.size
    cols = []
    for x in range(w):
        count = 0
        for y in range(h):
            if alpha.getpixel((x, y)) > threshold:
                count += 1
        cols.append(count)

    runs: List[Tuple[int, int]] = []
    start = None
    for i, val in enumerate(cols):
        if val > 0 and start is None:
            start = i
        elif val == 0 and start is not None:
            if i - start >= min_width:
                runs.append((start, i - 1))
            start = None
    if start is not None and w - start >= min_width:
        runs.append((start, w - 1))
    return runs


def split_strip_to_pieces(strip_path: Path, out_dir: Path, threshold: int = 20) -> List[Path]:
    img = Image.open(strip_path).convert("RGBA")
    w, h = img.size
    alpha = img.getchannel("A")
    runs = alpha_column_runs(alpha, threshold=threshold, min_width=max(8, w // 80))

    # Prefer run-based split because glow can connect components vertically.
    boxes: List[Tuple[int, int, int, int]] = []
    if len(runs) >= 6:
        runs = sorted(runs, key=lambda r: (r[1] - r[0]), reverse=True)[:6]
        runs = sorted(runs, key=lambda r: r[0])  # left to right
        for x0, x1 in runs:
            y_vals = []
            for x in range(max(0, x0 - 2), min(w, x1 + 3)):
                for y in range(h):
                    if alpha.getpixel((x, y)) > threshold:
                        y_vals.append(y)
            if not y_vals:
                continue
            y0, y1 = min(y_vals), max(y_vals)
            boxes.append((max(0, x0 - 2), y0, min(w - 1, x1 + 2), y1))
    else:
        mask = [[alpha.getpixel((x, y)) > threshold for x in range(w)] for y in range(h)]
        comps = connected_components(mask)
        if not comps:
            raise RuntimeError("No visible components found in generated strip image.")
        comps = sorted(comps, key=len, reverse=True)[:6]
        if len(comps) < 6:
            raise RuntimeError(f"Expected 6 separable pieces, found {len(comps)}.")

        def bbox(comp: List[Tuple[int, int]]) -> Tuple[int, int, int, int]:
            xs = [p[0] for p in comp]
            ys = [p[1] for p in comp]
            return min(xs), min(ys), max(xs), max(ys)

        boxes = sorted([bbox(c) for c in comps], key=lambda b: b[0])

    if len(boxes) != 6:
        raise RuntimeError(f"Expected 6 piece boxes, found {len(boxes)}.")

    out_dir.mkdir(parents=True, exist_ok=True)
    out_paths: List[Path] = []
    canvas_w, canvas_h = 240, 420
    pad = 10

    for idx, (x0, y0, x1, y1) in enumerate(boxes):
        piece = img.crop((x0, y0, x1 + 1, y1 + 1))
        max_w = canvas_w - pad * 2
        max_h = canvas_h - pad * 2
        scale = min(max_w / piece.width, max_h / piece.height)
        nw = max(1, int(piece.width * scale))
        nh = max(1, int(piece.height * scale))
        piece = piece.resize((nw, nh), Image.Resampling.LANCZOS)

        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        px = (canvas_w - nw) // 2
        py = canvas_h - pad - nh  # baseline alignment
        canvas.paste(piece, (px, py), piece)

        out_path = out_dir / PIECE_FILES[idx]
        canvas.save(out_path)
        out_paths.append(out_path)

    return out_paths


def write_preview(piece_paths: List[Path], out_path: Path) -> None:
    pieces = [Image.open(p).convert("RGBA") for p in piece_paths]
    gap = 12
    total_w = sum(p.width for p in pieces) + gap * (len(pieces) - 1)
    max_h = max(p.height for p in pieces)
    canvas = Image.new("RGBA", (total_w, max_h), (0, 0, 0, 0))
    x = 0
    for p in pieces:
        canvas.paste(p, (x, 0), p)
        x += p.width + gap
    canvas.save(out_path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out-dir",
        default="apps/web/public/replay/openai-piece-set/white",
        help="Output directory for 01_king..06_pawn PNGs.",
    )
    parser.add_argument(
        "--raw-strip",
        default="apps/web/public/replay/openai-piece-set/raw/generated_strip.png",
        help="Path to save the raw generated strip image.",
    )
    parser.add_argument("--model", default="gpt-image-1", help="Image model name.")
    parser.add_argument("--size", default="1024x1024", help="Generation size, e.g. 1024x1024.")
    parser.add_argument("--quality", default="high", help="Generation quality value.")
    parser.add_argument("--timeout", type=int, default=240, help="API timeout seconds.")
    parser.add_argument("--attempts", type=int, default=6, help="Max generation attempts.")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("ERROR: OPENAI_API_KEY is not set in environment.", file=sys.stderr)
        return 2

    out_dir = Path(args.out_dir)
    raw_strip_path = Path(args.raw_strip)
    raw_strip_path.parent.mkdir(parents=True, exist_ok=True)

    prompt_variants = [
        STRIP_PROMPT,
        STRIP_PROMPT + " Add wider transparent gutters between every adjacent piece.",
        STRIP_PROMPT + " Keep each piece smaller so all six clearly fit inside 1024x1024 with side margins.",
    ]

    last_exc: Exception | None = None
    piece_paths: List[Path] | None = None
    used_prompt = STRIP_PROMPT
    for attempt in range(1, max(1, args.attempts) + 1):
        prompt = prompt_variants[(attempt - 1) % len(prompt_variants)]
        attempt_raw = raw_strip_path.parent / f"generated_strip_attempt{attempt}.png"
        try:
            png_bytes = generate_strip_png(
                api_key=api_key,
                model=args.model,
                size=args.size,
                quality=args.quality,
                prompt=prompt,
                timeout_s=args.timeout,
            )
            attempt_raw.write_bytes(png_bytes)
            piece_paths = split_strip_to_pieces(attempt_raw, out_dir)
            raw_strip_path.write_bytes(png_bytes)
            used_prompt = prompt
            break
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            continue

    if piece_paths is None:
        print(f"ERROR: failed after {args.attempts} attempts: {last_exc}", file=sys.stderr)
        return 1

    preview_path = out_dir.parent / "preview_strip.png"
    write_preview(piece_paths, preview_path)

    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "model": args.model,
        "size": args.size,
        "quality": args.quality,
        "prompt": used_prompt,
        "raw_strip": str(raw_strip_path),
        "pieces": [str(p) for p in piece_paths],
        "preview_strip": str(preview_path),
    }
    (out_dir.parent / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("Generated piece set:")
    for p in piece_paths:
        print(f" - {p}")
    print(f"Preview: {preview_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
