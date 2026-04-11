import { readFileSync } from 'node:fs';

// Files on a chess board are the columns a through h. This string lets us
// convert back and forth between algebraic squares like "e4" and numeric
// indexes in the 64-element board array used below.
const FILES = 'abcdefgh';

// Convert a square such as "e4" into an array index from 0 to 63.
// Index 0 is a8, index 7 is h8, and index 63 is h1.
function squareToIndex(square) {
  const file = FILES.indexOf(square[0]);
  const rank = 8 - Number(square[1]);
  return rank * 8 + file;
}

// Convert a 0..63 board index back into a UCI/algebraic square name.
function indexToSquare(index) {
  const rank = Math.floor(index / 8);
  const file = index % 8;
  return `${FILES[file]}${8 - rank}`;
}

// Pieces are stored as FEN characters: uppercase means white, lowercase means
// black, and "." means the square is empty.
function colorOf(piece) {
  if (!piece || piece === '.') return null;
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

// Convenience helper for toggling the side to move after a move is applied.
function opposite(side) {
  return side === 'w' ? 'b' : 'w';
}

// The board is a flat array, so a shallow copy is enough when making a new
// position to test a candidate move.
function cloneBoard(board) {
  return board.slice();
}

// Parse the FEN string supplied on stdin into the position object used by the
// rest of this file. Only the fields needed to generate legal moves are stored.
function parseFen(fen) {
  const [placement, side, castling, ep, halfmove, fullmove] = fen.trim().split(/\s+/);
  const board = [];
  for (const row of placement.split('/')) {
    for (const ch of row) {
      if (/\d/.test(ch)) board.push(...'.'.repeat(Number(ch)));
      else board.push(ch);
    }
  }
  return {
    board,
    side: side || 'w',
    castling: castling && castling !== '-' ? castling : '-',
    enPassant: ep || '-',
    halfmove: Number(halfmove || 0),
    fullmove: Number(fullmove || 1),
  };
}

// Castling rights sometimes become an empty string after a move removes the
// final available right. These helpers keep the conventional "-" placeholder.
function stripCastling(castling) {
  return castling.replace(/-/g, '');
}

function normalizeCastling(castling) {
  const out = stripCastling(castling);
  return out || '-';
}

// Board coordinates are represented as row/column pairs while generating
// moves. This helper prevents accidental wraparound at the board edges.
function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

// Return true if the square at sqIdx is attacked by the given side. This is
// used for check detection and to make sure castling does not pass through
// check. It checks each piece family using the way that piece attacks.
function isSquareAttacked(pos, sqIdx, by) {
  const tr = Math.floor(sqIdx / 8);
  const tc = sqIdx % 8;

  // Pawns attack diagonally forward from their own perspective, so from the
  // target square we look one rank "behind" the attacking pawns.
  const pawnRow = by === 'w' ? tr + 1 : tr - 1;
  for (const dc of [-1, 1]) {
    const c = tc + dc;
    if (!inBounds(pawnRow, c)) continue;
    const p = pos.board[pawnRow * 8 + c];
    if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'p') return true;
  }

  // Knights attack in L-shapes and can jump over pieces.
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const r = tr + dr, c = tc + dc;
    if (!inBounds(r, c)) continue;
    const p = pos.board[r * 8 + c];
    if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'n') return true;
  }

  // Bishops and queens attack along diagonals until a piece blocks the ray.
  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    let r = tr + dr, c = tc + dc;
    while (inBounds(r, c)) {
      const p = pos.board[r * 8 + c];
      if (p !== '.') {
        if (colorOf(p) === by && ['b', 'q'].includes(p.toLowerCase())) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  // Rooks and queens attack along ranks/files until a piece blocks the ray.
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let r = tr + dr, c = tc + dc;
    while (inBounds(r, c)) {
      const p = pos.board[r * 8 + c];
      if (p !== '.') {
        if (colorOf(p) === by && ['r', 'q'].includes(p.toLowerCase())) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  // Kings attack the eight neighboring squares.
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    const r = tr + dr, c = tc + dc;
    if (!inBounds(r, c)) continue;
    const p = pos.board[r * 8 + c];
    if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'k') return true;
  }
  return false;
}

// A side is in check if its king exists and the opponent attacks that square.
// If no king is found, treat the position as invalid/check so it is rejected.
function isKingInCheck(pos, side) {
  const kingIdx = pos.board.findIndex((p) => p !== '.' && colorOf(p) === side && p.toLowerCase() === 'k');
  if (kingIdx < 0) return true;
  return isSquareAttacked(pos, kingIdx, opposite(side));
}

// Small helper used by castling validation.
function hasPiece(pos, sq, piece) {
  return pos.board[squareToIndex(sq)] === piece;
}

// Castling is legal only when the right exists, the king/rook are still on
// their starting squares, the path is empty, the king is not currently in
// check, and the king does not cross or land on an attacked square.
function canCastle(pos, side, kind) {
  const rights = stripCastling(pos.castling);
  const kingSq = side === 'w' ? 'e1' : 'e8';
  const rookSq = side === 'w' ? (kind === 'king' ? 'h1' : 'a1') : (kind === 'king' ? 'h8' : 'a8');
  const between = side === 'w'
    ? (kind === 'king' ? ['f1', 'g1'] : ['d1', 'c1', 'b1'])
    : (kind === 'king' ? ['f8', 'g8'] : ['d8', 'c8', 'b8']);
  const pass = side === 'w'
    ? (kind === 'king' ? ['f1', 'g1'] : ['d1', 'c1'])
    : (kind === 'king' ? ['f8', 'g8'] : ['d8', 'c8']);
  const right = side === 'w' ? (kind === 'king' ? 'K' : 'Q') : (kind === 'king' ? 'k' : 'q');
  const kingPiece = side === 'w' ? 'K' : 'k';
  const rookPiece = side === 'w' ? 'R' : 'r';
  if (!rights.includes(right)) return false;
  if (!hasPiece(pos, kingSq, kingPiece) || !hasPiece(pos, rookSq, rookPiece)) return false;
  if (isKingInCheck(pos, side)) return false;
  for (const sq of between) {
    if (pos.board[squareToIndex(sq)] !== '.') return false;
  }
  for (const sq of pass) {
    if (isSquareAttacked(pos, squareToIndex(sq), opposite(side))) return false;
  }
  return true;
}

// Apply a move to produce a new position. This function handles all state that
// affects future move generation: captures, promotion, en passant, castling,
// halfmove/fullmove counters, castling rights, and side-to-move changes.
function applyMove(pos, move) {
  const next = {
    board: cloneBoard(pos.board),
    side: opposite(pos.side),
    castling: stripCastling(pos.castling),
    enPassant: '-',
    halfmove: pos.halfmove + 1,
    fullmove: pos.fullmove + (pos.side === 'b' ? 1 : 0),
  };

  const from = squareToIndex(move.from);
  const to = squareToIndex(move.to);
  const piece = next.board[from];
  const target = next.board[to];
  const lower = piece.toLowerCase();

  next.board[from] = '.';

  // En passant captures a pawn that is not on the destination square.
  if (lower === 'p' && move.to === pos.enPassant && target === '.') {
    const captureIdx = to + (pos.side === 'w' ? 8 : -8);
    next.board[captureIdx] = '.';
  }

  // Castling moves the rook in addition to the king.
  if (lower === 'k' && Math.abs(to - from) === 2) {
    if (move.to === 'g1') {
      next.board[squareToIndex('f1')] = next.board[squareToIndex('h1')];
      next.board[squareToIndex('h1')] = '.';
    } else if (move.to === 'c1') {
      next.board[squareToIndex('d1')] = next.board[squareToIndex('a1')];
      next.board[squareToIndex('a1')] = '.';
    } else if (move.to === 'g8') {
      next.board[squareToIndex('f8')] = next.board[squareToIndex('h8')];
      next.board[squareToIndex('h8')] = '.';
    } else if (move.to === 'c8') {
      next.board[squareToIndex('d8')] = next.board[squareToIndex('a8')];
      next.board[squareToIndex('a8')] = '.';
    }
  }

  // Promotions replace the pawn with the selected piece. The generator uses
  // lowercase promotion letters because UCI writes promotions as e7e8q.
  next.board[to] = move.promotion
    ? (pos.side === 'w' ? move.promotion.toUpperCase() : move.promotion.toLowerCase())
    : piece;

  // Reset the halfmove clock after pawn moves or captures, and record the en
  // passant target square after a two-square pawn push.
  if (lower === 'p' || target !== '.' || (lower === 'p' && move.to === pos.enPassant)) next.halfmove = 0;
  if (lower === 'p' && Math.abs(to - from) === 16) {
    next.enPassant = indexToSquare((from + to) / 2);
  }

  // Moving a king or rook removes the matching castling rights.
  if (lower === 'k') {
    next.castling = next.castling.replace(pos.side === 'w' ? /[KQ]/g : /[kq]/g, '');
  }
  if (lower === 'r') {
    if (from === squareToIndex('a1')) next.castling = next.castling.replace('Q', '');
    if (from === squareToIndex('h1')) next.castling = next.castling.replace('K', '');
    if (from === squareToIndex('a8')) next.castling = next.castling.replace('q', '');
    if (from === squareToIndex('h8')) next.castling = next.castling.replace('k', '');
  }
  // Capturing a rook on its starting square also removes that side's right.
  if (target.toLowerCase() === 'r') {
    if (to === squareToIndex('a1')) next.castling = next.castling.replace('Q', '');
    if (to === squareToIndex('h1')) next.castling = next.castling.replace('K', '');
    if (to === squareToIndex('a8')) next.castling = next.castling.replace('q', '');
    if (to === squareToIndex('h8')) next.castling = next.castling.replace('k', '');
  }

  next.castling = normalizeCastling(next.castling);
  return next;
}

// Generate moves that follow each piece's movement rules. These are called
// "pseudo-legal" because some of them may leave the moving side in check; the
// legalMoves function below filters those out by applying each move.
function pseudoLegalMoves(pos) {
  const moves = [];
  const side = pos.side;
  const push = (m) => moves.push(m);

  for (let i = 0; i < 64; i++) {
    const piece = pos.board[i];
    if (piece === '.' || colorOf(piece) !== side) continue;
    const r = Math.floor(i / 8), c = i % 8;
    const lower = piece.toLowerCase();

    // Pawns move forward, capture diagonally, can advance two squares from the
    // starting rank, can promote, and can capture en passant.
    if (lower === 'p') {
      const dir = side === 'w' ? -1 : 1;
      const startRank = side === 'w' ? 6 : 1;
      const promoRank = side === 'w' ? 0 : 7;
      const oneR = r + dir;
      if (inBounds(oneR, c) && pos.board[oneR * 8 + c] === '.') {
        const to = oneR * 8 + c;
        if (oneR === promoRank) ['q', 'r', 'b', 'n'].forEach((p) => push({ from: indexToSquare(i), to: indexToSquare(to), promotion: p }));
        else push({ from: indexToSquare(i), to: indexToSquare(to) });
        const twoR = r + dir * 2;
        if (r === startRank && inBounds(twoR, c) && pos.board[twoR * 8 + c] === '.') push({ from: indexToSquare(i), to: indexToSquare(twoR * 8 + c) });
      }
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const to = nr * 8 + nc;
        const target = pos.board[to];
        const targetSq = indexToSquare(to);
        if (targetSq === pos.enPassant || (target !== '.' && colorOf(target) !== side)) {
          if (nr === promoRank) ['q', 'r', 'b', 'n'].forEach((p) => push({ from: indexToSquare(i), to: targetSq, promotion: p }));
          else push({ from: indexToSquare(i), to: targetSq });
        }
      }
      continue;
    }

    // Sliding pieces reuse the same ray-walking helper. They keep moving in a
    // direction until they leave the board or run into a blocker.
    const addSlides = (dirs) => {
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
          const target = pos.board[nr * 8 + nc];
          if (target === '.') push({ from: indexToSquare(i), to: indexToSquare(nr * 8 + nc) });
          else {
            if (colorOf(target) !== side) push({ from: indexToSquare(i), to: indexToSquare(nr * 8 + nc) });
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    };

    // Knights jump to their eight possible L-shaped target squares.
    if (lower === 'n') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const target = pos.board[nr * 8 + nc];
        if (target === '.' || colorOf(target) !== side) push({ from: indexToSquare(i), to: indexToSquare(nr * 8 + nc) });
      }
    } else if (lower === 'b') addSlides([[-1,-1],[-1,1],[1,-1],[1,1]]);
    else if (lower === 'r') addSlides([[-1,0],[1,0],[0,-1],[0,1]]);
    else if (lower === 'q') addSlides([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    else if (lower === 'k') {
      // Kings move one square in any direction, plus optional castling moves.
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const target = pos.board[nr * 8 + nc];
        if (target === '.' || colorOf(target) !== side) push({ from: indexToSquare(i), to: indexToSquare(nr * 8 + nc) });
      }
      if (canCastle(pos, side, 'king')) push({ from: indexToSquare(i), to: side === 'w' ? 'g1' : 'g8' });
      if (canCastle(pos, side, 'queen')) push({ from: indexToSquare(i), to: side === 'w' ? 'c1' : 'c8' });
    }
  }

  return moves;
}

// Keep only moves that do not leave the moving side's own king in check.
function legalMoves(pos) {
  return pseudoLegalMoves(pos).filter((m) => !isKingInCheck(applyMove(pos, m), pos.side));
}

// UCI move format is source square + target square + optional promotion piece.
// Examples: e2e4, g1f3, e7e8q.
function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

// Deterministic hash used to pick a move without randomness. Determinism matters
// because the same FEN input must always produce the same output.
function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Mirror a board index vertically so black pieces can share the same
// piece-square tables used for white pieces.
function mirrorIndex(index) {
  const rank = Math.floor(index / 8);
  const file = index % 8;
  return (7 - rank) * 8 + file;
}

const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const PAWN_PST = [
    0,   0,   0,   0,   0,   0,   0,   0,
   50,  50,  50,  50,  50,  50,  50,  50,
   10,  10,  20,  30,  30,  20,  10,  10,
    5,   5,  10,  25,  25,  10,   5,   5,
    0,   0,   0,  20,  20,   0,   0,   0,
    5,  -5, -10,   0,   0, -10,  -5,   5,
    5,  10,  10, -20, -20,  10,  10,   5,
    0,   0,   0,   0,   0,   0,   0,   0,
];

const KNIGHT_PST = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20,   0,   5,   5,   0, -20, -40,
  -30,   5,  10,  15,  15,  10,   5, -30,
  -30,   0,  15,  20,  20,  15,   0, -30,
  -30,   5,  15,  20,  20,  15,   5, -30,
  -30,   0,  10,  15,  15,  10,   0, -30,
  -40, -20,   0,   0,   0,   0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

const BISHOP_PST = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10,   5,   0,   0,   0,   0,   5, -10,
  -10,  10,  10,  10,  10,  10,  10, -10,
  -10,   0,  10,  10,  10,  10,   0, -10,
  -10,   5,   5,  10,  10,   5,   5, -10,
  -10,   0,   5,  10,  10,   5,   0, -10,
  -10,   0,   0,   0,   0,   0,   0, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

const ROOK_PST = [
    0,   0,   5,  10,  10,   5,   0,   0,
   -5,   0,   0,   0,   0,   0,   0,  -5,
   -5,   0,   0,   0,   0,   0,   0,  -5,
   -5,   0,   0,   0,   0,   0,   0,  -5,
   -5,   0,   0,   0,   0,   0,   0,  -5,
   -5,   0,   0,   0,   0,   0,   0,  -5,
    5,  10,  10,  10,  10,  10,  10,   5,
    0,   0,   0,   0,   0,   0,   0,   0,
];

const QUEEN_PST = [
  -20, -10, -10,  -5,  -5, -10, -10, -20,
  -10,   0,   0,   0,   0,   0,   0, -10,
  -10,   0,   5,   5,   5,   5,   0, -10,
   -5,   0,   5,   5,   5,   5,   0,  -5,
    0,   0,   5,   5,   5,   5,   0,  -5,
  -10,   5,   5,   5,   5,   5,   0, -10,
  -10,   0,   5,   0,   0,   0,   0, -10,
  -20, -10, -10,  -5,  -5, -10, -10, -20,
];

const KING_MID_PST = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
   20,  20,   0,   0,   0,   0,  20,  20,
   20,  30,  10,   0,   0,  10,  30,  20,
];

const KING_END_PST = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10,   0,   0, -10, -20, -30,
  -30, -10,  20,  30,  30,  20, -10, -30,
  -30, -10,  30,  40,  40,  30, -10, -30,
  -30, -10,  30,  40,  40,  30, -10, -30,
  -30, -10,  20,  30,  30,  20, -10, -30,
  -30, -30,   0,   0,   0,   0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

const PIECE_SQUARE_TABLES = {
  p: PAWN_PST,
  n: KNIGHT_PST,
  b: BISHOP_PST,
  r: ROOK_PST,
  q: QUEEN_PST,
};

const MATE_SCORE = 1000000;
const SEARCH_TIMEOUT = Symbol('search-timeout');
const TT_SIZE = 1 << 15;
const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;
const TT_MATE_BOUND = MATE_SCORE - 10000;

const OPENING_BOOK = new Map([
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 'e2e4'],
  ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'e7e5'],
  ['rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -', 'd7d5'],
  ['rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -', 'e7e5'],
  ['rnbqkbnr/pppppppp/8/8/5N2/8/PPPPPPPP/RNBQKB1R b KQkq -', 'd7d5'],
  ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'g1f3'],
  ['rnbqkbnr/pppppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'g1f3'],
  ['rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', 'c2c4'],
  ['rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -', 'b8c6'],
  ['rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', 'c2c4'],
  ['r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -', 'f1b5'],
  ['rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -', 'e7e6'],
  ['rnbqkb1r/pppp1ppp/4pn2/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -', 'b1c3'],
]);

function createSearchTable() {
  return {
    keys: new Array(TT_SIZE),
    depths: new Int8Array(TT_SIZE),
    scores: new Int32Array(TT_SIZE),
    flags: new Int8Array(TT_SIZE),
    moves: new Array(TT_SIZE),
  };
}

function serializePosition(pos) {
  return `${pos.side}|${pos.castling}|${pos.enPassant}|${pos.board.join('')}`;
}

function encodeTableScore(score, ply) {
  if (score > TT_MATE_BOUND) return score + ply;
  if (score < -TT_MATE_BOUND) return score - ply;
  return score;
}

function decodeTableScore(score, ply) {
  if (score > TT_MATE_BOUND) return score - ply;
  if (score < -TT_MATE_BOUND) return score + ply;
  return score;
}

function readSearchTable(table, pos, depth, alpha, beta, ply) {
  const key = serializePosition(pos);
  const index = hashString(key) & (TT_SIZE - 1);
  const move = table.moves[index] ?? null;

  if (table.keys[index] !== key) {
    return { key, index, move: null, hit: false, alpha, beta };
  }

  if (table.depths[index] < depth) {
    return { key, index, move, hit: false, alpha, beta };
  }

  const score = decodeTableScore(table.scores[index], ply);
  const flag = table.flags[index];
  if (flag === TT_EXACT) {
    return { key, index, move, hit: true, score, alpha, beta };
  }
  if (flag === TT_LOWER) {
    alpha = Math.max(alpha, score);
  } else if (flag === TT_UPPER) {
    beta = Math.min(beta, score);
  }
  if (alpha >= beta) {
    return { key, index, move, hit: true, score, alpha, beta };
  }
  return { key, index, move, hit: false, alpha, beta };
}

function writeSearchTable(table, key, index, depth, score, flag, move, ply) {
  if (table.keys[index] && table.keys[index] !== key && table.depths[index] > depth) return;
  table.keys[index] = key;
  table.depths[index] = depth;
  table.scores[index] = encodeTableScore(score, ply);
  table.flags[index] = flag;
  table.moves[index] = move;
}

function nonPawnMaterial(pos) {
  let total = 0;
  for (const piece of pos.board) {
    if (piece === '.') continue;
    const lower = piece.toLowerCase();
    if (lower === 'p' || lower === 'k') continue;
    total += PIECE_VALUES[lower];
  }
  return total;
}

function isEndgame(pos) {
  return nonPawnMaterial(pos) <= 2600;
}

function pawnAdvance(side, index) {
  const row = Math.floor(index / 8);
  return side === 'w' ? 6 - row : row - 1;
}

function sameMove(a, b) {
  return !!a && !!b && a.from === b.from && a.to === b.to && (a.promotion || '') === (b.promotion || '');
}

function historyIndex(move) {
  return squareToIndex(move.from) * 64 + squareToIndex(move.to);
}

function storeKiller(killers, ply, move) {
  const pair = killers[ply];
  if (sameMove(move, pair[0])) return;
  pair[1] = pair[0];
  pair[0] = move;
}

function isNoisyMove(pos, move) {
  const from = squareToIndex(move.from);
  const to = squareToIndex(move.to);
  const piece = pos.board[from];
  const target = pos.board[to];
  return !!move.promotion || target !== '.' || (piece.toLowerCase() === 'p' && move.to === pos.enPassant);
}

function noisyMoveGain(pos, move) {
  const from = squareToIndex(move.from);
  const to = squareToIndex(move.to);
  const piece = pos.board[from];
  const target = pos.board[to];
  let gain = 0;
  if (target !== '.') gain += PIECE_VALUES[target.toLowerCase()];
  if (piece.toLowerCase() === 'p' && move.to === pos.enPassant) gain += PIECE_VALUES.p;
  if (move.promotion) gain += PIECE_VALUES[move.promotion] - PIECE_VALUES.p;
  return gain;
}

function kingDistance(a, b) {
  const aRow = Math.floor(a / 8);
  const aCol = a % 8;
  const bRow = Math.floor(b / 8);
  const bCol = b % 8;
  return Math.max(Math.abs(aRow - bRow), Math.abs(aCol - bCol));
}

function evaluatePawns(pawns, side, ownPawnFiles, enemyBoundary, ownKing, enemyKing, endgame) {
  let score = 0;
  for (const index of pawns) {
    const row = Math.floor(index / 8);
    const file = index % 8;
    const left = file > 0 ? ownPawnFiles[file - 1] : 0;
    const right = file < 7 ? ownPawnFiles[file + 1] : 0;
    if (left === 0 && right === 0) score -= 12;
    if (ownPawnFiles[file] > 1) score -= 10 * (ownPawnFiles[file] - 1);

    let passed = true;
    for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
      if (side === 'w') {
        if (enemyBoundary[f] < row) {
          passed = false;
          break;
        }
      } else if (enemyBoundary[f] > row) {
        passed = false;
        break;
      }
    }

    if (passed) {
      score += 18 + pawnAdvance(side, index) * 12;
      if (endgame) {
        if (ownKing >= 0) score += Math.max(0, 6 - kingDistance(ownKing, index)) * 5;
        if (enemyKing >= 0) score -= Math.max(0, 6 - kingDistance(enemyKing, index)) * 6;
      }
    }
  }
  return score;
}

function evaluateRooks(rooks, side, ownPawnFiles, enemyPawnFiles) {
  let score = 0;
  for (const index of rooks) {
    const row = Math.floor(index / 8);
    const file = index % 8;
    if (ownPawnFiles[file] === 0) score += enemyPawnFiles[file] === 0 ? 20 : 10;
    if ((side === 'w' && row === 1) || (side === 'b' && row === 6)) score += 15;
  }
  return score;
}

function evaluateEndgameKingActivity(kingIndex, ownPawns, enemyPawns) {
  if (kingIndex < 0) return 0;
  let score = 0;
  for (const pawn of ownPawns) {
    score += Math.max(0, 5 - kingDistance(kingIndex, pawn)) * 2;
  }
  for (const pawn of enemyPawns) {
    score += Math.max(0, 6 - kingDistance(kingIndex, pawn)) * 3;
  }
  return score;
}

function staticEvaluation(pos) {
  const endgame = isEndgame(pos);
  let score = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  let whiteKing = -1;
  let blackKing = -1;
  const whitePawns = [];
  const blackPawns = [];
  const whiteRooks = [];
  const blackRooks = [];
  const whitePawnFiles = Array(8).fill(0);
  const blackPawnFiles = Array(8).fill(0);
  const whitePawnBack = Array(8).fill(-1);
  const blackPawnFront = Array(8).fill(8);

  for (let i = 0; i < 64; i++) {
    const piece = pos.board[i];
    if (piece === '.') continue;
    const side = colorOf(piece);
    const lower = piece.toLowerCase();
    const table = lower === 'k' ? (endgame ? KING_END_PST : KING_MID_PST) : PIECE_SQUARE_TABLES[lower];
    const pstIndex = side === 'w' ? i : mirrorIndex(i);
    const pieceScore = PIECE_VALUES[lower] + (table ? table[pstIndex] : 0);
    score += side === 'w' ? pieceScore : -pieceScore;
    if (piece === 'B') whiteBishops++;
    if (piece === 'b') blackBishops++;
    if (piece === 'K') whiteKing = i;
    if (piece === 'k') blackKing = i;
    if (piece === 'P') {
      whitePawns.push(i);
      whitePawnFiles[i % 8]++;
      whitePawnBack[i % 8] = Math.max(whitePawnBack[i % 8], Math.floor(i / 8));
    }
    if (piece === 'p') {
      blackPawns.push(i);
      blackPawnFiles[i % 8]++;
      blackPawnFront[i % 8] = Math.min(blackPawnFront[i % 8], Math.floor(i / 8));
    }
    if (piece === 'R') whiteRooks.push(i);
    if (piece === 'r') blackRooks.push(i);
  }

  if (whiteBishops >= 2) score += 30;
  if (blackBishops >= 2) score -= 30;
  score += evaluatePawns(whitePawns, 'w', whitePawnFiles, blackPawnFront, whiteKing, blackKing, endgame);
  score -= evaluatePawns(blackPawns, 'b', blackPawnFiles, whitePawnBack, blackKing, whiteKing, endgame);
  score += evaluateRooks(whiteRooks, 'w', whitePawnFiles, blackPawnFiles);
  score -= evaluateRooks(blackRooks, 'b', blackPawnFiles, whitePawnFiles);
  if (endgame) {
    score += evaluateEndgameKingActivity(whiteKing, whitePawns, blackPawns);
    score -= evaluateEndgameKingActivity(blackKing, blackPawns, whitePawns);
  }
  if (!endgame) {
    if (whiteKing === squareToIndex('g1') || whiteKing === squareToIndex('c1')) score += 25;
    if (blackKing === squareToIndex('g8') || blackKing === squareToIndex('c8')) score -= 25;
  }
  if (isKingInCheck(pos, 'w')) score -= 35;
  if (isKingInCheck(pos, 'b')) score += 35;
  return pos.side === 'w' ? score : -score;
}

function centralityBonus(square) {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  const distance = Math.abs(file - 3.5) + Math.abs(rank - 3.5);
  return Math.round(14 - distance * 4);
}

function moveOrderScore(pos, move, ply, history, killers, hashMove) {
  const from = squareToIndex(move.from);
  const to = squareToIndex(move.to);
  const piece = pos.board[from];
  const target = pos.board[to];
  const lower = piece.toLowerCase();
  let score = centralityBonus(move.to);

  if (sameMove(move, hashMove)) score += 12000;
  if (move.promotion) score += 8000 + PIECE_VALUES[move.promotion];
  if (lower === 'k' && Math.abs(to - from) === 2) score += 200;
  if (target !== '.') {
    score += 4000 + PIECE_VALUES[target.toLowerCase()] * 10 - PIECE_VALUES[lower];
  } else if (lower === 'p' && move.to === pos.enPassant) {
    score += 4900;
  }
  if (killers && killers[ply]) {
    if (sameMove(move, killers[ply][0])) score += 2500;
    else if (sameMove(move, killers[ply][1])) score += 2200;
  }
  if (history) score += Math.min(history[historyIndex(move)], 1800);
  return score;
}

function compareMoveEntries(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return a.uci < b.uci ? -1 : a.uci > b.uci ? 1 : 0;
}

function positionToPlacement(board) {
  const rows = [];
  for (let rank = 0; rank < 8; rank++) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = board[rank * 8 + file];
      if (piece === '.') {
        empty++;
      } else {
        if (empty) {
          row += String(empty);
          empty = 0;
        }
        row += piece;
      }
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return rows.join('/');
}

function openingLookupKey(pos) {
  return `${positionToPlacement(pos.board)} ${pos.side} ${pos.castling} ${pos.enPassant}`;
}

function pickBookMove(pos, legal) {
  const uci = OPENING_BOOK.get(openingLookupKey(pos));
  if (!uci) return null;
  return legal.find((move) => moveToUci(move) === uci) || null;
}

function createNullMovePosition(pos) {
  return {
    board: pos.board,
    side: opposite(pos.side),
    castling: pos.castling,
    enPassant: '-',
    halfmove: pos.halfmove + 1,
    fullmove: pos.fullmove + (pos.side === 'b' ? 1 : 0),
  };
}

function canApplyNullPrune(pos, depth, inCheck) {
  return depth >= 3 && !inCheck && nonPawnMaterial(pos) > 1600;
}

function lineHasRepetition(pathKeys, key) {
  for (let i = pathKeys.length - 1; i >= 0; i--) {
    if (pathKeys[i] === key) return true;
  }
  return false;
}

function orderMoves(pos, moves, ply = 0, history = null, killers = null, hashMove = null) {
  if (moves.length < 2) return moves.slice();
  return moves
    .map((move) => ({ move, score: moveOrderScore(pos, move, ply, history, killers, hashMove), uci: moveToUci(move) }))
    .sort(compareMoveEntries)
    .map(({ move }) => move);
}

function searchQuiescence(pos, alpha, beta, deadline, ply, history, killers, qDepth = 0) {
  if (Date.now() >= deadline) throw SEARCH_TIMEOUT;

  const inCheck = isKingInCheck(pos, pos.side);
  if (inCheck) {
    const legal = legalMoves(pos);
    if (!legal.length) return -MATE_SCORE + ply;
    if (qDepth >= 2) return staticEvaluation(pos);

    let bestScore = -Infinity;
    const ordered = orderMoves(pos, legal, ply, history, killers);
    for (const move of ordered) {
      const score = -searchQuiescence(applyMove(pos, move), -beta, -alpha, deadline, ply + 1, history, killers, qDepth + 1);
      if (score > bestScore) bestScore = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) return score;
    }
    return bestScore;
  }

  const standPat = staticEvaluation(pos);
  if (standPat >= beta) return standPat;
  if (standPat > alpha) alpha = standPat;
  if (qDepth >= 6) return alpha;

  const noisy = orderMoves(
    pos,
    legalMoves(pos).filter((move) => isNoisyMove(pos, move)),
    ply,
    history,
    killers,
  );

  for (const move of noisy) {
    if (standPat + noisyMoveGain(pos, move) + 150 < alpha) continue;
    const score = -searchQuiescence(applyMove(pos, move), -beta, -alpha, deadline, ply + 1, history, killers, qDepth + 1);
    if (score > alpha) {
      alpha = score;
      if (alpha >= beta) return score;
    }
  }
  return alpha;
}

function searchAlphaBeta(pos, depth, alpha, beta, deadline, ply = 0, history, killers, table, pathKeys) {
  if (Date.now() >= deadline) throw SEARCH_TIMEOUT;

  const alphaStart = alpha;
  const betaStart = beta;
  const tableEntry = readSearchTable(table, pos, depth, alpha, beta, ply);
  if (ply > 0 && lineHasRepetition(pathKeys, tableEntry.key)) return 0;
  if (tableEntry.hit) return tableEntry.score;
  alpha = tableEntry.alpha;
  beta = tableEntry.beta;

  const legal = legalMoves(pos);
  if (!legal.length) {
    const terminalScore = isKingInCheck(pos, pos.side) ? -MATE_SCORE + ply : 0;
    writeSearchTable(table, tableEntry.key, tableEntry.index, depth, terminalScore, TT_EXACT, null, ply);
    return terminalScore;
  }
  const inCheck = isKingInCheck(pos, pos.side);
  if (depth <= 0) {
    if (!inCheck) return searchQuiescence(pos, alpha, beta, deadline, ply, history, killers);
    depth = 1;
  }

  if (canApplyNullPrune(pos, depth, inCheck)) {
    const reduction = depth >= 5 ? 3 : 2;
    pathKeys.push(tableEntry.key);
    const score = -searchAlphaBeta(createNullMovePosition(pos), depth - 1 - reduction, -beta, -beta + 1, deadline, ply + 1, history, killers, table, pathKeys);
    pathKeys.pop();
    if (score >= beta) {
      writeSearchTable(table, tableEntry.key, tableEntry.index, depth, score, TT_LOWER, null, ply);
      return score;
    }
  }

  let bestScore = -Infinity;
  let bestMove = tableEntry.move;
  const ordered = orderMoves(pos, legal, ply, history, killers, tableEntry.move);
  for (let moveIndex = 0; moveIndex < ordered.length; moveIndex++) {
    const move = ordered[moveIndex];
    const child = applyMove(pos, move);
    const noisy = isNoisyMove(pos, move);
    let reduction = 0;

    if (!inCheck && !noisy && depth >= 4 && moveIndex >= 4) {
      reduction = 1;
    }

    let score;
    if (moveIndex === 0) {
      pathKeys.push(tableEntry.key);
      score = -searchAlphaBeta(child, depth - 1, -beta, -alpha, deadline, ply + 1, history, killers, table, pathKeys);
      pathKeys.pop();
    } else {
      pathKeys.push(tableEntry.key);
      score = -searchAlphaBeta(child, depth - 1 - reduction, -alpha - 1, -alpha, deadline, ply + 1, history, killers, table, pathKeys);
      pathKeys.pop();
      if (score > alpha && score < beta) {
        pathKeys.push(tableEntry.key);
        score = -searchAlphaBeta(child, depth - 1, -beta, -alpha, deadline, ply + 1, history, killers, table, pathKeys);
        pathKeys.pop();
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (!noisy) {
        storeKiller(killers, ply, move);
        history[historyIndex(move)] += depth * depth;
      }
      break;
    }
  }

  const flag = bestScore <= alphaStart ? TT_UPPER : bestScore >= betaStart ? TT_LOWER : TT_EXACT;
  writeSearchTable(table, tableEntry.key, tableEntry.index, depth, bestScore, flag, bestMove, ply);
  return bestScore;
}

function getSearchBudget(pos) {
  const pieceCount = pos.board.filter((piece) => piece !== '.').length;
  if (pieceCount <= 10) return { softMs: 180, hardMs: 220, maxDepth: 7 };
  if (pieceCount <= 18) return { softMs: 145, hardMs: 185, maxDepth: 6 };
  return { softMs: 110, hardMs: 145, maxDepth: 5 };
}

function searchBestMove(pos, legal) {
  const budget = getSearchBudget(pos);
  const start = Date.now();
  const deadline = start + budget.hardMs;
  const history = new Int32Array(64 * 64);
  const killers = Array.from({ length: 64 }, () => [null, null]);
  const table = createSearchTable();
  const rootKey = serializePosition(pos);
  let rootMoves = orderMoves(pos, legal, 0, history, killers);
  let bestMove = rootMoves[0];
  let lastCompletedScore = 0;

  for (let depth = 1; depth <= budget.maxDepth; depth++) {
    const useAspirationWindow = depth >= 3 && Math.abs(lastCompletedScore) < MATE_SCORE - 2000;
    let windowAlpha = useAspirationWindow ? lastCompletedScore - 60 : -Infinity;
    let windowBeta = useAspirationWindow ? lastCompletedScore + 60 : Infinity;
    let iterationBestMove = bestMove;
    let iterationBestScore = -Infinity;
    let iterationBestUci = moveToUci(bestMove);
    let scored = [];

    while (true) {
      iterationBestMove = bestMove;
      iterationBestScore = -Infinity;
      iterationBestUci = moveToUci(bestMove);
      scored = [];

      try {
        for (const move of rootMoves) {
          if (Date.now() >= deadline) throw SEARCH_TIMEOUT;
          const score = -searchAlphaBeta(
            applyMove(pos, move),
            depth - 1,
            -windowBeta,
            -windowAlpha,
            deadline,
            1,
            history,
            killers,
            table,
            [rootKey],
          );
          const uci = moveToUci(move);
          scored.push({ move, score, uci });
          if (score > iterationBestScore || (score === iterationBestScore && uci < iterationBestUci)) {
            iterationBestMove = move;
            iterationBestScore = score;
            iterationBestUci = uci;
          }
        }
      } catch (error) {
        if (error !== SEARCH_TIMEOUT) throw error;
        scored = null;
      }

      if (scored === null) break;
      if (!useAspirationWindow) break;
      if (iterationBestScore <= windowAlpha) {
        windowAlpha -= 120;
        continue;
      }
      if (iterationBestScore >= windowBeta) {
        windowBeta += 120;
        continue;
      }
      break;
    }

    if (scored === null) break;

    scored.sort(compareMoveEntries);
    rootMoves = scored.map(({ move }) => move);
    bestMove = iterationBestMove;
    lastCompletedScore = iterationBestScore;
    if (Math.abs(iterationBestScore) >= MATE_SCORE - 1000) break;
    if (Date.now() - start >= budget.softMs) break;
  }

  return bestMove;
}

// Search the position deterministically using iterative deepening alpha-beta.
function selectBestMove(pos) {
  const legal = legalMoves(pos);
  if (!legal.length) return null;
  if (legal.length === 1) return legal[0];
  const bookMove = pickBookMove(pos, legal);
  if (bookMove) return bookMove;
  return searchBestMove(pos, legal);
}

// The judge sends exactly one FEN on stdin. The agent prints exactly one UCI
// move on stdout. If there are no legal moves, print 0000 as a safe placeholder.
const fen = readFileSync(0, 'utf8').trim();
try {
  const pos = parseFen(fen);
  const move = selectBestMove(pos);
  process.stdout.write(`${move ? moveToUci(move) : '0000'}\n`);
} catch {
  try {
    const pos = parseFen(fen);
    const legal = legalMoves(pos);
    process.stdout.write(`${legal.length ? moveToUci(legal[0]) : '0000'}\n`);
  } catch {
    process.stdout.write('0000\n');
  }
}
