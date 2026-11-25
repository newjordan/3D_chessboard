import { setupScene } from './scene.js';
import { createBoard } from './board.js';
import { createPieces } from './pieces.js';
import { updateTimer, addMove } from './ui.js';
import { createAnimationsContext } from './animations.js';
import { showWebGLFallback, webGL2IsAvailable } from './webgl.js';
import { expandMove, haloState, resolveMove, SIMULATION_MOVES, stampLatestMove } from './logic/position.js';

const appContainer = document.getElementById('app');

if (!webGL2IsAvailable()) {
  showWebGLFallback();
} else {
  start().catch((error) => {
    console.error(error);
    showWebGLFallback();
  });
}

async function start() {
  const { scene, renderer, composer, controls } = setupScene(appContainer);
  const { boardGroup, offset } = createBoard(scene);
  const { piecesContainer, pieces, highlightPiece, unhighlightPiece } = await createPieces(scene, offset);

  const animCtx = createAnimationsContext(scene, boardGroup, piecesContainer, offset);

  function syncHalos() {
    pieces.forEach((piece) => {
      if (piece.userData.haloGroup) {
        piece.userData.haloGroup.position.x = piece.position.x;
        piece.userData.haloGroup.position.z = piece.position.z;
      }

      const halo = haloState(piece.userData.moveAge);
      if (piece.userData.haloMat) piece.userData.haloMat.opacity = halo.opacity;
      if (piece.userData.haloGroup) piece.userData.haloGroup.visible = halo.visible;
    });
  }

  renderer.setAnimationLoop(() => {
    controls.update();
    syncHalos();
    composer.render();
  });

  // `?still=1` holds the opening position. The default still plays the line.
  const autoplay = new URLSearchParams(window.location.search).get('still') !== '1';
  if (autoplay) setTimeout(nextMove, 2000);

  const moves = SIMULATION_MOVES.map(expandMove);
  let step = 0;

  function liveRecords() {
    return pieces.map((mesh) => ({
      mesh,
      type: mesh.userData.type,
      isWhite: mesh.userData.isWhite,
      rank: mesh.userData.rank,
      file: mesh.userData.file,
    }));
  }

  function nextMove() {
    if (step >= moves.length) {
      setTimeout(() => {
        console.log('Simulation complete.');
      }, 2000);
      return;
    }

    const scripted = moves[step];
    let resolved;
    try {
      resolved = resolveMove(liveRecords(), scripted);
    } catch (error) {
      console.error(error);
      step += 1;
      nextMove();
      return;
    }

    const actor = resolved.actor.mesh;
    const target = resolved.occupant ? resolved.occupant.mesh : null;

    const finishJump = () => {
      stampLatestMove(pieces.map((piece) => piece.userData), actor.userData);
      step += 1;
      setTimeout(nextMove, 800);
    };

    animCtx.animateLightningStrike(scripted.fromRank, scripted.fromFile, scripted.toRank, scripted.toFile, () => {
      if (scripted.capture && target) {
        animCtx.animateCapture(target, () => {
          const idx = pieces.indexOf(target);
          if (idx > -1) pieces.splice(idx, 1);
          animCtx.animateJump(actor, scripted.toRank, scripted.toFile, finishJump);
        });
      } else {
        animCtx.animateJump(actor, scripted.toRank, scripted.toFile, finishJump);
      }
    });
  }

  window.ChessVisualizer = {
    addMove,
    updateTimer,
    highlightPiece: (rank, file) => {
      const piece = pieces.find((item) => item.userData.rank === rank && item.userData.file === file);
      if (piece) highlightPiece(piece);
    },
    unhighlightAll: () => {
      pieces.forEach((piece) => unhighlightPiece(piece));
    },
  };

  return { scene, renderer, composer, controls };
}
