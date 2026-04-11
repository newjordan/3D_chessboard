import { readFileSync } from 'node:fs';

// ── Type Definitions ──────────────────────────────────────────────────────────

type Side = 'w' | 'b';

type Position = {
  board: string[];
  side: Side;
  castling: string;
  enPassant: string;
  halfmove: number;
  fullmove: number;
};

type Move = {
  from: string;
  to: string;
  promotion?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const FILES = 'abcdefgh';

const PIECE_VALUE: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

const PST_PAWN: number[] = [
  0,0,0,0,0,0,0,0,
  50,50,50,50,50,50,50,50,
  10,10,20,30,30,20,10,10,
  5,5,10,25,25,10,5,5,
  0,0,0,20,20,0,0,0,
  5,-5,-10,0,0,-10,-5,5,
  5,10,10,-20,-20,10,10,5,
  0,0,0,0,0,0,0,0
];

const PST_KNIGHT: number[] = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,0,0,0,0,-20,-40,
  -30,0,10,15,15,10,0,-30,
  -30,5,15,20,20,15,5,-30,
  -30,0,15,20,20,15,0,-30,
  -30,5,10,15,15,10,5,-30,
  -40,-20,0,5,5,0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];

const PST_BISHOP: number[] = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,0,0,0,0,0,0,-10,
  -10,0,5,10,10,5,0,-10,
  -10,5,5,10,10,5,5,-10,
  -10,0,10,10,10,10,0,-10,
  -10,10,10,10,10,10,10,-10,
  -10,5,0,0,0,0,5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20
];

const PST_ROOK: number[] = [
  0,0,0,0,0,0,0,0,
  5,10,10,10,10,10,10,5,
  -5,0,0,0,0,0,0,-5,
  -5,0,0,0,0,0,0,-5,
  -5,0,0,0,0,0,0,-5,
  -5,0,0,0,0,0,0,-5,
  -5,0,0,0,0,0,0,-5,
  0,0,0,5,5,0,0,0
];

const PST_QUEEN: number[] = [
  -20,-10,-10,-5,-5,-10,-10,-20,
  -10,0,0,0,0,0,0,-10,
  -10,0,5,5,5,5,0,-10,
  -5,0,5,5,5,5,0,-5,
  0,0,5,5,5,5,0,-5,
  -10,5,5,5,5,5,0,-10,
  -10,0,5,0,0,0,0,-10,
  -20,-10,-10,-5,-5,-10,-10,-20
];

const PST_KING_MG: number[] = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
  20,20,0,0,0,0,20,20,
  20,30,10,0,0,10,30,20
];

const PST_KING_EG: number[] = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,0,0,-10,-20,-30,
  -30,-10,20,30,30,20,-10,-30,
  -30,-10,30,40,40,30,-10,-30,
  -30,-10,30,40,40,30,-10,-30,
  -30,-10,20,30,30,20,-10,-30,
  -30,-30,0,0,0,0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50
];

const PST: Record<string, number[]> = {
  p: PST_PAWN, n: PST_KNIGHT, b: PST_BISHOP,
  r: PST_ROOK, q: PST_QUEEN,
};

const MATE_SCORE = 1_000_000;
const INF = 9_999_999;
const MAX_QSEARCH_DEPTH = 8;

// ── Search Globals ────────────────────────────────────────────────────────────

let searchAborted = false;
let searchDeadline = 0;

// ── Utilities ─────────────────────────────────────────────────────────────────

function squareToIndex(square: string): number {
  const file = FILES.indexOf(square[0]);
  const rank = 8 - Number(square[1]);
  return rank * 8 + file;
}

function indexToSquare(index: number): string {
  const rank = Math.floor(index / 8);
  const file = index % 8;
  return `${FILES[file]}${8 - rank}`;
}

function colorOf(piece: string): Side | null {
  if (!piece || piece === '.') return null;
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

function opposite(side: Side): Side {
  return side === 'w' ? 'b' : 'w';
}

function cloneBoard(board: string[]): string[] {
  return board.slice();
}

function mirrorIndex(i: number): number {
  const row = Math.floor(i / 8);
  const col = i % 8;
  return (7 - row) * 8 + col;
}

// ── FEN Parsing ───────────────────────────────────────────────────────────────

function parseFen(fen: string): Position {
  const [placement, side, castling, ep, halfmove, fullmove] = fen.trim().split(/\s+/);
  const board: string[] = [];
  for (const row of placement.split('/')) {
    for (const ch of row) {
      if (/\d/.test(ch)) board.push(...'.'.repeat(Number(ch)));
      else board.push(ch);
    }
  }
  return {
    board,
    side: (side || 'w') as Side,
    castling: castling && castling !== '-' ? castling : '-',
    enPassant: ep || '-',
    halfmove: Number(halfmove || 0),
    fullmove: Number(fullmove || 1),
  };
}

function stripCastling(castling: string): string {
  return castling.replace(/-/g, '');
}

function normalizeCastling(castling: string): string {
  const out = stripCastling(castling);
  return out || '-';
}

// ── Board Helpers ─────────────────────────────────────────────────────────────

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isSquareAttacked(pos: Position, sqIdx: number, by: Side): boolean {
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
        if (colorOf(p) === by && (p.toLowerCase() === 'b' || p.toLowerCase() === 'q')) return true;
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
        if (colorOf(p) === by && (p.toLowerCase() === 'r' || p.toLowerCase() === 'q')) return true;
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

function isKingInCheck(pos: Position, side: Side): boolean {
  const kingIdx = pos.board.findIndex((p) => p !== '.' && colorOf(p) === side && p.toLowerCase() === 'k');
  if (kingIdx < 0) return true;
  return isSquareAttacked(pos, kingIdx, opposite(side));
}

function hasPiece(pos: Position, sq: string, piece: string): boolean {
  return pos.board[squareToIndex(sq)] === piece;
}

function canCastle(pos: Position, side: Side, kind: 'king' | 'queen'): boolean {
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

// ── Move Application ──────────────────────────────────────────────────────────

function applyMove(pos: Position, move: Move): Position {
  const next: Position = {
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

  if (lower === 'p' || target !== '.' || (lower === 'p' && move.to === pos.enPassant)) next.halfmove = 0;
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
  if (target.toLowerCase() === 'r') {
    if (to === squareToIndex('a1')) next.castling = next.castling.replace('Q', '');
    if (to === squareToIndex('h1')) next.castling = next.castling.replace('K', '');
    if (to === squareToIndex('a8')) next.castling = next.castling.replace('q', '');
    if (to === squareToIndex('h8')) next.castling = next.castling.replace('k', '');
  }

  next.castling = normalizeCastling(next.castling);
  return next;
}

// ── Move Generation ───────────────────────────────────────────────────────────

function pseudoLegalMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const side = pos.side;
  const push = (m: Move) => moves.push(m);

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

    const addSlides = (dirs: number[][]) => {
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

function legalMoves(pos: Position): Move[] {
  return pseudoLegalMoves(pos).filter((m) => !isKingInCheck(applyMove(pos, m), pos.side));
}

function moveToUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

// ── Evaluation ────────────────────────────────────────────────────────────────

function isEndgame(pos: Position): boolean {
  const NPM: Record<string, number> = { n: 3, b: 3, r: 5, q: 9 };
  let whiteNPM = 0;
  let blackNPM = 0;
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (p === '.' || p.toLowerCase() === 'p' || p.toLowerCase() === 'k') continue;
    const val = NPM[p.toLowerCase()] || 0;
    if (colorOf(p) === 'w') whiteNPM += val;
    else blackNPM += val;
  }
  return whiteNPM < 13 && blackNPM < 13;
}

function evaluate(pos: Position): number {
  const endgame = isEndgame(pos);
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (p === '.') continue;
    const lower = p.toLowerCase();
    const val = PIECE_VALUE[lower] || 0;
    const isWhite = colorOf(p) === 'w';
    const idx = isWhite ? i : mirrorIndex(i);
    let pstVal = 0;
    if (lower === 'k') {
      pstVal = endgame ? PST_KING_EG[idx] : PST_KING_MG[idx];
    } else {
      pstVal = (PST[lower] || [])[idx] || 0;
    }
    if (isWhite) {
      score += val + pstVal;
    } else {
      score -= val + pstVal;
    }
  }
  return pos.side === 'w' ? score : -score;
}

// ── Move Ordering ─────────────────────────────────────────────────────────────

function scoreMove(pos: Position, move: Move): number {
  const fromIdx = squareToIndex(move.from);
  const toIdx = squareToIndex(move.to);
  const piece = pos.board[fromIdx];
  const target = pos.board[toIdx];
  const lower = piece.toLowerCase();

  if (move.promotion) {
    return 100000 + (PIECE_VALUE[move.promotion] || 0);
  }
  if (target !== '.') {
    const victimVal = PIECE_VALUE[target.toLowerCase()] || 0;
    const attackerVal = PIECE_VALUE[lower] || 0;
    return 50000 + victimVal * 10 - attackerVal;
  }
  if (lower === 'p' && move.to === pos.enPassant) {
    return 50000 + 100 * 10 - 100;
  }
  const isWhite = colorOf(piece) === 'w';
  const fromPST = lower === 'k' ? 0 : ((PST[lower] || [])[isWhite ? fromIdx : mirrorIndex(fromIdx)] || 0);
  const toPST = lower === 'k' ? 0 : ((PST[lower] || [])[isWhite ? toIdx : mirrorIndex(toIdx)] || 0);
  return toPST - fromPST;
}

function orderMoves(pos: Position, moves: Move[]): Move[] {
  const scored = moves.map(m => ({ move: m, score: scoreMove(pos, m) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.move);
}

// ── Search ────────────────────────────────────────────────────────────────────

function quiescence(pos: Position, alpha: number, beta: number, ply: number, qDepth: number): number {
  if (Date.now() >= searchDeadline) { searchAborted = true; return 0; }
  if (qDepth >= MAX_QSEARCH_DEPTH) return evaluate(pos);

  const standPat = evaluate(pos);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  const allMoves = legalMoves(pos);
  const tactical: Move[] = [];
  for (const m of allMoves) {
    const toIdx = squareToIndex(m.to);
    const fromIdx = squareToIndex(m.from);
    const target = pos.board[toIdx];
    const piece = pos.board[fromIdx];
    const isCapture = target !== '.';
    const isEP = piece.toLowerCase() === 'p' && m.to === pos.enPassant;
    const isPromo = !!m.promotion;
    if (isCapture || isEP || isPromo) tactical.push(m);
  }

  const ordered = orderMoves(pos, tactical);
  for (const move of ordered) {
    if (searchAborted) return 0;

    // Delta pruning: skip captures that can't possibly raise alpha
    const toIdx = squareToIndex(move.to);
    const capturedPiece = pos.board[toIdx];
    const capturedVal = capturedPiece !== '.' ? (PIECE_VALUE[capturedPiece.toLowerCase()] || 0) : 0;
    const promoVal = move.promotion ? (PIECE_VALUE[move.promotion] || 0) - PIECE_VALUE['p'] : 0;
    if (standPat + capturedVal + promoVal + 200 < alpha) continue;

    const next = applyMove(pos, move);
    const score = -quiescence(next, -beta, -alpha, ply + 1, qDepth + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(pos: Position, depth: number, alpha: number, beta: number, ply: number): number {
  if (Date.now() >= searchDeadline) { searchAborted = true; return 0; }

  // Check extension: when in check, extend search by 1 ply (cheap because few legal replies)
  const inCheck = isKingInCheck(pos, pos.side);
  const effectiveDepth = inCheck ? depth + 1 : depth;
  if (effectiveDepth <= 0) return quiescence(pos, alpha, beta, ply, 0);

  const moves = orderMoves(pos, legalMoves(pos));
  if (moves.length === 0) {
    if (inCheck) return -MATE_SCORE + ply;
    return 0;
  }

  for (const move of moves) {
    if (searchAborted) return 0;
    const next = applyMove(pos, move);
    const score = -negamax(next, effectiveDepth - 1, -beta, -alpha, ply + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function findBestMove(pos: Position): Move | null {
  const legal = legalMoves(pos);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  const startTime = Date.now();
  const TARGET_TIME = 100;
  const HARD_LIMIT = 500;

  searchDeadline = startTime + HARD_LIMIT;
  searchAborted = false;

  let bestMove: Move = legal[0];

  for (let depth = 1; depth <= 64; depth++) {
    let currentBest: Move | null = null;
    let currentScore = -INF;
    const ordered = orderMoves(pos, legal);

    for (const move of ordered) {
      if (searchAborted) break;
      const next = applyMove(pos, move);
      const score = -negamax(next, depth - 1, -INF, -currentScore, 1);
      if (searchAborted) break;
      if (score > currentScore) {
        currentScore = score;
        currentBest = move;
      }
    }

    if (!searchAborted && currentBest) {
      bestMove = currentBest;
    }

    if (Date.now() - startTime >= TARGET_TIME) break;
    if (searchAborted) break;
    if (currentScore >= MATE_SCORE - 100) break;
  }

  return bestMove;
}

// ── Main Execution ────────────────────────────────────────────────────────────

const fen: string = readFileSync(0, 'utf8').trim();
try {
  const pos: Position = parseFen(fen);
  const move: Move | null = findBestMove(pos);
  process.stdout.write(`${move ? moveToUci(move) : '0000'}\n`);
} catch (_e) {
  try {
    const pos: Position = parseFen(fen);
    const legal = legalMoves(pos);
    process.stdout.write(`${legal.length > 0 ? moveToUci(legal[0]) : '0000'}\n`);
  } catch (_e2) {
    process.stdout.write('0000\n');
  }
}
