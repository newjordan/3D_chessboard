# 3D Board Upgrade Design

**Date:** 2026-04-14  
**Status:** Approved  
**Scope:** Upgrade the existing 3D replay board in `apps/web` to the holographic wireframe neon aesthetic from the reference repo (`newjordan/3D_chessboard`), using vanilla Three.js mounted via a React hook.

---

## Approach

Vanilla Three.js scene mounted into a `<canvas>` via `useEffect`, not R3F. This keeps GSAP timelines operating directly on Three.js objects without fighting R3F's render loop, and lets us port the reference code with minimal translation.

The existing `Board3D.tsx` and `Piece3D.tsx` are deleted. `ReplayController.tsx` is minimally changed — it swaps `<Board3D>` for `<Board3DScene>` and calls `applyMove()` on a forwarded ref when the user steps through moves.

---

## File Structure

```
apps/web/
  public/
    pieces_fbx/
      bishop.fbx
      king.fbx
      knight.fbx
      pawn.fbx
      queen.fbx
      rook.fbx
      (+ PNG textures)
  src/components/replay/
    Board3D.tsx           ← DELETE
    Piece3D.tsx           ← DELETE
    board3d/
      useBoard3D.ts       ← hook: mounts/destroys vanilla Three.js scene, exposes applyMove
      scene.ts            ← renderer, camera, OrbitControls, EffectComposer (bloom + dot-matrix)
      board.ts            ← grid lines, rim, reflection plane, coordinate sprites, starfield, fog
      pieces.ts           ← FBXLoader, geometry normalization, wireframe neon materials, halos
      animations.ts       ← GSAP timelines: animateJump, animateCapture, animateLightningStrike
    Board3DScene.tsx      ← thin React wrapper: <canvas ref> + ResizeObserver, forwards applyMove ref
    ReplayController.tsx  ← swap <Board3D> for <Board3DScene>, call board3dRef.current.applyMove()
```

---

## Data Flow

1. `ReplayController` holds `board3dRef = useRef<Board3DHandle>(null)`.
2. On mount, `Board3DScene` initializes the scene from the starting FEN position — places all 32 pieces at their starting squares in the internal piece map (`square → Object3D`).
3. When the user steps **forward**, `ReplayController` calls `board3dRef.current.applyMove(from, to, isCapture, promotionPiece)`. This triggers the GSAP animation sequence.
4. When the user steps **backward**, animation is skipped — pieces are teleported to correct positions by rebuilding from the FEN snapshot at `currentMoveIndex - 1`.
5. `ReplayController` retains all chess logic (chess.js instance, move history, FEN snapshots). The 3D scene is purely display.

### `Board3DHandle` interface

```ts
interface Board3DHandle {
  applyMove(from: string, to: string, isCapture: boolean, promotion?: string): void;
  resetToPosition(fen: string): void;
  highlightSquare(square: string | null): void;
}
```

---

## Visual Details

### Board
- 8×8 grid rendered as `LineSegments` in cyan (`0x00ffff`) with `LineBasicMaterial`
- Double outer border lines, rim pillars for 3D depth
- Reflection plane below board: inverted clone of grid, additive blending, faded opacity
- Coordinate sprites A–H / 1–8: canvas-rendered text via `SpriteMaterial`
- Title plates: "CHALLENGER" / "DEFENDER" (populated from match data passed as props)
- Move highlight: green circle marker + dashed bracket corners at from/to squares

### Pieces
- Loaded via `FBXLoader` from `/pieces_fbx/` (6 models)
- Geometry normalization: bounding box computed, longest axis → upright, Y-translated to sit on board
- Material: `LineSegments` with `EdgesGeometry`
  - White side: cyan `0x00ffff`, opacity 0.8
  - Black side: `0x22aaff`, opacity 0.7
  - Highlighted: `0x00ffaa`, opacity 1.0
- Halo: invisible double-ring per piece, activates on highlight

### Post-processing
- `EffectComposer` → `RenderPass` → `UnrealBloomPass` (strength 0.22) → `DotMatrixShader` pass
- `DotMatrixShader`: "tech fuzz" grid overlay, ported verbatim from reference repo

### Camera & Scene
- Perspective camera at `(0, 12, 16)`, looking at origin
- `OrbitControls` with damping, polar angle clamped to prevent below-board view
- Min/max distance: 8–20
- Background: BufferGeometry dot-matrix starfield (grid step 4.0, excluding center sphere r=12)
- Exponential fog

---

## Animations (GSAP)

All ported from `animations.js` in the reference repo. GSAP is a new dependency.

| Animation | Trigger | Duration | Description |
|---|---|---|---|
| `animateLightningStrike(from, to)` | Every forward move | ~1.2s | Bracket energy compression at origin → grid crawl shader trace → bracket explosion at destination |
| `animateCapture(square)` | Forward move that is a capture | ~0.8s | Expanding border → ghost ring → piece turns red + falls with clipping plane → scatter particles |
| `animateJump(piece, to)` | Every forward move | ~0.6s | Horizontal `power1.inOut` + vertical arc `power1.out` yoyo bounce |

Sequence: `animateLightningStrike` → `animateCapture` (if capture) → `animateJump`.

Backward step: no animation, instant `resetToPosition(fen)`.

---

## Dependencies

| Package | Change |
|---|---|
| `gsap` | New install in `apps/web` |
| `three` | Already installed (^0.183.2) — `FBXLoader`, `EffectComposer`, `UnrealBloomPass` come from `three/examples/jsm` |
| `@react-three/fiber`, `@react-three/drei` | Remain installed (used by other components if any) but not used by the new board |

---

## What Gets Deleted

- `apps/web/src/components/replay/Board3D.tsx`
- `apps/web/src/components/replay/Piece3D.tsx`

---

## Out of Scope

- 2D board (`Board2D.tsx`) — untouched
- Engine detail page — no board rendered there
- Landing page showcase (`ShowcaseReplay.tsx`) — uses 2D, untouched
- Multiplayer/live game view — not in scope
