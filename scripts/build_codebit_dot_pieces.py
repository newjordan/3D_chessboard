#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple
import json
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw


@dataclass
class DotStyle:
    edge_color: str
    edge_opacity: float
    edge_radius: float
    fill_color: str
    fill_opacity: float
    fill_radius: float


PIECE_MAP: Dict[str, str] = {
    "01_king.png": "king",
    "02_queen.png": "queen",
    "03_rook.png": "rook",
    "04_bishop.png": "bishop",
    "05_knight.png": "knight",
    "06_pawn.png": "pawn",
}

WHITE_STYLE = DotStyle(
    edge_color="#a5e7ff",
    edge_opacity=0.92,
    edge_radius=1.85,
    fill_color="#67cdec",
    fill_opacity=0.62,
    fill_radius=1.35,
)

BLACK_STYLE = DotStyle(
    edge_color="#6fa6ca",
    edge_opacity=0.86,
    edge_radius=1.75,
    fill_color="#2f5f83",
    fill_opacity=0.66,
    fill_radius=1.25,
)


def is_edge(alpha: Image.Image, x: int, y: int, threshold: int) -> bool:
    w, h = alpha.size
    probe = ((-3, 0), (3, 0), (0, -3), (0, 3), (-2, -2), (2, -2), (-2, 2), (2, 2))
    for dx, dy in probe:
        nx, ny = x + dx, y + dy
        if nx < 0 or ny < 0 or nx >= w or ny >= h or alpha.getpixel((nx, ny)) < threshold:
            return True
    return False


def hash_skip(x: int, y: int) -> bool:
    # Deterministic sparse drop for subtle "code bit" fragmentation.
    h = (x * 73856093) ^ (y * 19349663)
    return (h % 100) < 10


def generate_dots(alpha: Image.Image, threshold: int = 72, step: int = 7) -> List[Tuple[int, int, bool]]:
    w, h = alpha.size
    dots: List[Tuple[int, int, bool]] = []
    for y in range(step // 2, h - step // 2, step):
        for x in range(step // 2, w - step // 2, step):
            if alpha.getpixel((x, y)) < threshold:
                continue
            edge = is_edge(alpha, x, y, threshold)
            if not edge and hash_skip(x, y):
                continue
            dots.append((x, y, edge))
    return dots


def write_svg(
    out_path: Path,
    width: int,
    height: int,
    dots: Iterable[Tuple[int, int, bool]],
    style: DotStyle,
) -> None:
    svg = ET.Element(
        "svg",
        attrib={
            "xmlns": "http://www.w3.org/2000/svg",
            "viewBox": f"0 0 {width} {height}",
            "width": str(width),
            "height": str(height),
        },
    )

    for x, y, edge in dots:
        if edge:
            attrib = {
                "cx": str(x),
                "cy": str(y),
                "r": f"{style.edge_radius:.2f}",
                "fill": style.edge_color,
                "fill-opacity": f"{style.edge_opacity:.3f}",
            }
        else:
            attrib = {
                "cx": str(x),
                "cy": str(y),
                "r": f"{style.fill_radius:.2f}",
                "fill": style.fill_color,
                "fill-opacity": f"{style.fill_opacity:.3f}",
            }
        ET.SubElement(svg, "circle", attrib=attrib)

    out_path.write_text(ET.tostring(svg, encoding="unicode"), encoding="utf-8")


def preview_strip(
    out_path: Path,
    pieces: List[Tuple[str, List[Tuple[int, int, bool]]]],
    width: int = 240,
    height: int = 420,
) -> None:
    gap = 12
    strip = Image.new("RGB", (len(pieces) * width + (len(pieces) - 1) * gap, height), (0, 0, 0))
    draw = ImageDraw.Draw(strip, "RGBA")

    x_off = 0
    for _, dots in pieces:
        for x, y, edge in dots:
            if edge:
                r = 2
                color = (160, 232, 255, 232)
            else:
                r = 1
                color = (104, 205, 235, 165)
            draw.ellipse((x_off + x - r, y - r, x_off + x + r, y + r), fill=color)
        x_off += width + gap

    strip.save(out_path)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    in_dir = root / "apps/web/public/replay/openai-piece-set/white"
    out_base = root / "apps/web/public/replay/codebit-dot"
    out_white = out_base / "white"
    out_black = out_base / "black"
    out_white.mkdir(parents=True, exist_ok=True)
    out_black.mkdir(parents=True, exist_ok=True)

    generated: List[Tuple[str, List[Tuple[int, int, bool]]]] = []

    for file_name, piece_name in PIECE_MAP.items():
        src = in_dir / file_name
        if not src.exists():
            raise FileNotFoundError(f"Missing source piece: {src}")
        im = Image.open(src).convert("RGBA")
        alpha = im.getchannel("A")
        dots = generate_dots(alpha)
        generated.append((piece_name, dots))
        write_svg(out_white / f"{piece_name}.svg", im.width, im.height, dots, WHITE_STYLE)
        write_svg(out_black / f"{piece_name}.svg", im.width, im.height, dots, BLACK_STYLE)

    preview_strip(out_base / "preview_strip.png", generated)
    manifest = {
        "source": str(in_dir),
        "output_white": str(out_white),
        "output_black": str(out_black),
        "pieces": [piece for piece, _ in generated],
        "style": "codebit-dot",
        "grid_step": 7,
    }
    (out_base / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("Generated codebit-dot set:", out_base)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
