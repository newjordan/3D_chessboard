import { fromAlgebraic, toAlgebraic } from './coordinates.js';

const BACK_RANK = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

/** Opacities for the ground halo on the four most recent moves. */
export const HALO_OPACITIES = [1, 0.5, 0.2, 0.05];

/**
 * Opening arrangement. Index 0 is Black's back rank.
 * White pieces occupy ranks whose index is greater than 4.
 */
export function startingSetup() {
  const empty = () => Array(8).fill(null);
  const pawns = () => Array(8).fill('P');
  const back = () => BACK_RANK.slice();
  return [back(), pawns(), empty(), empty(), empty(), empty(), pawns(), back()];
}

export function isWhiteRank(rank) {
  return rank > 4;
}

export function createInitialPosition() {
  const setup = startingSetup();
  const pieces = [];
  for (let rank = 0; rank < setup.length; rank += 1) {
    for (let file = 0; file < setup[rank].length; file += 1) {
      const type = setup[rank][file];
      if (!type) continue;
      pieces.push({
        type,
        isWhite: isWhiteRank(rank),
        rank,
        file,
      });
    }
  }
  return pieces;
}

export function findPiece(pieces, rank, file) {
  return pieces.find((piece) => piece.rank === rank && piece.file === file) ?? null;
}

/**
 * The demonstration line, written in the same coordinates as the original
 * script: e2-e4, e7-e5, Ng1-f3, d7-d5, e4xd5, d8xd5.
 */
export const SIMULATION_MOVES = [
  { from: 'e2', to: 'e4', capture: false },
  { from: 'e7', to: 'e5', capture: false },
  { from: 'g1', to: 'f3', capture: false },
  { from: 'd7', to: 'd5', capture: false },
  { from: 'e4', to: 'd5', capture: true },
  { from: 'd8', to: 'd5', capture: true },
];

export function expandMove(move) {
  const from = fromAlgebraic(move.from);
  const to = fromAlgebraic(move.to);
  return {
    from: fromAlgebraicToCanonical(move.from),
    to: fromAlgebraicToCanonical(move.to),
    capture: Boolean(move.capture),
    fromRank: from.rank,
    fromFile: from.file,
    toRank: to.rank,
    toFile: to.file,
  };
}

function fromAlgebraicToCanonical(square) {
  const { rank, file } = fromAlgebraic(square);
  return toAlgebraic(rank, file);
}

/**
 * Check that a move can be played on this board.
 * A quiet move must land on an empty square. A capture must land on an
 * enemy piece. The mover has to be standing on the origin square.
 */
export function resolveMove(pieces, move) {
  const actor = findPiece(pieces, move.fromRank, move.fromFile);
  const fromName = toAlgebraic(move.fromRank, move.fromFile);
  const toName = toAlgebraic(move.toRank, move.toFile);

  if (!actor) {
    throw new Error(`No piece on ${fromName}`);
  }

  const occupant = findPiece(pieces, move.toRank, move.toFile);

  if (move.capture) {
    if (!occupant) {
      throw new Error(`Capture ${fromName}x${toName} has no target`);
    }
    if (occupant === actor) {
      throw new Error(`Piece on ${fromName} cannot capture itself`);
    }
    if (occupant.isWhite === actor.isWhite) {
      throw new Error(`Piece on ${fromName} cannot capture its own piece on ${toName}`);
    }
  } else if (occupant) {
    throw new Error(`Quiet move ${fromName}-${toName} lands on an occupied square`);
  }

  return { actor, occupant };
}

/**
 * Age the move trail the way the animation does: every piece that has
 * already moved steps one generation back, then the mover is stamped as
 * the most recent.
 */
export function stampLatestMove(records, actor) {
  for (const record of records) {
    if (record.moveAge !== undefined) record.moveAge += 1;
  }
  actor.moveAge = 0;
}

export function haloState(moveAge) {
  if (moveAge !== undefined && moveAge >= 0 && moveAge < HALO_OPACITIES.length) {
    return { opacity: HALO_OPACITIES[moveAge], visible: true };
  }
  return { opacity: 0, visible: false };
}

export function placePiece(piece, rank, file) {
  piece.rank = rank;
  piece.file = file;
  return piece;
}

/**
 * Play one move. Returns a new piece list and does not mutate the input.
 * The captured piece is removed before move ages are advanced.
 */
export function applyMove(pieces, move) {
  const expanded = move.fromRank === undefined ? expandMove(move) : move;
  const { actor, occupant } = resolveMove(pieces, expanded);
  const next = [];

  for (const piece of pieces) {
    if (piece === occupant) continue;
    if (piece === actor) {
      next.push({
        ...piece,
        rank: expanded.toRank,
        file: expanded.toFile,
        moveAge: 0,
      });
    } else if (piece.moveAge !== undefined) {
      next.push({ ...piece, moveAge: piece.moveAge + 1 });
    } else {
      next.push({ ...piece });
    }
  }

  return next;
}

export function playLine(moves, pieces = createInitialPosition()) {
  return moves.reduce((board, move) => applyMove(board, move), pieces);
}

/**
 * History text used by the demonstration.
 * Quiet moves keep a piece letter for anything except a pawn (`e2-e4`, `Ng1-f3`).
 * Captures use the square form (`e4xd5`, `d8xd5`).
 */
export function formatMove(piece, move) {
  const expanded = move.fromRank === undefined ? expandMove(move) : move;
  const from = toAlgebraic(expanded.fromRank, expanded.fromFile);
  const to = toAlgebraic(expanded.toRank, expanded.toFile);
  if (expanded.capture) return `${from}x${to}`;
  const letter = piece.type === 'P' ? '' : piece.type;
  return `${letter}${from}-${to}`;
}
