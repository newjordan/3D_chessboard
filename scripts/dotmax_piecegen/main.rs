use anyhow::{Context, Result};
use dotmax::image::{ColorMode, DitheringMethod, ImageRenderer};
use image::codecs::png::PngEncoder;
use image::imageops::{self, FilterType};
use image::{ImageEncoder, Rgba, RgbaImage};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy)]
enum Variant {
    White,
    Black,
}

const PIECES: [(&str, &str, &str); 6] = [
    ("01_king.png", "01_king.png", "king"),
    ("02_queen.png", "02_queen.png", "queen"),
    ("03_rook.png", "03_rook.png", "rook"),
    ("04_bishop.png", "04_bishop.png", "bishop"),
    ("05_knight.png", "05_knight.png", "knight"),
    ("06_pawn.png", "06_pawn.png", "pawn"),
];

const BRAILLE_DOTS: [(u8, usize, usize); 8] = [
    (0x01, 0, 0),
    (0x02, 0, 1),
    (0x04, 0, 2),
    (0x08, 1, 0),
    (0x10, 1, 1),
    (0x20, 1, 2),
    (0x40, 0, 3),
    (0x80, 1, 3),
];

#[derive(Clone, Copy)]
struct DotRenderConfig {
    pitch: f32,
    pad: f32,
    outer_r: f32,
    mid_r: f32,
    core_r: f32,
    outer_a: u8,
    mid_a: u8,
    core_a: u8,
    crop_pad: u32,
    target_size: u32,
    max_w_ratio: f32,
    max_h_ratio: f32,
    y_offset: i64,
}

#[derive(Clone, Copy)]
struct ToneConfig {
    base_mix: f32,
    white_core_boost: f32,
    black_core_boost: f32,
}

#[derive(Clone, Copy)]
struct PipelineConfig {
    grid_w_cells: usize,
    grid_h_cells: usize,
    brightness: f32,
    contrast: f32,
    gamma: f32,
    dither: DitheringMethod,
    threshold: Option<u8>,
    color_mode: ColorMode,
}

#[derive(Clone, Copy)]
struct PieceScaleConfig {
    king: f32,
    queen: f32,
    rook: f32,
    bishop: f32,
    knight: f32,
    pawn: f32,
}

struct Config {
    input_dir: PathBuf,
    output_dir: PathBuf,
    preview_background_alpha: u8,
    generate_black: bool,
    pipeline: PipelineConfig,
    render: DotRenderConfig,
    tone: ToneConfig,
    piece_scale: PieceScaleConfig,
}

fn env_path(name: &str, default: PathBuf) -> PathBuf {
    std::env::var(name).map(PathBuf::from).unwrap_or(default)
}

fn env_bool(name: &str, default: bool) -> bool {
    match std::env::var(name) {
        Ok(raw) => {
            let v = raw.trim().to_ascii_lowercase();
            matches!(v.as_str(), "1" | "true" | "yes" | "y" | "on")
        }
        Err(_) => default,
    }
}

fn env_f32(name: &str, default: f32) -> f32 {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse::<f32>().ok())
        .unwrap_or(default)
}

fn env_u32(name: &str, default: u32) -> u32 {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(default)
}

fn env_u8(name: &str, default: u8) -> u8 {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .map(|v| v.min(255) as u8)
        .unwrap_or(default)
}

fn env_i64(name: &str, default: i64) -> i64 {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(default)
}

fn env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(default)
}

fn env_optional_u8(name: &str) -> Option<u8> {
    let raw = std::env::var(name).ok()?;
    if raw.trim().is_empty() {
        return None;
    }
    raw.trim()
        .parse::<u16>()
        .ok()
        .map(|v| v.min(255) as u8)
}

fn parse_dither() -> DitheringMethod {
    let raw = std::env::var("DM_DITHER").unwrap_or_else(|_| "floyd".to_string());
    match raw.trim().to_ascii_lowercase().as_str() {
        "none" => DitheringMethod::None,
        "bayer" => DitheringMethod::Bayer,
        "atkinson" => DitheringMethod::Atkinson,
        _ => DitheringMethod::FloydSteinberg,
    }
}

fn parse_color_mode() -> ColorMode {
    let raw = std::env::var("DM_COLOR_MODE").unwrap_or_else(|_| "truecolor".to_string());
    match raw.trim().to_ascii_lowercase().as_str() {
        "mono" | "monochrome" => ColorMode::Monochrome,
        "gray" | "grayscale" | "greyscale" => ColorMode::Grayscale,
        _ => ColorMode::TrueColor,
    }
}

impl Config {
    fn from_env(repo_root: &Path) -> Self {
        Self {
            input_dir: env_path(
                "DM_INPUT_DIR",
                repo_root.join("apps/web/public/replay/openai-piece-set/white"),
            ),
            output_dir: env_path(
                "DM_OUTPUT_DIR",
                repo_root.join("apps/web/public/replay/dotmax-piece-set"),
            ),
            preview_background_alpha: env_u8("DM_PREVIEW_BG_ALPHA", 255),
            generate_black: env_bool("DM_GENERATE_BLACK", true),
            pipeline: PipelineConfig {
                grid_w_cells: env_usize("DM_GRID_W", 24),
                grid_h_cells: env_usize("DM_GRID_H", 30),
                brightness: env_f32("DM_BRIGHTNESS", 1.02),
                contrast: env_f32("DM_CONTRAST", 1.18),
                gamma: env_f32("DM_GAMMA", 0.92),
                dither: parse_dither(),
                threshold: env_optional_u8("DM_THRESHOLD"),
                color_mode: parse_color_mode(),
            },
            render: DotRenderConfig {
                pitch: env_f32("DM_DOT_PITCH", 7.0),
                pad: env_f32("DM_DOT_PAD", 22.0),
                outer_r: env_f32("DM_DOT_OUTER_R", 0.92),
                mid_r: env_f32("DM_DOT_MID_R", 0.58),
                core_r: env_f32("DM_DOT_CORE_R", 0.26),
                outer_a: env_u8("DM_DOT_OUTER_ALPHA", 132),
                mid_a: env_u8("DM_DOT_MID_ALPHA", 204),
                core_a: env_u8("DM_DOT_CORE_ALPHA", 235),
                crop_pad: env_u32("DM_CROP_PAD", 8),
                target_size: env_u32("DM_TARGET_SIZE", 420),
                max_w_ratio: env_f32("DM_MAX_W_RATIO", 0.84),
                max_h_ratio: env_f32("DM_MAX_H_RATIO", 0.92),
                y_offset: env_i64("DM_Y_OFFSET", 10),
            },
            tone: ToneConfig {
                base_mix: env_f32("DM_BASE_MIX", 0.32),
                white_core_boost: env_f32("DM_WHITE_CORE_BOOST", 1.12),
                black_core_boost: env_f32("DM_BLACK_CORE_BOOST", 1.08),
            },
            piece_scale: PieceScaleConfig {
                king: env_f32("DM_SCALE_KING", 0.98),
                queen: env_f32("DM_SCALE_QUEEN", 0.98),
                rook: env_f32("DM_SCALE_ROOK", 0.97),
                bishop: env_f32("DM_SCALE_BISHOP", 0.96),
                knight: env_f32("DM_SCALE_KNIGHT", 0.99),
                pawn: env_f32("DM_SCALE_PAWN", 1.08),
            },
        }
    }
}

fn piece_scale_factor(name: &str, piece_scale: PieceScaleConfig) -> f32 {
    match name {
        "king" => piece_scale.king,
        "queen" => piece_scale.queen,
        "rook" => piece_scale.rook,
        "bishop" => piece_scale.bishop,
        "knight" => piece_scale.knight,
        "pawn" => piece_scale.pawn,
        _ => 1.0,
    }
}

fn blend_over(dst: &mut Rgba<u8>, src: [u8; 4]) {
    let sa = src[3] as f32 / 255.0;
    if sa <= 0.0 {
        return;
    }
    let da = dst[3] as f32 / 255.0;
    let out_a = sa + da * (1.0 - sa);
    if out_a <= 0.0 {
        *dst = Rgba([0, 0, 0, 0]);
        return;
    }

    let src_r = src[0] as f32 / 255.0;
    let src_g = src[1] as f32 / 255.0;
    let src_b = src[2] as f32 / 255.0;

    let dst_r = dst[0] as f32 / 255.0;
    let dst_g = dst[1] as f32 / 255.0;
    let dst_b = dst[2] as f32 / 255.0;

    let out_r = (src_r * sa + dst_r * da * (1.0 - sa)) / out_a;
    let out_g = (src_g * sa + dst_g * da * (1.0 - sa)) / out_a;
    let out_b = (src_b * sa + dst_b * da * (1.0 - sa)) / out_a;

    *dst = Rgba([
        (out_r * 255.0).clamp(0.0, 255.0) as u8,
        (out_g * 255.0).clamp(0.0, 255.0) as u8,
        (out_b * 255.0).clamp(0.0, 255.0) as u8,
        (out_a * 255.0).clamp(0.0, 255.0) as u8,
    ]);
}

fn draw_soft_dot(img: &mut RgbaImage, cx: f32, cy: f32, radius: f32, color: [u8; 4]) {
    let min_x = (cx - radius - 1.0).floor().max(0.0) as i32;
    let min_y = (cy - radius - 1.0).floor().max(0.0) as i32;
    let max_x = (cx + radius + 1.0).ceil().min((img.width() - 1) as f32) as i32;
    let max_y = (cy + radius + 1.0).ceil().min((img.height() - 1) as f32) as i32;

    let alpha_scale = color[3] as f32 / 255.0;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let d = (dx * dx + dy * dy).sqrt();
            if d > radius {
                continue;
            }
            let softness = (1.0 - d / radius).powf(1.7);
            let mut c = color;
            c[3] = (255.0 * alpha_scale * softness).clamp(0.0, 255.0) as u8;
            let p = img.get_pixel_mut(x as u32, y as u32);
            blend_over(p, c);
        }
    }
}

fn luminance(r: u8, g: u8, b: u8) -> f32 {
    (0.2126 * r as f32 + 0.7152 * g as f32 + 0.0722 * b as f32) / 255.0
}

fn compute_dot_color(src_rgb: (u8, u8, u8), variant: Variant, tone: ToneConfig) -> ([u8; 3], [u8; 3]) {
    let (sr, sg, sb) = src_rgb;
    let l = luminance(sr, sg, sb);

    let (base_low, base_high, core_boost) = match variant {
        Variant::White => ((84.0, 114.0, 146.0), (198.0, 224.0, 246.0), tone.white_core_boost),
        Variant::Black => ((20.0, 30.0, 42.0), (94.0, 120.0, 152.0), tone.black_core_boost),
    };

    let br = (base_low.0 + (base_high.0 - base_low.0) * l) * (1.0 - tone.base_mix)
        + sr as f32 * tone.base_mix;
    let bg = (base_low.1 + (base_high.1 - base_low.1) * l) * (1.0 - tone.base_mix)
        + sg as f32 * tone.base_mix;
    let bb = (base_low.2 + (base_high.2 - base_low.2) * l) * (1.0 - tone.base_mix)
        + sb as f32 * tone.base_mix;

    let base = [
        br.clamp(0.0, 255.0) as u8,
        bg.clamp(0.0, 255.0) as u8,
        bb.clamp(0.0, 255.0) as u8,
    ];

    let core = [
        (br * core_boost).clamp(0.0, 255.0) as u8,
        (bg * core_boost).clamp(0.0, 255.0) as u8,
        (bb * core_boost).clamp(0.0, 255.0) as u8,
    ];

    (base, core)
}

fn crop_to_alpha(img: &RgbaImage, pad: u32) -> RgbaImage {
    let mut min_x = img.width();
    let mut min_y = img.height();
    let mut max_x = 0u32;
    let mut max_y = 0u32;
    let mut found = false;

    for y in 0..img.height() {
        for x in 0..img.width() {
            if img.get_pixel(x, y)[3] > 3 {
                found = true;
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }

    if !found {
        return img.clone();
    }

    min_x = min_x.saturating_sub(pad);
    min_y = min_y.saturating_sub(pad);
    max_x = (max_x + pad).min(img.width() - 1);
    max_y = (max_y + pad).min(img.height() - 1);

    imageops::crop_imm(img, min_x, min_y, max_x - min_x + 1, max_y - min_y + 1).to_image()
}

fn flatten_rgba_to_black_png(input_path: &Path) -> Result<Vec<u8>> {
    let source = image::open(input_path)
        .with_context(|| format!("failed to open {}", input_path.display()))?
        .to_rgba8();

    let (sw, sh) = source.dimensions();
    let mut flattened = RgbaImage::from_pixel(sw, sh, Rgba([0, 0, 0, 255]));

    for y in 0..sh {
        for x in 0..sw {
            let s = source.get_pixel(x, y);
            let a = s[3] as f32 / 255.0;
            let r = (s[0] as f32 * a).round().clamp(0.0, 255.0) as u8;
            let g = (s[1] as f32 * a).round().clamp(0.0, 255.0) as u8;
            let b = (s[2] as f32 * a).round().clamp(0.0, 255.0) as u8;
            *flattened.get_pixel_mut(x, y) = Rgba([r, g, b, 255]);
        }
    }

    let mut png = Vec::new();
    PngEncoder::new(&mut png).write_image(
        flattened.as_raw(),
        sw,
        sh,
        image::ExtendedColorType::Rgba8,
    )?;

    Ok(png)
}

fn draw_dotmax_piece(
    input_path: &Path,
    output_path: &Path,
    piece_name: &str,
    variant: Variant,
    cfg: &Config,
) -> Result<()> {
    let flattened_png = flatten_rgba_to_black_png(input_path)?;

    let mut renderer = ImageRenderer::new()
        .load_from_bytes(&flattened_png)?
        .resize(cfg.pipeline.grid_w_cells, cfg.pipeline.grid_h_cells, true)?
        .brightness(cfg.pipeline.brightness)?
        .contrast(cfg.pipeline.contrast)?
        .gamma(cfg.pipeline.gamma)?
        .dithering(cfg.pipeline.dither)
        .color_mode(cfg.pipeline.color_mode);

    if let Some(t) = cfg.pipeline.threshold {
        renderer = renderer.threshold(t);
    }

    let grid = renderer.render()?;

    let dot_w = grid.width() * 2;
    let dot_h = grid.height() * 4;

    let canvas_w = (dot_w as f32 * cfg.render.pitch + cfg.render.pad * 2.0).ceil() as u32;
    let canvas_h = (dot_h as f32 * cfg.render.pitch + cfg.render.pad * 2.0).ceil() as u32;

    let mut canvas = RgbaImage::from_pixel(canvas_w, canvas_h, Rgba([0, 0, 0, 0]));
    let patterns = grid.get_raw_patterns();

    for cell_y in 0..grid.height() {
        for cell_x in 0..grid.width() {
            let idx = cell_y * grid.width() + cell_x;
            let pattern = patterns[idx];
            if pattern == 0 {
                continue;
            }

            let c = grid
                .get_color(cell_x, cell_y)
                .unwrap_or(dotmax::Color::rgb(180, 210, 238));
            let (base, core) = compute_dot_color((c.r, c.g, c.b), variant, cfg.tone);

            for (mask, ox, oy) in BRAILLE_DOTS {
                if pattern & mask == 0 {
                    continue;
                }

                let dot_x = cell_x * 2 + ox;
                let dot_y = cell_y * 4 + oy;
                let cx = cfg.render.pad + dot_x as f32 * cfg.render.pitch + cfg.render.pitch * 0.5;
                let cy = cfg.render.pad + dot_y as f32 * cfg.render.pitch + cfg.render.pitch * 0.5;

                draw_soft_dot(
                    &mut canvas,
                    cx,
                    cy,
                    cfg.render.pitch * cfg.render.outer_r,
                    [base[0], base[1], base[2], cfg.render.outer_a],
                );
                draw_soft_dot(
                    &mut canvas,
                    cx,
                    cy,
                    cfg.render.pitch * cfg.render.mid_r,
                    [core[0], core[1], core[2], cfg.render.mid_a],
                );
                draw_soft_dot(
                    &mut canvas,
                    cx,
                    cy,
                    cfg.render.pitch * cfg.render.core_r,
                    [
                        (core[0] as f32 * 1.10).clamp(0.0, 255.0) as u8,
                        (core[1] as f32 * 1.10).clamp(0.0, 255.0) as u8,
                        (core[2] as f32 * 1.10).clamp(0.0, 255.0) as u8,
                        cfg.render.core_a,
                    ],
                );
            }
        }
    }

    let cropped = crop_to_alpha(&canvas, cfg.render.crop_pad);

    let target = cfg.render.target_size;
    let piece_scale = piece_scale_factor(piece_name, cfg.piece_scale);
    let max_w = (target as f32 * cfg.render.max_w_ratio * piece_scale)
        .round()
        .max(120.0) as u32;
    let max_h = (target as f32 * cfg.render.max_h_ratio * piece_scale)
        .round()
        .max(180.0) as u32;

    let scale = (max_w as f32 / cropped.width() as f32)
        .min(max_h as f32 / cropped.height() as f32)
        .max(0.01);

    let out_w = (cropped.width() as f32 * scale).round().max(1.0) as u32;
    let out_h = (cropped.height() as f32 * scale).round().max(1.0) as u32;
    let resized = imageops::resize(&cropped, out_w, out_h, FilterType::Lanczos3);

    let mut framed = RgbaImage::from_pixel(target, target, Rgba([0, 0, 0, 0]));
    let x = ((target - out_w) / 2) as i64;
    let y = (target as i64 - out_h as i64 - cfg.render.y_offset).max(0);
    imageops::overlay(&mut framed, &resized, x, y);

    framed
        .save(output_path)
        .with_context(|| format!("failed saving {}", output_path.display()))?;

    Ok(())
}

fn build_preview_strip(dir: &Path, out_path: &Path, cfg: &Config) -> Result<()> {
    let side = cfg.render.target_size;
    let mut strip = RgbaImage::from_pixel(
        side * PIECES.len() as u32,
        side,
        Rgba([0, 0, 0, cfg.preview_background_alpha]),
    );

    for (i, (_, out_file, _)) in PIECES.iter().enumerate() {
        let path = dir.join(out_file);
        let img = image::open(&path)
            .with_context(|| format!("failed opening {}", path.display()))?
            .to_rgba8();
        imageops::overlay(&mut strip, &img, (i as u32 * side) as i64, 0);
    }

    strip.save(out_path)?;
    Ok(())
}

fn main() -> Result<()> {
    let repo_root = std::env::var("REPO_ROOT")
        .map(PathBuf::from)
        .unwrap_or(std::env::current_dir().context("failed to read cwd")?);

    let cfg = Config::from_env(&repo_root);

    let output_white = cfg.output_dir.join("white");
    let output_black = cfg.output_dir.join("black");

    fs::create_dir_all(&output_white)?;
    fs::create_dir_all(&output_black)?;

    println!("dotmax-piecegen input:  {}", cfg.input_dir.display());
    println!("dotmax-piecegen output: {}", cfg.output_dir.display());
    println!("dotmax-piecegen dither: {:?}", cfg.pipeline.dither);
    println!("dotmax-piecegen mode:   {:?}", cfg.pipeline.color_mode);
    if let Some(t) = cfg.pipeline.threshold {
        println!("dotmax-piecegen threshold: {}", t);
    } else {
        println!("dotmax-piecegen threshold: auto");
    }

    for (input_file, out_file, piece_name) in PIECES {
        let input = cfg.input_dir.join(input_file);
        let white_out = output_white.join(out_file);

        draw_dotmax_piece(&input, &white_out, piece_name, Variant::White, &cfg)
            .with_context(|| format!("white conversion failed for {}", out_file))?;

        if cfg.generate_black {
            let black_out = output_black.join(out_file);
            draw_dotmax_piece(&input, &black_out, piece_name, Variant::Black, &cfg)
                .with_context(|| format!("black conversion failed for {}", out_file))?;
        }

        println!("converted {}", out_file);
    }

    build_preview_strip(
        &output_white,
        &cfg.output_dir.join("preview_white_strip.png"),
        &cfg,
    )?;

    if cfg.generate_black {
        build_preview_strip(
            &output_black,
            &cfg.output_dir.join("preview_black_strip.png"),
            &cfg,
        )?;
    }

    println!("dotmax piece set generated in {}", cfg.output_dir.display());
    Ok(())
}
