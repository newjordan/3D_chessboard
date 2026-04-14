import * as THREE from 'three';
import { setupScene } from './scene.js';
import { createBoard } from './board.js';
import { createPieces } from './pieces.js';
import { updateTimer, addMove } from './ui.js';
import { createAnimationsContext } from './animations.js';

const appContainer = document.getElementById('app');

const { scene, camera, renderer, composer, controls } = setupScene(appContainer);
const { boardGroup, squareSize, offset, update: updateBoardTracers } = createBoard(scene);
const { piecesContainer, pieces, highlightPiece, unhighlightPiece } = await createPieces(scene, offset);

const animCtx = createAnimationsContext(scene, boardGroup, piecesContainer, offset);

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  controls.update();

  if (updateBoardTracers) updateBoardTracers(delta);

  // Pulse effect on highlighted pieces halo
  pieces.forEach(p => {
    if (p.userData.haloMat && p.userData.haloMat.opacity > 0) {
      p.userData.haloMat.opacity = 0.5 + 0.5 * Math.sin(time * 6);
    }
  });

  composer.render();
}

animate();

// Simulate some game action after 2 seconds for visual testing
setTimeout(() => {
  addMove(3, 'Na3', 'xa3'); // Mock move
  
  // Grab White Knight (Rank 7, File 1 OR 6, let's just find one)
  const knight = pieces.find(p => p.userData.type === 'N' && p.userData.isWhite);
  // Grab Black Pawn (Rank 1, File 0 or 1 or whatever)
  const pawn = pieces.find(p => p.userData.type === 'P' && !p.userData.isWhite);

  if (knight && pawn) {
    animCtx.animateLightningStrike(knight.userData.rank, knight.userData.file, pawn.userData.rank, pawn.userData.file, () => {
      animCtx.animateJump(knight, pawn.userData.rank, pawn.userData.file, () => {
        animCtx.animateCapture(pawn);
      });
    });
  }
  
}, 3000);

// Expose API module
window.ChessVisualizer = {
  addMove,
  updateTimer,
  highlightPiece: (rank, file) => {
    const p = pieces.find(p => p.userData.rank === rank && p.userData.file === file);
    if (p) highlightPiece(p);
  },
  unhighlightAll: () => {
    pieces.forEach(p => unhighlightPiece(p));
  }
};
