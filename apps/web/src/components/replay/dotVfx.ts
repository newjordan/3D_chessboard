type Vec2 = { x: number; y: number };

const BOARD_SIZE = 8;
const FILE_IDS = 'abcdefgh';
const TAU = Math.PI * 2;

const COLOR_TRAIL_CORE = '#adc0cf';
const COLOR_TRAIL_GLOW = '#6f899d';
const COLOR_CAPTURE = '#9cb4c4';
const COLOR_DRIP = '#8ea2b2';
const COLOR_GLITCH = '#9ab1c1';
const COLOR_SWEEP = '#a6becc';

export const DOT_VFX_PRESETS = [
  'move_sine_trail',
  'capture_explode',
  'drip_away',
  'glitch_out',
  'directional_sweep',
] as const;

type DotVfxPreset = (typeof DOT_VFX_PRESETS)[number];

type DotVfxDirection = 'up' | 'down' | 'left' | 'right';

export type DotVfxTriggerEvent =
  | {
      type: 'move';
      key: string;
      from: string;
      to: string;
      flags?: string;
      captured?: string;
      speed?: number;
    }
  | {
      type: 'capture';
      key: string;
      square: string;
      speed?: number;
    }
  | {
      type: 'preset';
      key: string;
      preset: Extract<DotVfxPreset, 'drip_away' | 'glitch_out' | 'directional_sweep'>;
      square?: string;
      from?: string;
      to?: string;
      direction?: DotVfxDirection;
      speed?: number;
    };

export interface DotVfxRuntime {
  trigger: (event: DotVfxTriggerEvent) => void;
  render: (now: number) => boolean;
  resize: (width: number, height: number, dpr: number) => void;
  clear: () => void;
  destroy: () => void;
}

type BaseFx = {
  preset: DotVfxPreset;
  start: number;
  end: number;
};

type MoveSineTrailFx = BaseFx & {
  preset: 'move_sine_trail';
  from: Vec2;
  to: Vec2;
  amplitude: number;
  cycles: number;
  phase: number;
  thickness: number;
  dotSize: number;
  trailSpan: number;
};

type CaptureParticle = {
  angle: number;
  speed: number;
  drag: number;
  size: number;
  delay: number;
  jitter: number;
  phase: number;
  tone: number;
};

type CaptureExplodeFx = BaseFx & {
  preset: 'capture_explode';
  center: Vec2;
  flashSize: number;
  particles: CaptureParticle[];
};

type DripColumn = {
  x: number;
  speed: number;
  length: number;
  width: number;
  delay: number;
  sway: number;
  phase: number;
};

type DripAwayFx = BaseFx & {
  preset: 'drip_away';
  origin: Vec2;
  columns: DripColumn[];
};

type GlitchSlice = {
  y: number;
  width: number;
  amp: number;
  delay: number;
  phase: number;
  density: number;
  block: number;
};

type GlitchBlock = {
  x: number;
  y: number;
  w: number;
  h: number;
  delay: number;
  life: number;
};

type GlitchOutFx = BaseFx & {
  preset: 'glitch_out';
  center: Vec2;
  slices: GlitchSlice[];
  blocks: GlitchBlock[];
};

type DirectionalSweepFx = BaseFx & {
  preset: 'directional_sweep';
  from: Vec2;
  to: Vec2;
  width: number;
  dotSize: number;
  trailLength: number;
};

type DotEffect = MoveSineTrailFx | CaptureExplodeFx | DripAwayFx | GlitchOutFx | DirectionalSweepFx;

type RuntimeState = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  cellW: number;
  cellH: number;
  unit: number;
  effects: DotEffect[];
  maxEffects: number;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const easeIn = (t: number) => Math.pow(clamp(t), 2.2);
const easeInOut = (t: number) => {
  const v = clamp(t);
  return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
};

function makeSeeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isValidSquare(square: string): boolean {
  return /^[a-h][1-8]$/.test(square);
}

function squareToCenter(square: string, state: RuntimeState): Vec2 {
  const normalized = square.toLowerCase();
  if (!isValidSquare(normalized)) {
    return { x: state.width * 0.5, y: state.height * 0.5 };
  }
  const file = FILE_IDS.indexOf(normalized[0]);
  const rank = Number(normalized[1]);
  const row = BOARD_SIZE - rank;
  return {
    x: (file + 0.5) * state.cellW,
    y: (row + 0.5) * state.cellH,
  };
}

function resolveDirection(direction?: DotVfxDirection): Vec2 {
  if (direction === 'up') return { x: 0, y: -1 };
  if (direction === 'down') return { x: 0, y: 1 };
  if (direction === 'left') return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function normalize(v: Vec2): Vec2 {
  const length = Math.hypot(v.x, v.y);
  if (length < 0.0001) return { x: 1, y: 0 };
  return { x: v.x / length, y: v.y / length };
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const px = Math.round(x - size * 0.5);
  const py = Math.round(y - size * 0.5);
  const s = Math.max(1, Math.round(size));
  ctx.fillRect(px, py, s, s);
}

function addEffect(state: RuntimeState, effect: DotEffect): void {
  if (state.effects.length >= state.maxEffects) {
    const overflow = state.effects.length - state.maxEffects + 1;
    state.effects.splice(0, overflow);
  }
  state.effects.push(effect);
}

function createMoveSineTrail(
  state: RuntimeState,
  now: number,
  key: string,
  from: string,
  to: string,
  speed: number
): MoveSineTrailFx {
  const rng = makeSeeded(key);
  const scale = 1 / Math.max(speed, 0.25);
  return {
    preset: 'move_sine_trail',
    start: now,
    end: now + 980 * scale,
    from: squareToCenter(from, state),
    to: squareToCenter(to, state),
    amplitude: state.unit * (0.14 + rng() * 0.09),
    cycles: 2.1 + rng() * 1.6,
    phase: rng() * TAU,
    thickness: state.unit * (0.18 + rng() * 0.08),
    dotSize: Math.max(1.8, state.unit * 0.07),
    trailSpan: 0.5 + rng() * 0.1,
  };
}

function createCaptureExplode(
  state: RuntimeState,
  now: number,
  key: string,
  square: string,
  speed: number,
  delayMs = 0
): CaptureExplodeFx {
  const rng = makeSeeded(key);
  const scale = 1 / Math.max(speed, 0.25);
  const particles: CaptureParticle[] = [];
  const count = 56;
  for (let i = 0; i < count; i++) {
    particles.push({
      angle: rng() * TAU,
      speed: state.unit * (1.2 + rng() * 2.4),
      drag: 0.58 + rng() * 0.34,
      size: Math.max(1.6, state.unit * (0.03 + rng() * 0.03)),
      delay: rng() * 0.24,
      jitter: state.unit * (0.01 + rng() * 0.07),
      phase: rng() * TAU,
      tone: 0.55 + rng() * 0.45,
    });
  }

  return {
    preset: 'capture_explode',
    start: now + delayMs,
    end: now + delayMs + 760 * scale,
    center: squareToCenter(square, state),
    flashSize: state.unit * 0.94,
    particles,
  };
}

function createDripAway(state: RuntimeState, now: number, key: string, square: string, speed: number): DripAwayFx {
  const rng = makeSeeded(key);
  const scale = 1 / Math.max(speed, 0.25);
  const columns: DripColumn[] = [];
  const count = 18;
  for (let i = 0; i < count; i++) {
    columns.push({
      x: (rng() - 0.5) * state.unit * 0.84,
      speed: state.unit * (0.82 + rng() * 1.32),
      length: state.unit * (0.25 + rng() * 0.95),
      width: Math.max(1.2, state.unit * (0.02 + rng() * 0.03)),
      delay: rng() * 0.42,
      sway: state.unit * (0.01 + rng() * 0.05),
      phase: rng() * TAU,
    });
  }
  return {
    preset: 'drip_away',
    start: now,
    end: now + 1260 * scale,
    origin: squareToCenter(square, state),
    columns,
  };
}

function createGlitchOut(state: RuntimeState, now: number, key: string, square: string, speed: number): GlitchOutFx {
  const rng = makeSeeded(key);
  const scale = 1 / Math.max(speed, 0.25);
  const slices: GlitchSlice[] = [];
  const blocks: GlitchBlock[] = [];

  for (let i = 0; i < 12; i++) {
    slices.push({
      y: (rng() - 0.5) * state.unit * 0.95,
      width: state.unit * (0.62 + rng() * 0.58),
      amp: state.unit * (0.08 + rng() * 0.35),
      delay: rng() * 0.35,
      phase: rng() * TAU,
      density: 0.45 + rng() * 0.4,
      block: Math.max(1.4, state.unit * (0.024 + rng() * 0.035)),
    });
  }

  for (let i = 0; i < 28; i++) {
    blocks.push({
      x: (rng() - 0.5) * state.unit * 1.2,
      y: (rng() - 0.5) * state.unit * 1.25,
      w: Math.max(1.2, state.unit * (0.03 + rng() * 0.05)),
      h: Math.max(1.2, state.unit * (0.03 + rng() * 0.08)),
      delay: rng() * 0.55,
      life: 0.1 + rng() * 0.4,
    });
  }

  return {
    preset: 'glitch_out',
    start: now,
    end: now + 700 * scale,
    center: squareToCenter(square, state),
    slices,
    blocks,
  };
}

function createDirectionalSweep(
  state: RuntimeState,
  now: number,
  key: string,
  opts: {
    from?: string;
    to?: string;
    square?: string;
    direction?: DotVfxDirection;
    speed: number;
  }
): DirectionalSweepFx {
  const rng = makeSeeded(key);
  const scale = 1 / Math.max(opts.speed, 0.25);
  const from = opts.from ? squareToCenter(opts.from, state) : squareToCenter(opts.square ?? 'd4', state);
  let to = opts.to ? squareToCenter(opts.to, state) : from;

  if (!opts.to) {
    const dir = resolveDirection(opts.direction);
    const sweepDistance = state.unit * BOARD_SIZE * 0.9;
    to = {
      x: from.x + dir.x * sweepDistance,
      y: from.y + dir.y * sweepDistance,
    };
  }

  return {
    preset: 'directional_sweep',
    start: now,
    end: now + 860 * scale,
    from,
    to,
    width: state.unit * (0.72 + rng() * 0.56),
    dotSize: Math.max(1.8, state.unit * (0.028 + rng() * 0.038)),
    trailLength: state.unit * (1.18 + rng() * 1.1),
  };
}

function renderMoveSineTrail(
  ctx: CanvasRenderingContext2D,
  fx: MoveSineTrailFx,
  now: number
): void {
  const progress = clamp((now - fx.start) / (fx.end - fx.start));
  const head = clamp(easeOut(progress) * 1.04);
  const tail = Math.max(0, head - fx.trailSpan);

  const dx = fx.to.x - fx.from.x;
  const dy = fx.to.y - fx.from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;

  const dir = { x: dx / len, y: dy / len };
  const perp = { x: -dir.y, y: dir.x };

  const span = Math.max(0.001, head - tail);
  const sampleCount = Math.max(20, Math.floor((len * span) / Math.max(1.2, fx.dotSize)));
  const thickBands = Math.max(2, Math.floor(fx.thickness / Math.max(1.4, fx.dotSize)));
  const bandStep = fx.thickness / thickBands;

  ctx.fillStyle = COLOR_TRAIL_GLOW;
  for (let i = 0; i <= sampleCount; i++) {
    const lane = i / sampleCount;
    const u = tail + span * lane;
    const baseX = fx.from.x + dx * u;
    const baseY = fx.from.y + dy * u;
    const oscillation = Math.sin(u * fx.cycles * TAU + progress * 8.6 + fx.phase) * fx.amplitude;
    const x = baseX + perp.x * oscillation;
    const y = baseY + perp.y * oscillation;
    const laneAlpha = 0.07 + (1 - lane) * 0.45;

    for (let b = 0; b <= thickBands; b++) {
      const offset = -fx.thickness * 0.5 + b * bandStep;
      ctx.globalAlpha = laneAlpha * (0.38 + (1 - Math.abs(offset) / (fx.thickness * 0.5 + 0.001)) * 0.62);
      drawDot(ctx, x + perp.x * offset, y + perp.y * offset, fx.dotSize);
    }
  }

  const headX = fx.from.x + dx * head;
  const headY = fx.from.y + dy * head;
  const pulse = 1 - easeIn(clamp((progress - 0.72) / 0.28));
  const reticle = Math.max(3, fx.thickness * (0.55 + pulse * 0.52));

  ctx.globalAlpha = 0.25 + pulse * 0.35;
  ctx.fillStyle = COLOR_TRAIL_CORE;
  const inset = reticle * 0.65;
  const arm = reticle * 0.48;
  drawDot(ctx, headX - inset, headY - inset, fx.dotSize * 1.1);
  drawDot(ctx, headX + inset, headY - inset, fx.dotSize * 1.1);
  drawDot(ctx, headX - inset, headY + inset, fx.dotSize * 1.1);
  drawDot(ctx, headX + inset, headY + inset, fx.dotSize * 1.1);

  ctx.globalAlpha = 0.5 + pulse * 0.45;
  drawDot(ctx, headX - arm, headY, fx.dotSize * 1.15);
  drawDot(ctx, headX + arm, headY, fx.dotSize * 1.15);
  drawDot(ctx, headX, headY - arm, fx.dotSize * 1.15);
  drawDot(ctx, headX, headY + arm, fx.dotSize * 1.15);
}

function renderCaptureExplode(
  ctx: CanvasRenderingContext2D,
  fx: CaptureExplodeFx,
  now: number
): void {
  const progress = clamp((now - fx.start) / (fx.end - fx.start));
  const flash = 1 - easeOut(progress);
  const flashInset = fx.flashSize * (0.08 + easeOut(progress) * 0.42);
  const left = fx.center.x - fx.flashSize * 0.5 + flashInset;
  const top = fx.center.y - fx.flashSize * 0.5 + flashInset;
  const side = fx.flashSize - flashInset * 2;

  ctx.fillStyle = COLOR_CAPTURE;
  ctx.globalAlpha = 0.08 + flash * 0.24;
  ctx.fillRect(Math.round(left), Math.round(top), Math.max(1, Math.round(side)), Math.max(1, Math.round(side)));

  const ringStep = Math.max(1.2, fx.flashSize * 0.06);
  ctx.globalAlpha = 0.18 + flash * 0.35;
  for (let i = 0; i < side; i += ringStep) {
    drawDot(ctx, left + i, top, ringStep * 0.7);
    drawDot(ctx, left + i, top + side, ringStep * 0.7);
    drawDot(ctx, left, top + i, ringStep * 0.7);
    drawDot(ctx, left + side, top + i, ringStep * 0.7);
  }

  ctx.fillStyle = COLOR_CAPTURE;
  for (let i = 0; i < fx.particles.length; i++) {
    const particle = fx.particles[i];
    const life = clamp((progress - particle.delay) / (1 - particle.delay));
    if (life <= 0) continue;

    const drift = (1 - life * particle.drag) * particle.speed;
    const radial = easeOut(life) * drift;
    const jiggle = Math.sin(particle.phase + life * 17.2) * particle.jitter * (1 - life);
    const x = fx.center.x + Math.cos(particle.angle) * radial + jiggle;
    const y = fx.center.y + Math.sin(particle.angle) * radial + Math.cos(particle.phase + life * 13) * jiggle + life * life * fx.flashSize * 0.2;
    const alpha = Math.pow(1 - life, 1.15) * particle.tone;

    ctx.globalAlpha = alpha;
    drawDot(ctx, x, y, particle.size * (1 + (1 - life) * 0.65));
  }
}

function renderDripAway(ctx: CanvasRenderingContext2D, fx: DripAwayFx, now: number): void {
  const progress = clamp((now - fx.start) / (fx.end - fx.start));
  ctx.fillStyle = COLOR_DRIP;

  for (let i = 0; i < fx.columns.length; i++) {
    const drip = fx.columns[i];
    const life = clamp((progress - drip.delay) / (1 - drip.delay));
    if (life <= 0) continue;

    const x = fx.origin.x + drip.x + Math.sin(drip.phase + life * 10.2) * drip.sway;
    const headY = fx.origin.y - drip.length * 0.4 + easeIn(life) * drip.speed * 1.05;
    const tail = drip.length * (0.25 + life * 0.95);
    const step = Math.max(1.1, drip.width * 0.95);

    for (let y = headY - tail; y <= headY; y += step) {
      const dotLife = clamp((y - (headY - tail)) / Math.max(step, tail));
      ctx.globalAlpha = (0.12 + dotLife * 0.5) * (1 - life * 0.3);
      drawDot(ctx, x, y, drip.width);
    }
  }
}

function renderGlitchOut(ctx: CanvasRenderingContext2D, fx: GlitchOutFx, now: number): void {
  const progress = clamp((now - fx.start) / (fx.end - fx.start));
  const fade = 1 - easeInOut(progress);
  ctx.fillStyle = COLOR_GLITCH;

  for (let i = 0; i < fx.slices.length; i++) {
    const slice = fx.slices[i];
    const life = clamp((progress - slice.delay) / (1 - slice.delay));
    if (life <= 0) continue;
    const jitter = Math.sin(slice.phase + life * 25.0) * slice.amp * fade;
    const y = fx.center.y + slice.y;
    const left = fx.center.x - slice.width * 0.5 + jitter;
    const dotStep = Math.max(1.1, slice.block * 1.3);

    for (let x = 0; x <= slice.width; x += dotStep) {
      const chance = (Math.sin((x + slice.phase * 100) * 0.21) + 1) * 0.5;
      if (chance > slice.density) continue;
      ctx.globalAlpha = (0.26 + (1 - life) * 0.58) * fade;
      drawDot(ctx, left + x, y, slice.block);
    }
  }

  for (let i = 0; i < fx.blocks.length; i++) {
    const block = fx.blocks[i];
    const life = clamp((progress - block.delay) / block.life);
    if (life <= 0 || life >= 1) continue;
    ctx.globalAlpha = (1 - life) * 0.62 * fade;
    const x = fx.center.x + block.x + (Math.sin((progress + block.delay) * 48) * block.w);
    const y = fx.center.y + block.y;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(block.w)), Math.max(1, Math.round(block.h)));
  }
}

function renderDirectionalSweep(ctx: CanvasRenderingContext2D, fx: DirectionalSweepFx, now: number): void {
  const progress = clamp((now - fx.start) / (fx.end - fx.start));
  const dir = normalize({ x: fx.to.x - fx.from.x, y: fx.to.y - fx.from.y });
  const perp = { x: -dir.y, y: dir.x };
  const distance = Math.hypot(fx.to.x - fx.from.x, fx.to.y - fx.from.y);
  const head = easeOut(progress) * distance;
  const center = {
    x: fx.from.x + dir.x * head,
    y: fx.from.y + dir.y * head,
  };

  const bands = Math.max(4, Math.floor(fx.width / Math.max(1.2, fx.dotSize)));
  const bandStep = fx.width / bands;
  const trailSteps = Math.max(4, Math.floor(fx.trailLength / Math.max(1.2, fx.dotSize)));
  const trailStep = fx.trailLength / trailSteps;

  ctx.fillStyle = COLOR_SWEEP;
  for (let b = 0; b <= bands; b++) {
    const bo = -fx.width * 0.5 + b * bandStep;
    const baseX = center.x + perp.x * bo;
    const baseY = center.y + perp.y * bo;
    const bandAlpha = 0.2 + (1 - Math.abs(bo) / (fx.width * 0.5 + 0.001)) * 0.55;
    for (let t = 0; t <= trailSteps; t++) {
      const tail = t * trailStep;
      const x = baseX - dir.x * tail;
      const y = baseY - dir.y * tail;
      const trailAlpha = bandAlpha * (1 - t / (trailSteps + 1));
      ctx.globalAlpha = trailAlpha;
      drawDot(ctx, x, y, fx.dotSize);
    }
  }
}

export function createDotVfxRuntime(params: {
  canvas: HTMLCanvasElement;
  maxEffects?: number;
}): DotVfxRuntime {
  const ctx = params.canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Dot VFX requires a 2D canvas context');
  }

  const state: RuntimeState = {
    canvas: params.canvas,
    ctx,
    width: 0,
    height: 0,
    dpr: 1,
    cellW: 0,
    cellH: 0,
    unit: 0,
    effects: [],
    maxEffects: params.maxEffects ?? 96,
  };

  const renderEffect = (effect: DotEffect, now: number): void => {
    if (effect.preset === 'move_sine_trail') {
      renderMoveSineTrail(state.ctx, effect, now);
      return;
    }
    if (effect.preset === 'capture_explode') {
      renderCaptureExplode(state.ctx, effect, now);
      return;
    }
    if (effect.preset === 'drip_away') {
      renderDripAway(state.ctx, effect, now);
      return;
    }
    if (effect.preset === 'glitch_out') {
      renderGlitchOut(state.ctx, effect, now);
      return;
    }
    renderDirectionalSweep(state.ctx, effect, now);
  };

  return {
    resize(width: number, height: number, dpr: number): void {
      const nextWidth = Math.max(1, width);
      const nextHeight = Math.max(1, height);
      const nextDpr = Math.max(1, dpr || 1);

      state.width = nextWidth;
      state.height = nextHeight;
      state.dpr = nextDpr;
      state.cellW = nextWidth / BOARD_SIZE;
      state.cellH = nextHeight / BOARD_SIZE;
      state.unit = Math.min(state.cellW, state.cellH);

      const realWidth = Math.max(1, Math.round(nextWidth * nextDpr));
      const realHeight = Math.max(1, Math.round(nextHeight * nextDpr));
      if (state.canvas.width !== realWidth) state.canvas.width = realWidth;
      if (state.canvas.height !== realHeight) state.canvas.height = realHeight;
      state.canvas.style.width = `${nextWidth}px`;
      state.canvas.style.height = `${nextHeight}px`;
      state.ctx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
      state.ctx.imageSmoothingEnabled = false;
      state.ctx.clearRect(0, 0, nextWidth, nextHeight);
    },

    trigger(event: DotVfxTriggerEvent): void {
      if (state.width < 1 || state.height < 1) return;
      const now = performance.now();
      const speed = Math.max(0.25, event.speed ?? 1);

      if (event.type === 'move') {
        const seed = `${event.key}:${event.from}:${event.to}:${event.flags ?? ''}:${event.captured ?? ''}`;
        addEffect(state, createMoveSineTrail(state, now, `${seed}:trail`, event.from, event.to, speed));

        const flags = event.flags ?? '';
        const isCapture = Boolean(event.captured || flags.includes('e'));
        if (isCapture) {
          const captureSquare = flags.includes('e') ? `${event.to[0]}${event.from[1]}` : event.to;
          addEffect(
            state,
            createCaptureExplode(state, now, `${seed}:capture`, captureSquare, speed, (980 / speed) * 0.54)
          );
        }
        return;
      }

      if (event.type === 'capture') {
        addEffect(state, createCaptureExplode(state, now, `${event.key}:capture`, event.square, speed));
        return;
      }

      if (event.preset === 'drip_away') {
        addEffect(state, createDripAway(state, now, `${event.key}:drip`, event.square ?? 'd4', speed));
        return;
      }
      if (event.preset === 'glitch_out') {
        addEffect(state, createGlitchOut(state, now, `${event.key}:glitch`, event.square ?? 'd4', speed));
        return;
      }
      addEffect(
        state,
        createDirectionalSweep(state, now, `${event.key}:sweep`, {
          from: event.from,
          to: event.to,
          square: event.square,
          direction: event.direction,
          speed,
        })
      );
    },

    render(now: number): boolean {
      if (state.width < 1 || state.height < 1) return false;

      state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      state.ctx.clearRect(0, 0, state.width, state.height);
      if (state.effects.length === 0) return false;

      let writeIndex = 0;
      for (let i = 0; i < state.effects.length; i++) {
        const effect = state.effects[i];
        if (now > effect.end) continue;
        if (now >= effect.start) {
          renderEffect(effect, now);
        }
        state.effects[writeIndex++] = effect;
      }
      state.effects.length = writeIndex;

      state.ctx.globalAlpha = 1;
      return writeIndex > 0;
    },

    clear(): void {
      state.effects.length = 0;
      state.ctx.clearRect(0, 0, state.width, state.height);
    },

    destroy(): void {
      state.effects.length = 0;
      state.ctx.clearRect(0, 0, state.width, state.height);
    },
  };
}
