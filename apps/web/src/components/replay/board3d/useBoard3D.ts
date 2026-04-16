'use client';

import { useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import * as THREE from 'three';
import type { Board3DHandle, PieceInstance } from './types';
import { setupScene } from './scene';
import { createBoard } from './board';
import { loadPieceGeometries, initPiecesFromFen, clearPieces, type Geometries } from './pieces';
import { animateTurnDestinationPing, animateLightningStrike, animateCapture, animateJump, setReplayAnimationSpeed } from './animations';
import { squareToXZ } from './squareUtils';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function useBoard3D(whiteName: string, blackName: string) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<Board3DHandle>({
    applyMove: () => {},
    resetToPosition: () => {},
    highlightSquare: () => {},
    flashSquare: () => {},
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = setupScene(canvas);
    const { boardGroup } = createBoard(ctx.scene, whiteName, blackName);
    const piecesContainer = new THREE.Group();
    ctx.scene.add(piecesContainer);
    const effectsGroup = new THREE.Group();
    boardGroup.add(effectsGroup);

    const pieceMap = new Map<string, PieceInstance>();
    let geos: Geometries = {};
    let ready = false;
    let disposed = false;
    let queueVersion = 0;
    let logicalChess = new Chess(START_FEN);
    let pendingFen: string | null = START_FEN;
    let moveChain = Promise.resolve();
    let resolveReady: (() => void) | null = null;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    const clearEffects = () => {
      effectsGroup.traverse((child) => {
        const c = child as THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
          userData?: { spinTween?: { kill?: () => void } };
        };

        c.userData?.spinTween?.kill?.();
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach((m) => m.dispose());
        }
      });

      effectsGroup.clear();
    };

    const syncBoardToFen = (fen: string) => {
      clearEffects();
      clearPieces(pieceMap, piecesContainer);
      const fresh = initPiecesFromFen(fen, geos, piecesContainer);
      fresh.forEach((v, k) => pieceMap.set(k, v));
    };

    const setLogicalPosition = (fen: string) => {
      logicalChess = new Chess(fen);
      pendingFen = fen;

      if (!ready) return;

      syncBoardToFen(fen);
      pendingFen = null;
    };

    const isCurrentVersion = (version: number) => !disposed && version === queueVersion;

    const runMove = (
      from: string,
      to: string,
      isCapture: boolean,
      flags: string,
      promotion: string | undefined,
      speedMultiplier: number,
      version: number
    ) =>
      new Promise<void>((resolve) => {
        if (!isCurrentVersion(version) || !ready) {
          resolve();
          return;
        }

        let logicalMove: ReturnType<Chess['move']>;
        try {
          logicalMove = logicalChess.move({
            from,
            to,
            promotion: promotion?.toLowerCase() as 'q' | 'r' | 'b' | 'n' | undefined,
          });
        } catch (error) {
          console.warn(`[Board3D] Illegal move ${from}${to}; resetting visual board to the last known good position.`, error);
          syncBoardToFen(logicalChess.fen());
          resolve();
          return;
        }

        if (!logicalMove) {
          console.warn(`[Board3D] Move ${from}${to} could not be applied; resetting visual board to the last known good position.`);
          syncBoardToFen(logicalChess.fen());
          resolve();
          return;
        }

        const targetFen = logicalChess.fen();
        const shouldResyncAfterMove = Boolean(logicalMove.promotion);
        const actor = pieceMap.get(from);
        if (!actor) {
          console.warn(`[Board3D] Missing piece at ${from}; resyncing the visual board to preserve replay fidelity.`);
          syncBoardToFen(targetFen);
          resolve();
          return;
        }

        // Persistent "moving" highlight across the full move sequence.
        const actorWire = actor.group.children.find((child) => child.type === 'LineSegments') as THREE.LineSegments | undefined;
        const actorWireMat = actorWire?.material as THREE.LineBasicMaterial | undefined;
        const actorOriginalColor = actorWireMat?.color.clone();
        const actorOriginalOpacity = actorWireMat?.opacity;
        if (actorWireMat) {
          actorWireMat.color.setHex(0x7dff00);
          actorWireMat.opacity = 1;
        }
        const restoreActorHighlight = () => {
          if (!actorWireMat || !actorOriginalColor || actorOriginalOpacity == null) return;
          actorWireMat.color.copy(actorOriginalColor);
          actorWireMat.opacity = actorOriginalOpacity;
        };

        // Handle castling: teleport rook before king animation
        if (flags.includes('k') || flags.includes('q')) {
          const isKingside = flags.includes('k');
          const rank = from[1]; // '1' for white, '8' for black
          const rookFrom = (isKingside ? 'h' : 'a') + rank;
          const rookTo = (isKingside ? 'f' : 'd') + rank;
          const rook = pieceMap.get(rookFrom);
          if (rook) {
            const { x, z } = squareToXZ(rookTo);
            rook.group.position.set(x, 0, z);
            pieceMap.delete(rookFrom);
            rook.square = rookTo;
            pieceMap.set(rookTo, rook);
          }
        }

        setReplayAnimationSpeed(speedMultiplier);
        animateTurnDestinationPing(to, effectsGroup, () => {
          if (!isCurrentVersion(version)) {
            restoreActorHighlight();
            resolve();
            return;
          }

          animateLightningStrike(from, to, effectsGroup, () => {
            if (!isCurrentVersion(version)) {
              restoreActorHighlight();
              resolve();
              return;
            }

            const finishActorMove = () => {
              if (!isCurrentVersion(version)) {
                restoreActorHighlight();
                resolve();
                return;
              }
              pieceMap.delete(from);
              actor.square = to;
              pieceMap.set(to, actor);
              if (shouldResyncAfterMove) {
                syncBoardToFen(targetFen);
              }
              restoreActorHighlight();
              resolve();
            };

            if (isCapture) {
              // For en passant, the captured pawn is on the same file as `to` but same rank as `from`
              const capturedSquare = flags.includes('e') ? to[0] + from[1] : to;
              const victim = pieceMap.get(capturedSquare);
              if (victim && capturedSquare !== to) pieceMap.delete(capturedSquare);
              if (victim) {
                pieceMap.delete(to);
                animateCapture(victim, effectsGroup, piecesContainer, () => {
                  if (!isCurrentVersion(version)) {
                    resolve();
                    return;
                  }
                  animateJump(actor, to, effectsGroup, finishActorMove);
                });
              } else {
                animateJump(actor, to, effectsGroup, finishActorMove);
              }
            } else {
              animateJump(actor, to, effectsGroup, finishActorMove);
            }
          });
        });
      });

    loadPieceGeometries().then(loaded => {
      if (disposed) return;
      geos = loaded;
      ready = true;
      syncBoardToFen(pendingFen ?? START_FEN);
      pendingFen = null;
      resolveReady?.();
      resolveReady = null;
    }).catch((error) => {
      if (disposed) return;
      console.warn('[Board3D] Geometry load failed; using fallback wireframes only.', error);
      ready = true;
      syncBoardToFen(pendingFen ?? START_FEN);
      pendingFen = null;
      resolveReady?.();
      resolveReady = null;
    });

    let animId: number;
    const tick = () => {
      animId = requestAnimationFrame(tick);
      ctx.controls.update();
      pieceMap.forEach(inst => {
        inst.haloGroup.position.x = inst.group.position.x;
        inst.haloGroup.position.z = inst.group.position.z;
      });
      ctx.composer.render();
    };
    tick();

    handleRef.current = {
      applyMove(from, to, isCapture, flags, _promotion, speedMultiplier = 1) {
        const version = queueVersion;
        moveChain = moveChain
          .catch(() => undefined)
          .then(async () => {
            await readyPromise;
            return runMove(from, to, isCapture, flags, _promotion, speedMultiplier, version);
          });
      },

      resetToPosition(fen) {
        queueVersion += 1;
        moveChain = Promise.resolve();
        setLogicalPosition(fen);
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

      flashSquare(square) {
        if (!ready || disposed) return;
        const normalized = square.trim().toLowerCase();
        if (!/^[a-h][1-8]$/.test(normalized)) return;
        setReplayAnimationSpeed(1);
        animateTurnDestinationPing(normalized, effectsGroup, () => {});
      },
    };

    return () => {
      disposed = true;
      queueVersion += 1;
      cancelAnimationFrame(animId);
      clearEffects();
      clearPieces(pieceMap, piecesContainer);
      ctx.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { canvasRef, handleRef };
}
