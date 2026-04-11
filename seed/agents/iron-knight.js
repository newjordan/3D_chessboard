import { readFileSync } from 'node:fs';

const FILES = 'abcdefgh';

function squareToIndex(square) {
  const file = FILES.indexOf(square[0]);
  const rank = 8 - Number(square[1]);
  return rank * 8 + file;
}

function indexToSquare(index) {
  const rank = Math.floor(index / 8);
  const file = index % 8;
  return `${FILES[file]}${8 - rank}`;
}

function colorOf(piece) {
  if (!piece || piece === '.') return null;
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

function opposite(side) {
  return side === 'w' ? 'b' : 'w';
}

function cloneBoard(board) {
  return board.slice();
}

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

function stripCastling(castling) {
  return castling.replace(/-/g, '');
}

function normalizeCastling(castling) {
  const out = stripCastling(castling);
  return out || '-';
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isSquareAttacked(pos, sqIdx, by) {
  const tr = Math.floor(sqIdx / 8);
  const tc = sqIdx % 8;

  const pawnRow = by === 'w' ? tr + 1 : tr - 1;
  for (const dc of [-1, 1]) {
    const c = tc + dc;
    if (!inBounds(pawnRow, c)) continue;
    const p = pos.board[pawnRow * 8 + c];
    if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'p') return true;
  }

  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const r = tr + dr, c = tc + dc;
    if (!inBounds(r, c)) continue;
    const p = pos.board[r * 8 + c];
    if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'n') return true;
  }

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

  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    const r = tr + dr, c = tc + dc;
    if (!inBounds(r, c)) continue;
    const p = pos.board[r * 8 + c];
    if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'k') return true;
  }
  return false;
}

function isKingInCheck(pos, side) {
  const kingIdx = pos.board.findIndex((p) => p !== '.' && colorOf(p) === side && p.toLowerCase() === 'k');
  if (kingIdx < 0) return true;
  return isSquareAttacked(pos, kingIdx, opposite(side));
}

function hasPiece(pos, sq, piece) {
  return pos.board[squareToIndex(sq)] === piece;
}

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

  if (lower === 'p' && move.to === pos.enPassant && target === '.') {
    const captureIdx = to + (pos.side === 'w' ? 8 : -8);
    next.board[captureIdx] = '.';
  }

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

  next.board[to] = move.promotion
    ? (pos.side === 'w' ? move.promotion.toUpperCase() : move.promotion.toLowerCase())
    : piece;

  if (lower === 'p' || target !== '.') next.halfmove = 0;
  if (lower === 'p' && Math.abs(to - from) === 16) {
    next.enPassant = indexToSquare((from + to) / 2);
  }

  if (lower === 'k') {
    next.castling = next.castling.replace(pos.side === 'w' ? /[KQ]/g : /[kq]/g, '');
  }
  if (lower === 'r') {
    if (from === squareToIndex('a1')) next.castling = next.castling.replace('Q', '');
    if (from === squareToIndex('h1')) next.castling = next.castling.replace('K', '');
    if (from === squareToIndex('a8')) next.castling = next.castling.replace('q', '');
    if (from === squareToIndex('h8')) next.castling = next.castling.replace('k', '');
  }
  // If a rook is captured, revoke that side's castling right
  if (target !== '.' && target.toLowerCase() === 'r') {
    if (to === squareToIndex('a1')) next.castling = next.castling.replace('Q', '');
    if (to === squareToIndex('h1')) next.castling = next.castling.replace('K', '');
    if (to === squareToIndex('a8')) next.castling = next.castling.replace('q', '');
    if (to === squareToIndex('h8')) next.castling = next.castling.replace('k', '');
  }

  next.castling = normalizeCastling(next.castling);
  return next;
}

function pseudoLegalMoves(pos) {
  const moves = [];
  const side = pos.side;
  const push = (m) => moves.push(m);

  for (let i = 0; i < 64; i++) {
    const piece = pos.board[i];
    if (piece === '.' || colorOf(piece) !== side) continue;
    const r = Math.floor(i / 8), c = i % 8;
    const lower = piece.toLowerCase();

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

function legalMoves(pos) {
  return pseudoLegalMoves(pos).filter((m) => !isKingInCheck(applyMove(pos, m), pos.side));
}

function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

const MAT = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables, white's perspective (index 0 = a8 … 63 = h1)
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
    -10,  0,  5, 10, 10,  5,  0,-10,
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

// Returns score from WHITE's perspective
function evalBoard(board) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p === '.') continue;
    const l = p.toLowerCase();
    const isWhite = colorOf(p) === 'w';
    // Flip index vertically for black so PST is mirror-correct
    const pstIdx = isWhite ? i : (7 - Math.floor(i / 8)) * 8 + (i % 8);
    const val = (MAT[l] || 0) + (PST[l] ? PST[l][pstIdx] : 0);
    score += isWhite ? val : -val;
  }
  return score;
}

// Score a move for ordering (higher = try first)
function moveOrderScore(pos, move) {
  if (move.promotion === 'q') return 30000;
  if (move.promotion) return 20000;
  const toIdx = squareToIndex(move.to);
  const victim = pos.board[toIdx];
  if (victim !== '.') {
    const victimVal = MAT[victim.toLowerCase()] || 0;
    const aggressor = pos.board[squareToIndex(move.from)];
    const aggressorVal = MAT[aggressor.toLowerCase()] || 0;
    return 10000 + victimVal * 10 - aggressorVal;
  }
  // en passant
  if (pos.board[squareToIndex(move.from)].toLowerCase() === 'p' && move.to === pos.enPassant && pos.enPassant !== '-') {
    return 10100;
  }
  return 0;
}

// ─── Search ───────────────────────────────────────────────────────────────────

const INF = 1_000_000;

// Quiescence search — only looks at captures/promotions to avoid horizon effect
function quiesce(pos, alpha, beta, plyLeft) {
  const sign = pos.side === 'w' ? 1 : -1;
  const standPat = sign * evalBoard(pos.board);

  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;
  if (plyLeft <= 0) return alpha;

  // Generate and filter to captures + queen promotions only
  const caps = pseudoLegalMoves(pos).filter((m) => {
    const t = pos.board[squareToIndex(m.to)];
    const isCapture = t !== '.' && colorOf(t) !== pos.side;
    const isEp = pos.board[squareToIndex(m.from)].toLowerCase() === 'p'
      && m.to === pos.enPassant && pos.enPassant !== '-';
    return isCapture || isEp || m.promotion === 'q';
  }).filter((m) => !isKingInCheck(applyMove(pos, m), pos.side));

  caps.sort((a, b) => moveOrderScore(pos, b) - moveOrderScore(pos, a));

  for (const m of caps) {
    const score = -quiesce(applyMove(pos, m), -beta, -alpha, plyLeft - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// Negamax with alpha-beta pruning
function negamax(pos, depth, alpha, beta, ply) {
  if (depth === 0) return quiesce(pos, alpha, beta, 4);

  const moves = legalMoves(pos);

  if (moves.length === 0) {
    // Checkmate is worse the longer it takes; stalemate = 0
    return isKingInCheck(pos, pos.side) ? -(INF - ply) : 0;
  }

  moves.sort((a, b) => moveOrderScore(pos, b) - moveOrderScore(pos, a));

  for (const m of moves) {
    const score = -negamax(applyMove(pos, m), depth - 1, -beta, -alpha, ply + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function pickMove(pos) {
  let legal = legalMoves(pos);
  if (!legal.length) return null;
  if (legal.length === 1) return legal[0];

  legal.sort((a, b) => moveOrderScore(pos, b) - moveOrderScore(pos, a));

  const start = Date.now();
  const TIME_LIMIT = 850; // ms — leave margin under the 1000 ms hard deadline

  let bestMove = legal[0];

  // Iterative deepening: try depth 3 first, then 4 if time allows
  for (const DEPTH of [3, 4]) {
    if (Date.now() - start > TIME_LIMIT) break;

    let iterBest = null;
    let iterBestScore = -INF;
    let alpha = -INF;
    const beta = INF;
    let completed = true;

    for (const m of legal) {
      if (Date.now() - start > TIME_LIMIT) {
        completed = false;
        break;
      }
      
      const score = -negamax(applyMove(pos, m), DEPTH - 1, -beta, -alpha, 1);
      
      if (score > iterBestScore) {
        iterBestScore = score;
        iterBest = m;
      }
      if (score > alpha) alpha = score;
    }

    if (completed && iterBest) {
      bestMove = iterBest;
      // Bring best move to front for next depth iteration
      legal = [iterBest, ...legal.filter(m => m !== iterBest)];
    } else if (!completed) {
      break;
    }
  }

  return bestMove;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const fen = readFileSync(0, 'utf8').trim();
const pos = parseFen(fen);
const move = pickMove(pos);
process.stdout.write(`${move ? moveToUci(move) : '0000'}\n`);
