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
      flashSquare: (sq) => handleRef.current.flashSquare(sq),
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
