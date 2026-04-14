# 3D Board Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing R3F-based 3D replay board with a holographic wireframe neon scene ported from `newjordan/3D_chessboard`, using vanilla Three.js mounted via a React hook.

**Architecture:** A `useBoard3D` hook mounts a vanilla Three.js scene (renderer, orbit controls, bloom post-processing) into a `<canvas>` ref. `Board3DScene.tsx` is a thin `forwardRef` wrapper exposing a `Board3DHandle` for `applyMove` / `resetToPosition`. `ReplayController.tsx` calls those methods when the user steps through plies.

**Tech Stack:** Three.js 0.183.2 (FBXLoader, EffectComposer, UnrealBloomPass, ShaderPass), GSAP 3.x, chess.js 1.x, React 18 (useEffect, useRef, forwardRef, useImperativeHandle), Next.js 15 App Router (`'use client'`), vitest 2.x (coordinate unit tests).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `public/pieces_fbx/*.fbx` | 3D piece models (6 files from reference repo) |
| Create | `src/components/replay/board3d/squareUtils.ts` | Pure coordinate math: algebraic → world-space |
| Create | `src/components/replay/board3d/types.ts` | Shared interfaces: Board3DHandle, SceneContext, PieceInstance |
| Create | `src/components/replay/board3d/scene.ts` | Renderer, camera, OrbitControls, EffectComposer + DotMatrix shader |
| Create | `src/components/replay/board3d/board.ts` | Board geometry: grid, rim, reflection, coordinate sprites, title plates |
| Create | `src/components/replay/board3d/pieces.ts` | FBXLoader, geometry normalisation, wireframe materials, piece map |
| Create | `src/components/replay/board3d/animations.ts` | GSAP timelines: lightning strike, capture, jump |
| Create | `src/components/replay/board3d/useBoard3D.ts` | React hook wiring scene + pieces + animations |
| Create | `src/components/replay/Board3DScene.tsx` | `forwardRef` canvas wrapper |
| Modify | `src/components/replay/ReplayController.tsx` | Swap R3F Canvas for Board3DScene, wire applyMove |
| Delete | `src/components/replay/Board3D.tsx` | Replaced |
| Delete | `src/components/replay/Piece3D.tsx` | Replaced |

All paths are relative to `apps/web/`.

---

## Task 1: Download FBX Assets + Install Dependencies

**Files:**
- Create: `apps/web/public/pieces_fbx/` (6 FBX files)
- Modify: `apps/web/package.json`

- [ ] **Step 1: Download FBX models from the reference repo**

Run from repo root:
```bash
mkdir -p apps/web/public/pieces_fbx
cd apps/web/public/pieces_fbx

BASE="https://raw.githubusercontent.com/newjordan/3D_chessboard/master/public/pieces_fbx"
for piece in pawn rook knight bishop queen king; do
  curl -L -o "${piece}.fbx" "${BASE}/${piece}.fbx"
done
```

- [ ] **Step 2: Verify all 6 files downloaded**

```bash
ls -lh apps/web/public/pieces_fbx/
```

Expected: 6 `.fbx` files, sizes roughly: pawn ~34KB, rook ~70KB, knight ~64KB, bishop ~116KB, queen ~95KB, king ~40KB.

- [ ] **Step 3: Install gsap and vitest**

```bash
cd apps/web
npm install gsap
npm install --save-dev vitest
```

- [ ] **Step 4: Create vitest config**

Create `apps/web/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Add test script to apps/web/package.json**

In `apps/web/package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 6: Commit**

```bash
cd apps/web
git add public/pieces_fbx/ package.json vitest.config.ts package-lock.json
git commit -m "feat: add FBX assets, gsap, and vitest for 3D board upgrade"
```

---

## Task 2: squareUtils — TDD coordinate conversion

**Files:**
- Create: `apps/web/src/components/replay/board3d/squareUtils.ts`
- Create: `apps/web/src/components/replay/board3d/squareUtils.test.ts`

**Coordinate system:**
- File 'a'→0, 'h'→7. World x = fileIndex − 3.5 → a=−3.5, h=3.5
- Rank '1'→1, '8'→8. World z = rank − 4.5 → rank1=−3.5 (white, far), rank8=3.5 (black, near camera)
- Camera sits at (0,12,16); positive z faces viewer (black's side is closest)

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/components/replay/board3d/squareUtils.test.ts`:
```typescript
import { describe, test, expect } from 'vitest';
import { squareToXZ } from './squareUtils';

describe('squareToXZ', () => {
  test('a1 → white back-rank corner', () => {
    expect(squareToXZ('a1')).toEqual({ x: -3.5, z: -3.5 });
  });

  test('h8 → black back-rank corner', () => {
    expect(squareToXZ('h8')).toEqual({ x: 3.5, z: 3.5 });
  });

  test('e4 → near center', () => {
    expect(squareToXZ('e4')).toEqual({ x: 0.5, z: -0.5 });
  });

  test('a8 → black queen-rook start', () => {
    expect(squareToXZ('a8')).toEqual({ x: -3.5, z: 3.5 });
  });

  test('h1 → white king-rook start', () => {
    expect(squareToXZ('h1')).toEqual({ x: 3.5, z: -3.5 });
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

```bash
cd apps/web && npx vitest run src/components/replay/board3d/squareUtils.test.ts
```

Expected: `Error: Failed to resolve import "./squareUtils"`

- [ ] **Step 3: Implement squareUtils.ts**

Create `apps/web/src/components/replay/board3d/squareUtils.ts`:
```typescript
/**
 * Converts algebraic chess notation (e.g. "e4") to world-space XZ coordinates.
 * Board is centred at origin. White's back rank (rank 1) is at z = -3.5.
 * File 'a' is at x = -3.5, file 'h' is at x = 3.5.
 */
export function squareToXZ(square: string): { x: number; z: number } {
  const file = square.charCodeAt(0) - 97; // 'a'=0 .. 'h'=7
  const rank = parseInt(square[1]);        // 1..8
  return { x: file - 3.5, z: rank - 4.5 };
}
```

- [ ] **Step 4: Run — verify PASS**

```bash
cd apps/web && npx vitest run src/components/replay/board3d/squareUtils.test.ts
```

Expected: `5 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/replay/board3d/squareUtils.ts \
        apps/web/src/components/replay/board3d/squareUtils.test.ts
git commit -m "feat: add squareToXZ coordinate utility with tests"
```

---

## Task 3: types.ts

**Files:**
- Create: `apps/web/src/components/replay/board3d/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
import type * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Board3DHandle {
  applyMove(from: string, to: string, isCapture: boolean, promotion?: string): void;
  resetToPosition(fen: string): void;
  highlightSquare(square: string | null): void;
}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  controls: OrbitControls;
  dispose(): void;
}

export interface PieceInstance {
  group: THREE.Group;
  haloGroup: THREE.Group;
  haloMat: THREE.LineBasicMaterial;
  square: string;
  type: string; // 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
  color: 'w' | 'b';
}
```

- [ ] **Step 2: Verify type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/replay/board3d/types.ts
git commit -m "feat: add board3d shared types"
```

---

## Task 4: scene.ts — renderer, camera, post-processing

**Files:**
- Create: `apps/web/src/components/replay/board3d/scene.ts`

- [ ] **Step 1: Create scene.ts**

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { SceneContext } from './types';

const DotMatrixShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 grid = fract(vUv * (resolution / 2.5));
      float dotMask = step(0.3, grid.x) * step(0.3, grid.y);
      vec3 techFuzz = texel.rgb * (dotMask * 0.2 + 0.8);
      gl_FragColor = vec4(techFuzz, texel.a);
    }
  `,
};

export function setupScene(canvas: HTMLCanvasElement): SceneContext {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000510, 0.015);

  const w = canvas.clientWidth || 800;
  const h = canvas.clientHeight || 600;

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  camera.position.set(0, 12, 16);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.minDistance = 8;
  controls.maxDistance = 20;
  controls.target.set(0, 0, 0);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.3, 0.25));
  const dotPass = new ShaderPass(DotMatrixShader);
  dotPass.uniforms.resolution.value.set(w, h);
  composer.addPass(dotPass);

  // Structured dot-matrix starfield
  const starPositions: number[] = [];
  for (let x = -50; x <= 50; x += 4) {
    for (let y = -50; y <= 50; y += 4) {
      for (let z = -50; z <= 50; z += 4) {
        if (Math.sqrt(x * x + y * y + z * z) < 12) continue;
        starPositions.push(x, y, z);
      }
    }
  }
  const starsGeo = new THREE.BufferGeometry();
  starsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(starPositions), 3));
  scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ size: 0.08, color: 0x66aaff, transparent: true, opacity: 0.4 })));

  const ro = new ResizeObserver(() => {
    const rw = canvas.clientWidth;
    const rh = canvas.clientHeight;
    if (rw === 0 || rh === 0) return;
    camera.aspect = rw / rh;
    camera.updateProjectionMatrix();
    renderer.setSize(rw, rh);
    composer.setSize(rw, rh);
    dotPass.uniforms.resolution.value.set(rw, rh);
  });
  ro.observe(canvas.parentElement ?? canvas);

  return {
    scene,
    camera,
    renderer,
    composer,
    controls,
    dispose() {
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/replay/board3d/scene.ts
git commit -m "feat: add 3D board scene setup (renderer, bloom, dot-matrix, starfield)"
```

---

## Task 5: board.ts — board geometry, reflection, coordinates

**Files:**
- Create: `apps/web/src/components/replay/board3d/board.ts`

- [ ] **Step 1: Create board.ts**

```typescript
import * as THREE from 'three';

const OFFSET = 4; // half of 8 squares
const BOARD_THICKNESS = 0.5;
const B1 = OFFSET + 0.08;
const B2 = OFFSET + 0.3;
const B3 = B2 + 0.6;

function pushBox(s: number): THREE.Vector3[] {
  return [
    new THREE.Vector3(-s, 0, -s), new THREE.Vector3(s, 0, -s),
    new THREE.Vector3(s, 0, -s),  new THREE.Vector3(s, 0, s),
    new THREE.Vector3(s, 0, s),   new THREE.Vector3(-s, 0, s),
    new THREE.Vector3(-s, 0, s),  new THREE.Vector3(-s, 0, -s),
  ];
}

function makeLines(points: THREE.Vector3[], color: number, opacity: number): THREE.LineSegments {
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
}

function createTextSprite(text: string, fontSize = 32, canvasSize = 64): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize; canvas.height = canvasSize;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `300 ${fontSize}px sans-serif`;
  ctx.fillStyle = '#66ccff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 6;
  ctx.fillText(text, canvasSize / 2, canvasSize / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
}

function createTitleSprite(text: string, width = 800): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '700 60px "Orbitron", sans-serif';
  ctx.fillStyle = '#66ccff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 12;
  ctx.fillText(text, width / 2, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  return new THREE.Mesh(
    new THREE.PlaneGeometry((width / 1024) * 5.0, 0.75),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
}

function addCoordinates(parent: THREE.Group, whiteName: string, blackName: string): void {
  const letters = ['A','B','C','D','E','F','G','H'];
  const numbers = ['1','2','3','4','5','6','7','8'];
  const yPos = -BOARD_THICKNESS + 0.01;
  const tabDist = (B2 + B3) / 2;
  const lineMat = new THREE.LineBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.5 });

  for (let i = 0; i < 8; i++) {
    const x = i - (OFFSET - 0.5);
    // front (positive z) edge
    const tFront = createTextSprite(letters[i]);
    tFront.position.set(x, yPos, tabDist);
    tFront.rotation.x = -Math.PI / 2;
    parent.add(tFront);
    // back (negative z) edge
    const tBack = createTextSprite(letters[7 - i]);
    tBack.position.set(x, yPos, -tabDist);
    tBack.rotation.x = -Math.PI / 2;
    tBack.rotation.z = Math.PI;
    parent.add(tBack);
    // hatch separators
    if (i < 7) {
      const hx = x + 0.5;
      const hpts = [
        new THREE.Vector3(hx, yPos, B2), new THREE.Vector3(hx, yPos, B3),
        new THREE.Vector3(hx, yPos, -B2), new THREE.Vector3(hx, yPos, -B3),
      ];
      parent.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hpts), lineMat));
    }
  }

  for (let i = 0; i < 8; i++) {
    const z = (OFFSET - 0.5) - i;
    const tRight = createTextSprite(numbers[i]);
    tRight.position.set(tabDist, yPos, z);
    tRight.rotation.x = -Math.PI / 2;
    tRight.rotation.z = Math.PI / 2;
    parent.add(tRight);
    if (i < 7) {
      const hz = z - 0.5;
      parent.add(makeLines([new THREE.Vector3(B2, yPos, hz), new THREE.Vector3(B3, yPos, hz)], 0x44aaff, 0.5));
    }
  }

  // Title plates
  const blackTitle = createTitleSprite(blackName.toUpperCase());
  blackTitle.position.set(-tabDist, yPos, -2.3);
  blackTitle.rotation.x = -Math.PI / 2;
  blackTitle.rotation.z = Math.PI / 2;
  parent.add(blackTitle);

  const whiteTitle = createTitleSprite(whiteName.toUpperCase(), 512);
  whiteTitle.position.set(-tabDist, yPos, 2.3);
  whiteTitle.rotation.x = -Math.PI / 2;
  whiteTitle.rotation.z = Math.PI / 2;
  parent.add(whiteTitle);
}

export function createBoard(scene: THREE.Scene, whiteName: string, blackName: string): { boardGroup: THREE.Group } {
  const masterGroup = new THREE.Group();
  const boardGroup = new THREE.Group();

  // Grid lines
  const gridPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    gridPts.push(new THREE.Vector3(-OFFSET, 0, i - OFFSET), new THREE.Vector3(OFFSET, 0, i - OFFSET));
    gridPts.push(new THREE.Vector3(i - OFFSET, 0, -OFFSET), new THREE.Vector3(i - OFFSET, 0, OFFSET));
  }
  boardGroup.add(makeLines(gridPts, 0x2288ff, 0.4));

  // Double outer border
  boardGroup.add(makeLines([...pushBox(B1), ...pushBox(B2)], 0x55aaff, 0.8));

  // Side pillars + rim layers
  const sidePts: THREE.Vector3[] = [];
  ([ [-B2,-B2],[B2,-B2],[B2,B2],[-B2,B2] ] as [number,number][]).forEach(([x, z]) => {
    sidePts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, -BOARD_THICKNESS, z));
  });
  pushBox(B2).forEach(p => { const c = p.clone(); c.y = -BOARD_THICKNESS / 2; sidePts.push(c); });
  pushBox(B2).forEach(p => { const c = p.clone(); c.y = -BOARD_THICKNESS; sidePts.push(c); });
  pushBox(B3).forEach(p => { const c = p.clone(); c.y = -BOARD_THICKNESS; sidePts.push(c); });
  ([ [-1,-1],[1,-1],[1,1],[-1,1] ] as [number,number][]).forEach(([mx, mz]) => {
    sidePts.push(new THREE.Vector3(mx*B2, -BOARD_THICKNESS, mz*B2), new THREE.Vector3(mx*B3, -BOARD_THICKNESS, mz*B3));
  });
  boardGroup.add(makeLines(sidePts, 0x2288ff, 0.5));

  // Corner dot clusters on the tab
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x88ccff });
  const dotGeo = new THREE.PlaneGeometry(0.03, 0.03);
  const cornerTabOffset = B3 - 0.15;
  const yDot = -BOARD_THICKNESS + 0.01;
  for (const [cx, cz] of [[-cornerTabOffset, cornerTabOffset],[cornerTabOffset, cornerTabOffset],[-cornerTabOffset,-cornerTabOffset],[cornerTabOffset,-cornerTabOffset]] as [number,number][]) {
    const g = new THREE.Group();
    for (const dx of [-0.04, 0.04]) for (const dz of [-0.04, 0.04]) {
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.position.set(dx, dz, 0);
      g.add(d);
    }
    g.position.set(cx, yDot, cz);
    g.rotation.x = -Math.PI / 2;
    boardGroup.add(g);
  }

  addCoordinates(boardGroup, whiteName, blackName);

  // Reflection — inverted clone, additive blending, faded
  const reflection = boardGroup.clone();
  reflection.scale.y = -1;
  reflection.position.y = -BOARD_THICKNESS - 0.01;
  reflection.traverse((child) => {
    const c = child as any;
    if (c.material) {
      c.material = c.material.clone();
      c.material.opacity = c.isMesh ? 0.05 : c.material.opacity * 0.15;
      c.material.transparent = true;
      c.material.blending = THREE.AdditiveBlending;
    }
  });

  masterGroup.add(boardGroup, reflection);
  scene.add(masterGroup);
  return { boardGroup };
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/replay/board3d/board.ts
git commit -m "feat: add 3D board geometry (grid, rim, reflection, coordinates)"
```

---

## Task 6: pieces.ts — FBX loading, wireframe materials, piece map

**Files:**
- Create: `apps/web/src/components/replay/board3d/pieces.ts`

- [ ] **Step 1: Create pieces.ts**

```typescript
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Chess } from 'chess.js';
import type { PieceInstance } from './types';
import { squareToXZ } from './squareUtils';

const PIECE_HEIGHTS: Record<string, number> = {
  p: 0.8, r: 1.0, n: 1.25, b: 1.4, q: 1.6, k: 1.8,
};

const GEO_KEY: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

export type Geometries = Record<string, THREE.BufferGeometry>;

function normalizeGeometry(geo: THREE.BufferGeometry, typeName: string): void {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const xl = bb.max.x - bb.min.x;
  const yl = bb.max.y - bb.min.y;
  const zl = bb.max.z - bb.min.z;

  if (xl > yl && xl > zl) geo.rotateZ(Math.PI / 2);
  else if (zl > yl && zl > xl) geo.rotateX(Math.PI / 2);

  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox!.min.y, 0);
  geo.computeBoundingBox();

  const bb2 = geo.boundingBox!;
  const ySize = bb2.max.y - bb2.min.y;
  const maxXZ = Math.max(bb2.max.x - bb2.min.x, bb2.max.z - bb2.min.z);
  const typeChar = Object.entries(GEO_KEY).find(([, v]) => v === typeName)?.[0] ?? 'p';
  const desiredH = PIECE_HEIGHTS[typeChar];
  let scale = desiredH / ySize;
  if (maxXZ * scale > 0.8) scale = 0.8 / maxXZ;
  geo.scale(scale, scale, scale);
}

export async function loadPieceGeometries(): Promise<Geometries> {
  const loader = new FBXLoader();
  const types = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
  const geometries: Geometries = {};

  await Promise.all(types.map(typeName =>
    new Promise<void>(resolve => {
      loader.load(`/pieces_fbx/${typeName}.fbx`, object => {
        let geo: THREE.BufferGeometry | null = null;
        object.traverse(child => {
          if ((child as THREE.Mesh).isMesh && !geo) {
            geo = (child as THREE.Mesh).geometry.clone();
          }
        });
        if (geo) {
          normalizeGeometry(geo, typeName);
          geometries[typeName] = geo;
        }
        resolve();
      }, undefined, () => resolve());
    })
  ));

  return geometries;
}

function makeMaterial(color: 'w' | 'b'): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: color === 'w' ? 0x00ffff : 0x22aaff,
    transparent: true,
    opacity: color === 'w' ? 0.8 : 0.7,
  });
}

function buildPieceMesh(typeName: string, color: 'w' | 'b', geos: Geometries): THREE.Group {
  const group = new THREE.Group();
  const mat = makeMaterial(color);
  const geo = geos[typeName];

  if (geo) {
    group.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), mat));
  } else {
    const fallback = new THREE.CylinderGeometry(0.3, 0.4, 1.0);
    fallback.translate(0, 0.5, 0);
    group.add(new THREE.LineSegments(new THREE.WireframeGeometry(fallback), mat));
  }

  if (typeName === 'knight') {
    group.rotation.y = (color === 'w' ? Math.PI : 0) - Math.PI / 2;
  }

  group.userData.baseMaterial = mat;
  return group;
}

function buildHalo(piecesContainer: THREE.Group, x: number, z: number): { haloGroup: THREE.Group; haloMat: THREE.LineBasicMaterial } {
  const haloMat = new THREE.LineBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0 });
  const haloGroup = new THREE.Group();
  haloGroup.visible = false;

  const r1 = new THREE.LineLoop(new THREE.EdgesGeometry(new THREE.CircleGeometry(0.4, 32)), haloMat);
  const r2 = new THREE.LineLoop(new THREE.EdgesGeometry(new THREE.CircleGeometry(0.32, 32)), haloMat);
  r1.rotation.x = r2.rotation.x = -Math.PI / 2;
  r1.position.y = r2.position.y = -0.05;
  haloGroup.add(r1, r2);
  haloGroup.position.set(x, 0, z);
  piecesContainer.add(haloGroup);
  return { haloGroup, haloMat };
}

export function initPiecesFromFen(
  fen: string,
  geos: Geometries,
  piecesContainer: THREE.Group
): Map<string, PieceInstance> {
  const pieceMap = new Map<string, PieceInstance>();
  const chess = new Chess(fen);
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq) continue;
      const rank = 8 - r;
      const square = String.fromCharCode(97 + c) + rank;
      const { x, z } = squareToXZ(square);
      const typeName = GEO_KEY[sq.type];
      const group = buildPieceMesh(typeName, sq.color as 'w' | 'b', geos);
      group.position.set(x, 0, z);
      piecesContainer.add(group);
      const { haloGroup, haloMat } = buildHalo(piecesContainer, x, z);
      pieceMap.set(square, { group, haloGroup, haloMat, square, type: sq.type, color: sq.color as 'w' | 'b' });
    }
  }

  return pieceMap;
}

export function clearPieces(pieceMap: Map<string, PieceInstance>, piecesContainer: THREE.Group): void {
  pieceMap.forEach(({ group, haloGroup }) => {
    piecesContainer.remove(group);
    piecesContainer.remove(haloGroup);
  });
  pieceMap.clear();
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/replay/board3d/pieces.ts
git commit -m "feat: add FBX piece loader and wireframe neon piece map"
```

---

## Task 7: animations.ts — GSAP lightning, capture, jump

**Files:**
- Create: `apps/web/src/components/replay/board3d/animations.ts`

- [ ] **Step 1: Create animations.ts**

Port the GSAP timelines from the reference repo's `src/animations.js`, adapting from rank/file integers to algebraic square strings via `squareToXZ`.

```typescript
import * as THREE from 'three';
import { gsap } from 'gsap';
import type { PieceInstance } from './types';
import { squareToXZ } from './squareUtils';

function createBracket(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 1, depthTest: false });
  const pts: THREE.Vector3[] = [];
  const s = 0.45, l = 0.15;
  // Top-left
  pts.push(new THREE.Vector3(-s,0,-s+l), new THREE.Vector3(-s,0,-s), new THREE.Vector3(-s+l,0,-s));
  // Top-right
  pts.push(new THREE.Vector3(s-l,0,-s), new THREE.Vector3(s,0,-s), new THREE.Vector3(s,0,-s+l));
  // Bottom-left
  pts.push(new THREE.Vector3(-s,0,s-l), new THREE.Vector3(-s,0,s), new THREE.Vector3(-s+l,0,s));
  // Bottom-right
  pts.push(new THREE.Vector3(s-l,0,s), new THREE.Vector3(s,0,s), new THREE.Vector3(s,0,s-l));
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat));

  // Centre crosshair dot
  const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 1, depthTest: false }));
  dot.rotation.x = -Math.PI / 2;
  group.add(dot);

  // Spinning dashed ring
  const ringMat = new THREE.LineDashedMaterial({ color: 0x00ffcc, dashSize: 0.1, gapSize: 0.05, transparent: true, opacity: 0.8, depthTest: false });
  const ring = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CircleGeometry(0.35, 32)), ringMat);
  ring.computeLineDistances();
  ring.rotation.x = -Math.PI / 2;
  gsap.to(ring.rotation, { z: Math.PI * 2, duration: 2.0, ease: 'none', repeat: -1 });
  group.add(ring);

  return group;
}

export function animateLightningStrike(
  fromSquare: string,
  toSquare: string,
  boardGroup: THREE.Group,
  onComplete: () => void
): void {
  const start = squareToXZ(fromSquare);
  const end = squareToXZ(toSquare);
  const tl = gsap.timeline({ onComplete });

  const bracket = createBracket();
  bracket.position.set(start.x, 0.1, start.z);
  bracket.scale.set(1.5, 1.5, 1.5);
  (bracket.children[0] as THREE.LineSegments).material.opacity = 0;
  (bracket.children[1] as THREE.Mesh).material.opacity = 0;
  boardGroup.add(bracket);

  const lineMat = (bracket.children[0] as THREE.LineSegments).material as THREE.Material;
  const dotMat = (bracket.children[1] as THREE.Mesh).material as THREE.Material;

  tl.to([lineMat, dotMat], { opacity: 1, duration: 0.1, ease: 'power2.in' }, 0);
  tl.to(bracket.scale, { x: 1, y: 1, z: 1, duration: 0.2, ease: 'back.out(1.5)' }, 0);

  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const snapX = start.x + (dx > 0 ? 0.5 : -0.5);
  const snapZ = start.z + (dz > 0 ? 0.5 : -0.5);

  tl.to(lineMat, { opacity: 0, duration: 0.1 }, '+=0.1');
  tl.to(bracket.children[1].scale, { x: 2, y: 2, z: 2, duration: 0.1 }, '<');
  tl.to(bracket.position, { x: snapX, z: snapZ, duration: 0.1, ease: 'power1.inOut' });

  const targetX = end.x + (dx > 0 ? -0.5 : 0.5);
  const targetZ = end.z + (dz > 0 ? -0.5 : 0.5);
  const dist1 = Math.abs(snapZ - targetZ);
  const dist2 = Math.abs(snapX - targetX);
  const totalDist = dist1 + dist2;

  const tracePoints = [
    new THREE.Vector3(snapX, 0, snapZ),
    new THREE.Vector3(snapX, 0, targetZ),
    new THREE.Vector3(targetX, 0, targetZ),
  ];
  const traceGeo = new THREE.BufferGeometry().setFromPoints(tracePoints);
  const uvArr = new Float32Array([0, 0, totalDist > 0 ? dist1 / totalDist : 0, 0, 1, 0]);
  traceGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

  const traceMat = new THREE.ShaderMaterial({
    uniforms: { uProgress: { value: 0 }, uLength: { value: 0.85 }, color: { value: new THREE.Color(0x00ffff) } },
    vertexShader: `varying float vUv; void main() { vUv = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uProgress; uniform float uLength; uniform vec3 color; varying float vUv;
      void main() {
        float dist = uProgress - vUv;
        if (dist >= 0.0 && dist <= uLength) {
          float alpha = pow(1.0 - (dist / uLength), 1.5);
          gl_FragColor = vec4(color * 3.0, alpha);
        } else { gl_FragColor = vec4(0.0); }
      }`,
    transparent: true, depthTest: false,
  });
  const traceLine = new THREE.Line(traceGeo, traceMat);
  traceLine.position.y = 0.05;
  boardGroup.add(traceLine);

  const proxy = { p: 0 };
  tl.to(proxy, {
    p: 1.85,
    duration: 1.2,
    ease: 'power1.inOut',
    onUpdate() {
      traceMat.uniforms.uProgress.value = proxy.p;
      const head = Math.min(proxy.p, 1.0);
      if (totalDist > 0) {
        const split = dist1 / totalDist;
        if (head <= split) {
          bracket.position.x = snapX;
          bracket.position.z = THREE.MathUtils.lerp(snapZ, targetZ, split === 0 ? 1 : head / split);
        } else {
          bracket.position.x = THREE.MathUtils.lerp(snapX, targetX, (head - split) / (1 - split));
          bracket.position.z = targetZ;
        }
      }
    },
  });

  tl.to(bracket.position, { x: end.x, z: end.z, duration: 0.1, ease: 'power1.inOut' });
  tl.to(lineMat, { opacity: 1, duration: 0.1 }, '<');
  tl.fromTo(bracket.scale, { x: 0.1, y: 0.1, z: 0.1 }, { x: 1, y: 1, z: 1, duration: 0.2, ease: 'back.out(2)' }, '<');
  tl.to([lineMat, dotMat], { opacity: 0, duration: 0.2 }, '+=0.2');
  tl.call(() => { boardGroup.remove(bracket); boardGroup.remove(traceLine); });
}

export function animateCapture(
  instance: PieceInstance,
  boardGroup: THREE.Group,
  piecesContainer: THREE.Group,
  onComplete: () => void
): void {
  const { x } = squareToXZ(instance.square);
  const { z } = squareToXZ(instance.square);
  const px = instance.group.position.x;
  const pz = instance.group.position.z;
  const tl = gsap.timeline({ onComplete });

  // Expanding green border
  const borderMat = new THREE.LineBasicMaterial({ color: 0x00ff77, opacity: 0, transparent: true });
  const border = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.9, 0.9)), borderMat);
  border.rotation.x = -Math.PI / 2;
  border.position.set(px, 0.03, pz);
  border.scale.set(0.1, 0.1, 0.1);
  boardGroup.add(border);
  tl.to(borderMat, { opacity: 1, duration: 0.1 }, 0);
  tl.to(border.scale, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'power2.out' }, 0);

  // Ghost ring dropping
  const ghostMat = new THREE.LineBasicMaterial({ color: 0x00ff77, transparent: true, opacity: 0.8 });
  const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CircleGeometry(0.4, 32)), ghostMat);
  ghost.rotation.x = -Math.PI / 2;
  ghost.position.set(px, 0, pz);
  boardGroup.add(ghost);
  tl.to(ghost.position, { y: -2, duration: 0.8, ease: 'power1.in' }, 0.2);
  tl.to(ghost.scale, { x: 2, y: 2, z: 2, duration: 0.8 }, 0.2);
  tl.to(ghostMat, { opacity: 0, duration: 0.8 }, 0.2);

  // Halo fade + piece falls with clipping
  tl.to(instance.haloMat, { opacity: 0, duration: 0.1 }, 0.3);
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5);
  instance.group.traverse(child => {
    const c = child as any;
    if (c.material && c.type === 'LineSegments') {
      c.material = c.material.clone();
      c.material.color.setHex(0xff0022);
      c.material.clippingPlanes = [clipPlane];
    }
  });
  tl.to(instance.group.position, { y: -2, duration: 0.6, ease: 'power3.in' }, 0.3);

  // Particle burst (12 orthogonal-path particles)
  const particleGroup = new THREE.Group();
  particleGroup.position.set(px, 0.02, pz);
  const dirs = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
  for (let i = 0; i < 12; i++) {
    const pMat = new THREE.MeshBasicMaterial({ color: 0x00ff77, transparent: true, opacity: 1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), pMat);
    mesh.rotation.x = -Math.PI / 2;
    particleGroup.add(mesh);
    const d1 = dirs[Math.floor(Math.random() * 4)];
    const d2 = d1.x === 0
      ? [{ x: 1, z: 0 }, { x: -1, z: 0 }][Math.floor(Math.random() * 2)]
      : [{ x: 0, z: 1 }, { x: 0, z: -1 }][Math.floor(Math.random() * 2)];
    const dist1p = 0.5 + Math.floor(Math.random() * 2);
    const dist2p = 1.0 + Math.floor(Math.random() * 3);
    const pTl = gsap.timeline();
    pTl.to(mesh.position, { x: d1.x * dist1p, z: d1.z * dist1p, duration: dist1p * 0.15, ease: 'none' }, Math.random() * 0.2);
    pTl.to(mesh.position, { x: d1.x * dist1p + d2.x * dist2p, z: d1.z * dist1p + d2.z * dist2p, duration: dist2p * 0.15, ease: 'none' });
    pTl.to(pMat, { opacity: 0, duration: 0.3 }, '-=0.3');
  }
  boardGroup.add(particleGroup);

  // Glitch clipping plane
  const glitchObj = { val: 0.5 };
  tl.to(glitchObj, { val: 0.7, duration: 0.4, onUpdate() { clipPlane.constant = glitchObj.val + (Math.random() * 0.1 - 0.05); } }, 0.4);

  tl.to(border.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.2, ease: 'power2.in' }, 0.8);
  tl.to(borderMat, { opacity: 0, duration: 0.2 }, 0.8);
  tl.call(() => {
    piecesContainer.remove(instance.group);
    piecesContainer.remove(instance.haloGroup);
    boardGroup.remove(border);
    boardGroup.remove(ghost);
    boardGroup.remove(particleGroup);
  });
}

export function animateJump(
  instance: PieceInstance,
  toSquare: string,
  onComplete: () => void
): void {
  const { x, z } = squareToXZ(toSquare);
  const tl = gsap.timeline({ onComplete });
  tl.to(instance.group.position, { x, z, duration: 0.5, ease: 'power1.inOut' }, 0);
  tl.to(instance.group.position, { y: 1.5, duration: 0.25, ease: 'power1.out', yoyo: true, repeat: 1 }, 0);
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/replay/board3d/animations.ts
git commit -m "feat: add GSAP animation system (lightning strike, capture, jump)"
```

---

## Task 8: useBoard3D.ts — React hook

**Files:**
- Create: `apps/web/src/components/replay/board3d/useBoard3D.ts`

- [ ] **Step 1: Create useBoard3D.ts**

```typescript
'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Chess } from 'chess.js';
import type { Board3DHandle, PieceInstance } from './types';
import { setupScene } from './scene';
import { createBoard } from './board';
import { loadPieceGeometries, initPiecesFromFen, clearPieces, type Geometries } from './pieces';
import { animateLightningStrike, animateCapture, animateJump } from './animations';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function useBoard3D(whiteName: string, blackName: string) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<Board3DHandle>({
    applyMove: () => {},
    resetToPosition: () => {},
    highlightSquare: () => {},
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = setupScene(canvas);
    const { boardGroup } = createBoard(ctx.scene, whiteName, blackName);
    const piecesContainer = new THREE.Group();
    ctx.scene.add(piecesContainer);

    const pieceMap = new Map<string, PieceInstance>();
    let geos: Geometries = {};
    let ready = false;

    loadPieceGeometries().then(loaded => {
      geos = loaded;
      const initial = initPiecesFromFen(START_FEN, geos, piecesContainer);
      initial.forEach((v, k) => pieceMap.set(k, v));
      ready = true;
    });

    let animId: number;
    const tick = () => {
      animId = requestAnimationFrame(tick);
      ctx.controls.update();
      // Keep halos pinned to board plane while piece flies in arc
      pieceMap.forEach(inst => {
        inst.haloGroup.position.x = inst.group.position.x;
        inst.haloGroup.position.z = inst.group.position.z;
      });
      ctx.composer.render();
    };
    tick();

    handleRef.current = {
      applyMove(from, to, isCapture, _promotion) {
        if (!ready) return;
        const actor = pieceMap.get(from);
        if (!actor) return;

        animateLightningStrike(from, to, boardGroup, () => {
          const afterJump = () => {
            pieceMap.delete(from);
            actor.square = to;
            pieceMap.set(to, actor);
          };

          if (isCapture) {
            const victim = pieceMap.get(to);
            if (victim) {
              pieceMap.delete(to);
              animateCapture(victim, boardGroup, piecesContainer, () => {
                animateJump(actor, to, afterJump);
              });
            } else {
              animateJump(actor, to, afterJump);
            }
          } else {
            animateJump(actor, to, afterJump);
          }
        });
      },

      resetToPosition(fen) {
        if (!ready) return;
        clearPieces(pieceMap, piecesContainer);
        const fresh = initPiecesFromFen(fen, geos, piecesContainer);
        fresh.forEach((v, k) => pieceMap.set(k, v));
      },

      highlightSquare(square) {
        pieceMap.forEach(inst => {
          const ls = inst.group.children[0] as THREE.LineSegments | undefined;
          if (ls?.material) {
            const m = ls.material as THREE.LineBasicMaterial;
            m.color.setHex(inst.color === 'w' ? 0x00ffff : 0x22aaff);
            m.opacity = inst.color === 'w' ? 0.8 : 0.7;
          }
          inst.haloMat.opacity = 0;
          inst.haloGroup.visible = false;
        });
        if (square) {
          const inst = pieceMap.get(square);
          if (inst) {
            const ls = inst.group.children[0] as THREE.LineSegments | undefined;
            if (ls?.material) {
              const m = ls.material as THREE.LineBasicMaterial;
              m.color.setHex(0x00ffaa);
              m.opacity = 1.0;
            }
            inst.haloMat.opacity = 1;
            inst.haloGroup.visible = true;
          }
        }
      },
    };

    return () => {
      cancelAnimationFrame(animId);
      clearPieces(pieceMap, piecesContainer);
      ctx.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { canvasRef, handleRef };
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/replay/board3d/useBoard3D.ts
git commit -m "feat: add useBoard3D hook wiring scene, pieces, and animations"
```

---

## Task 9: Board3DScene.tsx — thin React wrapper

**Files:**
- Create: `apps/web/src/components/replay/Board3DScene.tsx`

- [ ] **Step 1: Create Board3DScene.tsx**

```tsx
'use client';

import { forwardRef, useImperativeHandle } from 'react';
import type { Board3DHandle } from './board3d/types';
import { useBoard3D } from './board3d/useBoard3D';

interface Board3DSceneProps {
  whiteName?: string;
  blackName?: string;
}

export const Board3DScene = forwardRef<Board3DHandle, Board3DSceneProps>(
  ({ whiteName = 'White AI', blackName = 'Black AI' }, ref) => {
    const { canvasRef, handleRef } = useBoard3D(whiteName, blackName);

    useImperativeHandle(ref, () => ({
      applyMove: (...args) => handleRef.current.applyMove(...args),
      resetToPosition: (fen) => handleRef.current.resetToPosition(fen),
      highlightSquare: (sq) => handleRef.current.highlightSquare(sq),
    }));

    return (
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
    );
  }
);

Board3DScene.displayName = 'Board3DScene';
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/replay/Board3DScene.tsx
git commit -m "feat: add Board3DScene forwardRef canvas wrapper"
```

---

## Task 10: ReplayController.tsx — wire up Board3DScene

**Files:**
- Modify: `apps/web/src/components/replay/ReplayController.tsx`

**What changes:**
1. Remove R3F imports: `Canvas` from `@react-three/fiber`; `Environment, ContactShadows, OrbitControls, PerspectiveCamera` from `@react-three/drei`; `Board3D` and `Piece3D` imports; `* as THREE` import
2. Remove `pieceComponents3D` useMemo
3. Add import: `Board3DScene` and `Board3DHandle`
4. Add refs: `board3dRef`, `prevPlyRef`
5. Add two useEffects for 3D sync
6. Replace the R3F `<Canvas>` block with `<Board3DScene>`

- [ ] **Step 1: Remove old imports and pieceComponents3D from ReplayController.tsx**

Remove lines 4–9 (the R3F/three/Board3D/Piece3D imports) and lines 112–130 (`pieceComponents3D` useMemo). Replace with:

```typescript
// add at top (line 3, after chess.js import)
import { Board3DScene } from './Board3DScene';
import type { Board3DHandle } from './board3d/types';
```

- [ ] **Step 2: Add refs and sync effects**

After the existing `const moveListRef = useRef...` line, add:

```typescript
const board3dRef = useRef<Board3DHandle>(null);
const prevPlyRef = useRef(0);
```

After the existing `useEffect` that handles `selectedGameIndex`, add these two effects:

```typescript
// Sync 3D board when ply changes
useEffect(() => {
  if (viewMode !== '3D' || !board3dRef.current) return;
  const prev = prevPlyRef.current;
  prevPlyRef.current = currentPly;

  if (currentPly === prev + 1 && currentPly > 0) {
    // Single step forward — animate
    const move = history[currentPly - 1];
    board3dRef.current.applyMove(move.from, move.to, !!move.captured, move.promotion ?? undefined);
  } else {
    // Jump or backward — instant reset
    const temp = new Chess();
    for (let i = 0; i < currentPly; i++) temp.move(history[i]);
    board3dRef.current.resetToPosition(temp.fen());
  }
}, [currentPly, viewMode, history]);

// Sync 3D board when switching to 3D view
useEffect(() => {
  if (viewMode !== '3D' || !board3dRef.current) return;
  prevPlyRef.current = currentPly;
  const temp = new Chess();
  for (let i = 0; i < currentPly; i++) temp.move(history[i]);
  board3dRef.current.resetToPosition(temp.fen());
}, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Replace the R3F Canvas block with Board3DScene**

Replace the entire `<Canvas ... </Canvas>` block (lines 185–223 in the original) with:

```tsx
<Board3DScene
  ref={board3dRef}
  whiteName={playerNames.white}
  blackName={playerNames.black}
/>
```

- [ ] **Step 4: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/replay/ReplayController.tsx
git commit -m "feat: wire Board3DScene into ReplayController, remove R3F canvas"
```

---

## Task 11: Delete old files + build

**Files:**
- Delete: `apps/web/src/components/replay/Board3D.tsx`
- Delete: `apps/web/src/components/replay/Piece3D.tsx`

- [ ] **Step 1: Delete old 3D components**

```bash
rm apps/web/src/components/replay/Board3D.tsx
rm apps/web/src/components/replay/Piece3D.tsx
```

- [ ] **Step 2: Type-check (verify no dangling imports)**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors. If errors reference Board3D or Piece3D, grep for stray imports:
```bash
grep -r "Board3D\|Piece3D" apps/web/src/
```
Fix any remaining imports.

- [ ] **Step 3: Full build**

```bash
cd /repo && npm run build
```

Expected: all packages build successfully (api tsc clean, web Next.js build clean, worker tsc clean).

- [ ] **Step 4: Run unit tests**

```bash
cd apps/web && npx vitest run
```

Expected: `5 tests passed` (squareUtils tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove legacy Board3D and Piece3D, complete 3D board upgrade"
```

---

## Self-Review

**Spec coverage:**
- ✅ Holographic wireframe neon aesthetic (WireframeGeometry + LineBasicMaterial cyan/blue)
- ✅ FBX models from reference repo downloaded to `public/pieces_fbx/`
- ✅ Bloom post-processing (UnrealBloomPass strength 0.22)
- ✅ DotMatrix shader pass
- ✅ Dot-matrix starfield background + exponential fog
- ✅ Reflection plane (additive blending, inverted clone)
- ✅ Coordinate sprites + title plates (whiteName / blackName)
- ✅ GSAP: lightning strike, capture particles, jump arc
- ✅ Backward step = instant resetToPosition (no animation)
- ✅ Board3DHandle interface exposed via forwardRef
- ✅ ReplayController wired: applyMove on forward step, resetToPosition on backward/jump
- ✅ Board3D.tsx and Piece3D.tsx deleted
- ✅ GSAP installed; vitest added for coordinate unit tests

**Type consistency check:**
- `Board3DHandle` defined in `types.ts`, used in `useBoard3D.ts`, `Board3DScene.tsx`, and `ReplayController.tsx` — consistent
- `PieceInstance.haloMat` set in `pieces.ts` (`buildHalo`), consumed in `useBoard3D.ts` and `animations.ts` — consistent
- `squareToXZ` returns `{ x, z }` — used identically in `pieces.ts` and `animations.ts` — consistent
- `Geometries` type exported from `pieces.ts`, imported in `useBoard3D.ts` — consistent
