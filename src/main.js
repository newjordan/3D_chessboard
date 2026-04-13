import * as THREE from 'three';
import { setupScene } from './scene.js';
import { createBoard } from './board.js';
import { createPieces } from './pieces.js';
import { updateTimer, addMove } from './ui.js';

const appContainer = document.getElementById('app');

const { scene, camera, renderer, composer, controls } = setupScene(appContainer);
const { boardGroup, squareSize, offset } = createBoard(scene);
const { piecesContainer, pieces, highlightPiece, unhighlightPiece } = await createPieces(scene, offset);

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  controls.update();

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
  addMove(3, 'Bb5', 'a6');
  
  // Highlight a piece representing a move
  const king = pieces.find(p => p.userData.type === 'K' && p.userData.isWhite);
  if (king) highlightPiece(king);
  
}, 2000);

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
