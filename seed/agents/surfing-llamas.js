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

// Material piece values in centipawns.
const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables from white's perspective (index 0 = a8, index 63 = h1).
// Black mirrors via index ^ 56 (rank flip).
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

// Evaluate material + PST from white's perspective (positive = white ahead).
function evaluate(pos) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const piece = pos.board[i];
    if (piece === '.') continue;
    const lower = piece.toLowerCase();
    const white = colorOf(piece) === 'w';
    const idx = white ? i : (i ^ 56);
    const value = PIECE_VALUES[lower] + PST[lower][idx];
    score += white ? value : -value;
  }
  return score;
}

const MATE = 100000;
const SOFT_MS = 60;
const HARD_MS = 400;
const ABORT = Symbol('abort');

// Transposition table: bounded, deterministic, depth-preferred replace.
const TT_MAX = 50000;
const EXACT = 0;
const LOWER = 1;
const UPPER = 2;
const tt = new Map();

function posKey(pos) {
  let h = 2166136261;
  for (let i = 0; i < 64; i++) {
    h ^= pos.board[i].charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h ^= pos.side.charCodeAt(0);
  h = Math.imul(h, 16777619);
  for (let i = 0; i < pos.castling.length; i++) {
    h ^= pos.castling.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let i = 0; i < pos.enPassant.length; i++) {
    h ^= pos.enPassant.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function ttProbe(key, depth, alpha, beta) {
  const entry = tt.get(key);
  if (!entry || entry.depth < depth) return null;
  if (entry.bound === EXACT) return { score: entry.score, bestUci: entry.bestUci };
  if (entry.bound === LOWER && entry.score >= beta) return { score: entry.score, bestUci: entry.bestUci };
  if (entry.bound === UPPER && entry.score <= alpha) return { score: entry.score, bestUci: entry.bestUci };
  return { score: null, bestUci: entry.bestUci };
}

function ttStore(key, depth, score, bound, bestUci) {
  const existing = tt.get(key);
  if (existing && existing.depth > depth) return;
  if (tt.size >= TT_MAX && !existing) {
    const first = tt.keys().next().value;
    tt.delete(first);
  }
  tt.set(key, { depth, score, bound, bestUci });
}

// Move ordering: TT best move > captures (MVV-LVA) > promotions > killers > quiet.
// Stable UCI lex tie-break within each bucket.
function orderMoves(pos, moves, killerUcis, ttBestUci) {
  const killers = killerUcis ? new Set(killerUcis) : null;
  const scored = moves.map((move) => {
    const uci = moveToUci(move);
    if (ttBestUci && uci === ttBestUci) return { move, uci, priority: 20000 };
    const toIdx = squareToIndex(move.to);
    const victim = pos.board[toIdx];
    const fromIdx = squareToIndex(move.from);
    const attacker = pos.board[fromIdx];
    let priority = 0;
    if (victim !== '.') {
      priority = 10000 + PIECE_VALUES[victim.toLowerCase()] - PIECE_VALUES[attacker.toLowerCase()] / 100;
    }
    if (attacker.toLowerCase() === 'p' && move.to === pos.enPassant) {
      priority = 10000 + PIECE_VALUES.p;
    }
    if (move.promotion) {
      priority += 9000 + PIECE_VALUES[move.promotion];
    }
    if (priority === 0 && killers && killers.has(uci)) {
      priority = 5000;
    }
    return { move, uci, priority };
  });
  scored.sort((a, b) => b.priority - a.priority || (a.uci < b.uci ? -1 : a.uci > b.uci ? 1 : 0));
  return scored;
}

// Check if a move is quiet (not a capture, not en passant capture, not promotion).
function isQuiet(pos, move) {
  if (pos.board[squareToIndex(move.to)] !== '.') return false;
  if (move.promotion) return false;
  if (move.to === pos.enPassant && pos.board[squareToIndex(move.from)].toLowerCase() === 'p') return false;
  return true;
}

// Record a killer move for the given ply (2 slots, shift on new entry).
function recordKiller(killerTable, ply, uci) {
  if (!killerTable[ply]) killerTable[ply] = [null, null];
  if (killerTable[ply][0] !== uci) {
    killerTable[ply][1] = killerTable[ply][0];
    killerTable[ply][0] = uci;
  }
}

// Capture-only quiescence search. Resolves tactical sequences at leaf
// nodes so the static eval isn't applied in the middle of an exchange.
function quiescence(pos, alpha, beta, ply, deadline) {
  if (Date.now() >= deadline) return ABORT;
  const standPat = evaluate(pos) * (pos.side === 'w' ? 1 : -1);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  const legal = legalMoves(pos);
  if (!legal.length) {
    return isKingInCheck(pos, pos.side) ? -(MATE - ply) : 0;
  }

  // Filter to captures only (piece on target square, or en passant).
  const captures = legal.filter((m) => {
    if (pos.board[squareToIndex(m.to)] !== '.') return true;
    if (m.to === pos.enPassant && pos.board[squareToIndex(m.from)].toLowerCase() === 'p') return true;
    return false;
  });

  // Order captures by MVV-LVA with stable UCI tie-break.
  const ordered = orderMoves(pos, captures, null, null);
  for (const { move } of ordered) {
    const raw = quiescence(applyMove(pos, move), -beta, -alpha, ply + 1, deadline);
    if (raw === ABORT) return ABORT;
    const score = -raw;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// Negamax with alpha-beta pruning and TT. Returns score from the
// perspective of pos.side. Returns ABORT if hard deadline is exceeded.
function negamax(pos, depth, alpha, beta, ply, deadline, killerTable) {
  if (Date.now() >= deadline) return ABORT;
  const legal = legalMoves(pos);
  if (!legal.length) {
    return isKingInCheck(pos, pos.side) ? -(MATE - ply) : 0;
  }
  if (depth <= 0) {
    return quiescence(pos, alpha, beta, ply, deadline);
  }

  const key = posKey(pos);
  let ttBestUci = null;
  const probe = ttProbe(key, depth, alpha, beta);
  if (probe) {
    if (probe.score !== null) return probe.score;
    ttBestUci = probe.bestUci;
  }

  const origAlpha = alpha;
  const killerUcis = killerTable[ply] || null;
  const ordered = orderMoves(pos, legal, killerUcis, ttBestUci);
  let bestUci = ordered[0].uci;
  for (const { move, uci } of ordered) {
    const raw = negamax(applyMove(pos, move), depth - 1, -beta, -alpha, ply + 1, deadline, killerTable);
    if (raw === ABORT) return ABORT;
    const score = -raw;
    if (score >= beta) {
      if (isQuiet(pos, move)) recordKiller(killerTable, ply, uci);
      ttStore(key, depth, beta, LOWER, uci);
      return beta;
    }
    if (score > alpha) {
      alpha = score;
      bestUci = uci;
    }
  }
  ttStore(key, depth, alpha, alpha > origAlpha ? EXACT : UPPER, bestUci);
  return alpha;
}

// Search one depth with full-window per root move. Returns {move, score, uci}
// only when every root move completes; returns null on any ABORT.
function searchDepth(pos, rootMoves, depth, deadline, killerTable) {
  let bestScore = -Infinity;
  let bestUci = '';
  let bestMove = null;
  for (const { move, uci } of rootMoves) {
    const raw = negamax(applyMove(pos, move), depth - 1, -Infinity, Infinity, 1, deadline, killerTable);
    if (raw === ABORT) return null;
    const score = -raw;
    if (score > bestScore || (score === bestScore && uci < bestUci)) {
      bestScore = score;
      bestUci = uci;
      bestMove = move;
    }
  }
  return { move: bestMove, score: bestScore, uci: bestUci };
}

// Small deterministic opening book. Key = placement/side/castling/ep.
function bookKey(pos) {
  const placement = [];
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = pos.board[r * 8 + c];
      if (p === '.') { empty++; } else {
        if (empty) { placement.push(empty); empty = 0; }
        placement.push(p);
      }
    }
    if (empty) placement.push(empty);
    if (r < 7) placement.push('/');
  }
  return `${placement.join('')} ${pos.side} ${pos.castling} ${pos.enPassant}`;
}

const BOOK = new Map([
  // Starting position → 1.d4 (strong and common)
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 'd2d4'],
  // 1.d4 → d5 (solid reply)
  ['rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -', 'd7d5'],
  // 1.d4 Nf6 → c4 (English/Indian systems)
  ['rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', 'c2c4'],
  // 1.e4 → e5 (open game)
  ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'e7e5'],
  // 1.e4 e5 → Nf3 (king's knight)
  ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'g1f3'],
  // 1.e4 e5 2.Nf3 → Nc6 (classical defense)
  ['rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -', 'b8c6'],
  // 1.e4 e5 2.Nf3 Nc6 → Bb5 (Ruy Lopez)
  ['r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -', 'f1b5'],
  // 1.d4 d5 → c4 (Queen's Gambit)
  ['rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', 'c2c4'],
  // 1.d4 d5 2.c4 → e6 (QGD)
  ['rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -', 'e7e6'],
  // 1.d4 d5 2.c4 e6 → Nc3 (main line)
  ['rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -', 'b1c3'],
  // 1.c4 → e5 (English reversed Sicilian)
  ['rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -', 'e7e5'],
  // 1.Nf3 → d5 (solid reply)
  ['rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -', 'd7d5'],
  // Italian: 1.e4 e5 2.Nf3 Nc6 3.Bc4 → Bc5
  ['r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -', 'f8c5'],
  // Ruy Lopez: 3.Bb5 → a6
  ['r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -', 'a7a6'],
]);

// Iterative deepening with soft/hard time control.
function pickMove(pos) {
  const legal = legalMoves(pos);
  if (!legal.length) return null;

  // Opening book lookup.
  const bk = bookKey(pos);
  const bookUci = BOOK.get(bk);
  if (bookUci) {
    const bookMove = legal.find((m) => moveToUci(m) === bookUci);
    if (bookMove) return bookMove;
  }

  // Order root moves: captures (MVV-LVA), killers, quiet; UCI lex tie-break.
  const rootMoves = orderMoves(pos, legal, null, null);

  // Deterministic fallback: first move in ordered list.
  let bestMove = rootMoves[0].move;
  let pvUci = null;
  const killerTable = [];

  const start = Date.now();
  const deadline = start + HARD_MS;

  for (let depth = 1; ; depth++) {
    if (Date.now() >= deadline) break;
    // PV-first: move previous depth's best to front of root list.
    if (pvUci) {
      const pvIdx = rootMoves.findIndex((m) => m.uci === pvUci);
      if (pvIdx > 0) {
        const pv = rootMoves.splice(pvIdx, 1)[0];
        rootMoves.unshift(pv);
      }
    }
    const result = searchDepth(pos, rootMoves, depth, deadline, killerTable);
    if (!result) break;
    bestMove = result.move;
    pvUci = result.uci;
    if (Date.now() - start >= SOFT_MS) break;
  }
  return bestMove;
}

// The judge sends exactly one FEN on stdin. The agent prints exactly one UCI
// move on stdout. If there are no legal moves, print 0000 as a safe placeholder.
let fen = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) fen += chunk;
fen = fen.trim();
const pos = parseFen(fen);
const move = pickMove(pos);
process.stdout.write(`${move ? moveToUci(move) : '0000'}\n`);
