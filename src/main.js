import * as THREE from 'three';
import { setupScene } from './scene.js';
import { createBoard } from './board.js';
import { createPieces } from './pieces.js';
import { updateTimer, addMove } from './ui.js';
import { createAnimationsContext } from './animations.js';

const appContainer = document.getElementById('app');

const { scene, camera, renderer, composer, controls } = setupScene(appContainer);
const { boardGroup, squareSize, offset } = createBoard(scene);
const { piecesContainer, pieces, highlightPiece, unhighlightPiece } = await createPieces(scene, offset);

const animCtx = createAnimationsContext(scene, boardGroup, piecesContainer, offset);

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
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

// Automated Simulation Sequence
const moves = [
  // White Pawn e2-e4
  { fR: 6, fF: 4, tR: 4, tF: 4, isCapture: false },
  // Black Pawn e7-e5
  { fR: 1, fF: 4, tR: 3, tF: 4, isCapture: false },
  // White Knight g1-f3
  { fR: 7, fF: 6, tR: 5, tF: 5, isCapture: false },
  // Black Pawn d7-d5
  { fR: 1, fF: 3, tR: 3, tF: 3, isCapture: false },
  // White Pawn e4xd5 (Capture)
  { fR: 4, fF: 4, tR: 3, tF: 3, isCapture: true },
  // Black Queen d8xd5 (Capture)
  { fR: 0, fF: 3, tR: 3, tF: 3, isCapture: true }
];

let step = 0;

function nextMove() {
  if (step >= moves.length) {
     setTimeout(() => {
        // Reset or just stop
        console.log("Simulation complete.");
     }, 2000);
     return;
  }
  
  const m = moves[step];
  const actor = pieces.find(p => p.userData.rank === m.fR && p.userData.file === m.fF);
  const target = pieces.find(p => p.userData.rank === m.tR && p.userData.file === m.tF);
  
  if (!actor) {
    console.error("Actor not found for move", m);
    step++;
    nextMove();
    return;
  }

  // 1. Board calculates path
  animCtx.animateLightningStrike(m.fR, m.fF, m.tR, m.tF, () => {
     if (m.isCapture && target) {
        // 2. Destroy victim if capture
        animCtx.animateCapture(target, () => {
           // Remove from local tracked array
           const idx = pieces.indexOf(target);
           if(idx > -1) pieces.splice(idx, 1);
           
           // 3. Jump to location
           animCtx.animateJump(actor, m.tR, m.tF, () => {
              step++;
              setTimeout(nextMove, 800); // Wait 0.8s before next sequence
           });
        });
     } else {
        // 2. Just jump to location
        animCtx.animateJump(actor, m.tR, m.tF, () => {
           step++;
           setTimeout(nextMove, 800); 
        });
     }
  });
}

// Start simulation sequence after 2s
setTimeout(nextMove, 2000);

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
