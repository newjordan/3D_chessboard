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

const mg_value = { 'p': 82, 'n': 337, 'b': 365, 'r': 477, 'q': 1025, 'k': 0 };
const eg_value = { 'p': 94, 'n': 281, 'b': 297, 'r': 512, 'q': 936, 'k': 0 };

const mg_table = {
  'p': [
      0,   0,   0,   0,   0,   0,   0,   0,
     98, 134,  61,  95,  68, 126,  34, -11,
     -6,   7,  26,  31,  65,  56,  25, -20,
    -14,  13,   6,  21,  23,  12,  17, -23,
    -27,  -2,  -5,  12,  17,   6,  10, -25,
    -26,  -4,  -4, -10,   3,   3,  33, -12,
    -35,  -1, -20, -23, -15,  24,  38, -22,
      0,   0,   0,   0,   0,   0,   0,   0
  ],
  'n': [
    -167, -89, -34, -49,  61, -97, -15, -107,
     -73, -41,  72,  36,  23,  62,   7,  -17,
     -47,  60,  37,  65,  84, 129,  73,   44,
      -9,  17,  19,  53,  37,  69,  18,   22,
     -13,   4,  16,  13,  28,  19,  21,   -8,
     -23,  -9,  12,  10,  19,  17,  25,  -16,
     -29, -53, -12,  -3,  -1,  18, -14,  -19,
    -105, -21, -58, -33, -17, -28, -19,  -23
  ],
  'b': [
    -29,   4, -82, -37, -25, -42,   7,  -8,
    -26,  16, -18, -13,  30,  59,  18, -47,
    -16,  37,  43,  40,  35,  50,  37,  -2,
     -4,   5,  19,  50,  37,  37,   7,  -2,
     -6,  13,  13,  26,  34,  12,  10,   4,
      0,  15,  15,  15,  14,  27,  18,  10,
      4,  15,  16,   0,   7,  21,  33,   1,
    -33,  -3, -14, -21, -13, -12, -39, -21
  ],
  'r': [
     32,  42,  32,  51,  63,   9,  31,  43,
     27,  32,  58,  62,  80,  67,  26,  44,
     -5,  19,  26,  36,  17,  45,  61,  16,
    -24, -11,   7,  26,  24,  35,  -8, -20,
    -36, -26, -12,  -1,   9,  -7,   6, -23,
    -45, -25, -16, -17,   3,   0,  -5, -33,
    -44, -16, -20,  -9,  -1,  11,  -6, -71,
    -19, -13,   1,  17,  16,   7, -37, -26
  ],
  'q': [
    -28,   0,  29,  12,  59,  44,  43,  45,
    -24, -39,  -5,   1, -16,  57,  28,  54,
    -13, -17,   7,   8,  29,  56,  47,  57,
    -27, -27, -16, -16,  -1,  17,  -2,   1,
     -9, -26,  -9, -10,  -2,  -4,   3,  -3,
    -14,   2, -11,  -2,  -5,   2,  14,   5,
    -35,  -8,  11,   2,   8,  15,  -3,   1,
     -1, -18,  -9,  10, -15, -25, -31, -50
  ],
  'k': [
    -65,  23,  16, -15, -56, -34,   2,  13,
     29,  -1, -20,  -7,  -8,  -4, -38, -29,
     -9,  24,   2, -16, -20,   6,  22, -22,
    -17, -20, -12, -27, -30, -25, -14, -36,
    -49,  -1, -27, -39, -46, -44, -33, -51,
    -14, -14, -22, -46, -44, -30, -15, -27,
      1,   7,  -8, -64, -43, -16,   9,   8,
    -15,  36,  12, -54,   8, -28,  24,  14
  ]
};

const eg_table = {
  'p': [
      0,   0,   0,   0,   0,   0,   0,   0,
    178, 173, 158, 134, 147, 132, 165, 187,
     94, 100,  85,  67,  56,  53,  82,  84,
     32,  24,  13,   5,  42,  26,  13,  28,
     13,   9,  18,  15,  12,  47,  51,  36,
     27,   2,  15,  19,  14,  11,  51,  29,
     -9,  22,  18,  27,  40,  10,  20,  22,
      0,   0,   0,   0,   0,   0,   0,   0
  ],
  'n': [
    -58, -38, -13, -28,  31, -27, -63, -99,
    -25,   8,  25,   2,   7,  42,  -1, -46,
    -24, -39,  -5,  41,  55,  57,  37,  -9,
    -17,  31,  22,  53,  40,  12,  44, -23,
    -40,  37,  23,  28,  30,  14,  53, -43,
    -26,  16, -18,  11,  30,  46,  21, -37,
    -16,  27,  28,  -9,  11,  -8,  13,  21,
    -74, -52, -43, -36, -22, -43, -39, -55
  ],
  'b': [
    -14, -21, -11,  -8,  -7,  -9, -17, -24,
     -8,  -4,   7, -12,  -3, -13,  -4, -14,
      2,  -8,   0,  -1,  -2,   6,   0,   4,
     -3,   9,  12,   9,  14,  10,   3,   2,
     -6,   3,  13,  19,   7,  10,  -3,  -9,
    -12,  -3,   8,  10,  13,   3,  -7, -15,
    -14, -18,  -7,  -1,   4,  -9, -15, -27,
    -23,  -9, -23,  -5,  -9, -16,  -5, -17
  ],
  'r': [
     13,  10,  18,  15,  12,  12,   8,   5,
     11,  13,  13,  11,  -3,   3,   8,   3,
      7,   7,   7,   5,   4,  -3,  -5,  -3,
      4,   3,  13,   1,   2,   1,  -1,   2,
      3,   5,   8,   4,  -5,  -6,  -8, -11,
     -4,   0,  -5,  -1,  -7, -12,  -8, -16,
     -6,  -6,   0,   2,  -9,  -9, -11,  -3,
     -9,   2,   3,  -1,  -5, -13,   4, -20
  ],
  'q': [
     -9,  22,  22,  27,  27,  19,  10,  20,
    -17,  20,  32,  41,  58,  25,  30,   0,
    -20,   6,   9,  49,  47,  35,  19,   9,
      3,  22,  24,  45,  57,  40,  57,  36,
    -18,  28,  19,  47,  31,  34,  39,  23,
    -16, -27,  15,   6,   9,  17,  10,   5,
    -22, -23, -30, -16, -16, -23, -36, -32,
    -33, -28, -22, -43,  -5, -32, -20, -41
  ],
  'k': [
    -74, -35, -18, -18, -11,  15,   4, -17,
    -12,  17,  14,  17,  17,  38,  23,  11,
     10,  17,  23,  15,  20,  45,  44,  13,
     -8,  22,  24,  27,  26,  33,  26,   3,
    -18,  -4,  21,  24,  27,  23,   9, -11,
    -19,  -3,  11,  21,  23,  16,   7,  -9,
    -27, -11,   4,  13,  14,   4,  -5, -17,
    -53, -34, -21, -11, -28, -14, -24, -43
  ]
};

function flip(sq) {
  return sq ^ 56;
}

function evaluate(pos) {
  let mgScore = 0;
  let egScore = 0;
  let gamePhase = 0;

  for (let i = 0; i < 64; i++) {
    const piece = pos.board[i];
    if (piece === '.') continue;
    
    const lower = piece.toLowerCase();
    const isWhite = piece === piece.toUpperCase();
    const sq = isWhite ? i : flip(i);

    let mg = mg_value[lower] + mg_table[lower][sq];
    let eg = eg_value[lower] + eg_table[lower][sq];

    if (isWhite) {
      mgScore += mg;
      egScore += eg;
    } else {
      mgScore -= mg;
      egScore -= eg;
    }

    if (lower === 'n' || lower === 'b') gamePhase += 1;
    else if (lower === 'r') gamePhase += 2;
    else if (lower === 'q') gamePhase += 4;
  }

  let mgPhase = gamePhase;
  if (mgPhase > 24) mgPhase = 24;
  const egPhase = 24 - mgPhase;

  const score = (mgScore * mgPhase + egScore * egPhase) / 24;
  return pos.side === 'w' ? score : -score;
}

const pieceValues = { 'p': 100, 'n': 300, 'b': 300, 'r': 500, 'q': 900, 'k': 0, '.': 0 };

function orderMoves(pos, moves, ply) {
  for (const move of moves) {
    let score = 0;
    const targetPiece = pos.board[squareToIndex(move.to)].toLowerCase();
    const movingPiece = pos.board[squareToIndex(move.from)].toLowerCase();
    
    if (targetPiece !== '.') {
      score = 10000 + 10 * pieceValues[targetPiece] - pieceValues[movingPiece];
    } else if (move.promotion) {
      score = 9000 + pieceValues[move.promotion.toLowerCase()];
    } else {
      if (killerMoves[ply]) {
        if (killerMoves[ply][0] && killerMoves[ply][0].from === move.from && killerMoves[ply][0].to === move.to) {
          score = 8000;
        } else if (killerMoves[ply][1] && killerMoves[ply][1].from === move.from && killerMoves[ply][1].to === move.to) {
          score = 7000;
        }
      }
    }
    
    move.score = score;
  }
  
  moves.sort((a, b) => b.score - a.score);
}

const MAX_DEPTH = 32;
let nodes = 0;
let startTime = 0;
let timeLimit = 120; // ms - reduced to 120ms to guarantee survival of 30s total game budget
let timeOut = false;
let killerMoves = [];

function search(pos) {
  startTime = Date.now();
  timeOut = false;
  nodes = 0;
  killerMoves = Array.from({ length: MAX_DEPTH + 1 }, () => [null, null]);
  
  let bestMove = null;
  let bestScore = -Infinity;
  
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const { move, score } = alphaBetaRoot(pos, depth, -Infinity, Infinity);
    if (timeOut) break;
    bestMove = move;
    bestScore = score;
    
    if (score > 9000 || score < -9000) break;
    if (Date.now() - startTime > timeLimit / 2) break;
  }
  
  return bestMove;
}

function alphaBetaRoot(pos, depth, alpha, beta) {
  const moves = legalMoves(pos);
  if (moves.length === 0) {
    if (isKingInCheck(pos, pos.side)) return { move: null, score: -10000 };
    return { move: null, score: 0 };
  }
  
  orderMoves(pos, moves, 0);
  
  let bestMove = moves[0];
  let bestScore = -Infinity;
  
  for (const move of moves) {
    const nextPos = applyMove(pos, move);
    const score = -alphaBeta(nextPos, depth - 1, -beta, -alpha, 1, false);
    
    if (timeOut) return { move: bestMove, score: bestScore };
    
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) {
      alpha = score;
    }
  }
  
  return { move: bestMove, score: bestScore };
}

function applyNullMove(pos) {
  return {
    board: cloneBoard(pos.board),
    side: opposite(pos.side),
    castling: pos.castling,
    enPassant: '-',
    halfmove: pos.halfmove + 1,
    fullmove: pos.fullmove + (pos.side === 'b' ? 1 : 0)
  };
}

function alphaBeta(pos, depth, alpha, beta, ply, isNullMove) {
  if ((nodes++ & 1023) === 0) {
    if (Date.now() - startTime > timeLimit) timeOut = true;
  }
  if (timeOut) return 0;
  
  if (depth <= 0) {
    return quiescence(pos, alpha, beta, ply);
  }
  
  const inCheck = isKingInCheck(pos, pos.side);
  
  // Null Move Pruning (NMP)
  if (!inCheck && !isNullMove && depth >= 3) {
    const nullPos = applyNullMove(pos);
    const R = 2;
    const nullScore = -alphaBeta(nullPos, depth - 1 - R, -beta, -beta + 1, ply + 1, true);
    if (timeOut) return 0;
    if (nullScore >= beta) return beta;
  }
  
  const moves = legalMoves(pos);
  if (moves.length === 0) {
    if (inCheck) return -10000 + ply;
    return 0; 
  }
  
  orderMoves(pos, moves, ply);
  
  for (const move of moves) {
    const nextPos = applyMove(pos, move);
    const score = -alphaBeta(nextPos, depth - 1, -beta, -alpha, ply + 1, false);
    
    if (timeOut) return 0;
    
    if (score >= beta) {
      // Store killer move if it's a quiet move
      if (pos.board[squareToIndex(move.to)] === '.') {
        if (killerMoves[ply][0] !== move) {
          killerMoves[ply][1] = killerMoves[ply][0];
          killerMoves[ply][0] = move;
        }
      }
      return beta;
    }
    if (score > alpha) alpha = score;
  }
  
  return alpha;
}

function quiescence(pos, alpha, beta, ply) {
  if ((nodes++ & 1023) === 0) {
    if (Date.now() - startTime > timeLimit) timeOut = true;
  }
  if (timeOut) return 0;
  
  const standPat = evaluate(pos);
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;
  
  const moves = pseudoLegalMoves(pos);
  const captures = moves.filter(m => pos.board[squareToIndex(m.to)] !== '.');
  
  orderMoves(pos, captures, ply);
  
  for (const move of captures) {
    const nextPos = applyMove(pos, move);
    if (isKingInCheck(nextPos, pos.side)) continue;
    
    const score = -quiescence(nextPos, -beta, -alpha, ply + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  
  return alpha;
}

const fen = readFileSync(0, 'utf8').trim();
const pos = parseFen(fen);
const move = search(pos);
process.stdout.write(`${move ? moveToUci(move) : '0000'}\n`);
