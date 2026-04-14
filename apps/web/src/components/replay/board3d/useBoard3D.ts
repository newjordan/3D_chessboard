'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
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
