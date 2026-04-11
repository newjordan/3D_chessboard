import { readFileSync } from 'node:fs';

/* ======================================================================
   Chess Agent — Enhanced
   Minimax + Alpha-Beta + Sunfish PSTs + Transposition Table (Zobrist)
   + Killer Moves + History Heuristic + Pawn Structure + King Safety
   + Endgame Detection + Quiescence Search
   ====================================================================== */

const FILES = 'abcdefgh';
const MATE = 50000;
const PIECE_VAL = { P: 100, N: 280, B: 320, R: 479, Q: 929, K: 60000 };

// ── Sunfish Piece-Square Tables ──────────────────────────────────────────
const PST = {
  P: [
     0,  0,  0,  0,  0,  0,  0,  0,
    78, 83, 86, 73,102, 82, 85, 90,
     7, 29, 21, 44, 40, 31, 44,  7,
   -17, 16, -2, 15, 14,  0, 15,-13,
   -26,  3, 10,  9,  6,  1,  0,-23,
   -22,  9,  5,-11,-10, -2,  3,-19,
   -31,  8, -7,-37,-36,-14,  3,-31,
     0,  0,  0,  0,  0,  0,  0,  0
  ],
  N: [
   -66,-53,-75,-75,-10,-55,-58,-70,
    -3, -6,100,-36,  4, 62,  -4,-14,
    10, 67,  1, 74, 73, 27, 62, -2,
    24, 24, 45, 37, 33, 41, 25, 17,
    -1,  5, 31, 21, 22, 35,  2,  0,
   -18, 10, 13, 22, 18, 15, 11,-14,
   -23,-15,  2,  0,  2,  0,-23,-20,
   -74,-23,-26,-24,-19,-35,-22,-69
  ],
  B: [
   -59,-78,-82,-76,-23,-107,-37,-50,
   -11, 20, 35,-42,-39, 31,  2,-22,
    -9, 39,-32, 41, 52,-10, 28,-14,
    25, 17, 20, 34, 26, 25, 15, 10,
    13, 10, 17, 23, 17, 16,  0,  7,
    14, 25, 24, 15,  8, 25, 20, 15,
    19, 20, 11,  6,  7,  6, 20, 16,
    -7,  2,-15,-12,-14,-15,-10,-10
  ],
  R: [
    35, 29, 33,  4, 37, 33, 56, 50,
    55, 29, 56, 67, 55, 62, 34, 60,
    19, 35, 28, 33, 45, 27, 25, 15,
     0,  5, 16, 13, 18, -4, -9, -6,
   -28,-35,-16,-21,-13,-29,-46,-30,
   -42,-28,-42,-25,-25,-35,-26,-46,
   -53,-38,-31,-26,-29,-43,-44,-53,
   -30,-24,-18,  5, -2,-18,-31,-32
  ],
  Q: [
     6,  1, -8,-104, 69, 24, 88, 26,
    14, 32, 60, -10, 20, 76, 57, 24,
    -2, 43, 32, 60, 72, 63, 43,  2,
     1,-16, 22, 17, 25, 20,-13, -6,
   -14,-15, -2, -5, -1,-10,-20,-22,
   -30, -6,-13,-11,-16,-11,-16,-27,
   -36,-18,  0,-19,-15,-15,-21,-38,
   -39,-30,-31,-13,-31,-36,-34,-42
  ],
  K: [
     4, 54, 47,-99,-99, 60, 83,-62,
   -32, 10, 55, 56, 56, 55, 10,  3,
   -62, 12,-57, 44,-67, 28, 37,-31,
   -55, 50, 11, -4,-19, 13,  0,-49,
   -55,-43,-52,-28,-51,-47, -8,-50,
   -47,-42,-43,-79,-64,-32,-29,-32,
    -4,  3,-14,-50,-57,-18, 13,  4,
    17, 30, -3,-14,  6, -1, 40, 18
  ]
};

// ── King Safety PST (prefer king behind pawns in middlegame) ─────────────
const K_MG = [
   -20, -10, -10, -10, -10, -10, -10, -20,
   -20, -10,   0,   0,   0,   0, -10, -20,
   -20,  -5,   5,  10,  10,   5,  -5, -20,
   -20,   0,  10,  20,  20,  10,   0, -20,
   -20,   0,  10,  20,  20,  10,   0, -20,
   -20,  -5,   5,  10,  10,   5,  -5, -20,
   -20, -10,   0,   0,   0,   0, -10, -20,
   -20,  -3,  -5,  -5,  -5,  -5,  -3, -20
];

// ── Utility ──────────────────────────────────────────────────────────────
function squareToIndex(sq) { return (8 - Number(sq[1])) * 8 + FILES.indexOf(sq[0]); }
function indexToSquare(i)  { return FILES[i % 8] + String(8 - Math.floor(i / 8)); }
function opposite(s) { return s === 'w' ? 'b' : 'w'; }
function colorOf(p) { return !p || p === '.' ? null : p === p.toUpperCase() ? 'w' : 'b'; }
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

// ── FEN Parser ───────────────────────────────────────────────────────────
function parseFen(fen) {
  const parts = fen.trim().split(/\s+/);
  const board = [];
  for (const ch of parts[0]) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') { for (let i = 0; i < Number(ch); i++) board.push('.'); }
    else board.push(ch);
  }
  return {
    board, side: parts[1] || 'w',
    castling: parts[2] === '-' ? '' : parts[2] || '',
    ep: parts[3] === '-' ? -1 : squareToIndex(parts[3]),
    halfmove: Number(parts[4] || 0),
    fullmove: Number(parts[5] || 1)
  };
}

// ── Zobrist Hashing ──────────────────────────────────────────────────────
// Deterministic pseudo-random numbers for position hashing
function rng(seed) {
  let s = seed;
  return function() { s = (s * 1664525 + 1013904223) | 0; return s >>> 0; };
}

const ZOBRIST_PIECE = new Array(12);  // 12 piece types
for (let pt = 0; pt < 12; pt++) {
  ZOBRIST_PIECE[pt] = new Array(64);
  const r = rng(pt * 100000 + 42);
  for (let sq = 0; sq < 64; sq++) ZOBRIST_PIECE[pt][sq] = r();
}
const ZOBRIST_EP = new Array(64);
{ const r = rng(999999); for (let i = 0; i < 64; i++) ZOBRIST_EP[i] = r(); }
const ZOBRIST_CASTLE = new Array(16);
{ const r = rng(888888); for (let i = 0; i < 16; i++) ZOBRIST_CASTLE[i] = r(); }
const ZOBRIST_SIDE = rng(777777);

const PIECE_TYPE_MAP = { P: 0, N: 1, B: 2, R: 3, Q: 4, K: 5, p: 6, n: 7, b: 8, r: 9, q: 10, k: 11 };

function computeHash(pos) {
  let h = 0;
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (p !== '.') h ^= ZOBRIST_PIECE[PIECE_TYPE_MAP[p]][i];
  }
  if (pos.ep >= 0) h ^= ZOBRIST_EP[pos.ep];
  // Castling: 4 bits KQkq
  let cMask = 0;
  if (pos.castling.includes('K')) cMask |= 1;
  if (pos.castling.includes('Q')) cMask |= 2;
  if (pos.castling.includes('k')) cMask |= 4;
  if (pos.castling.includes('q')) cMask |= 8;
  h ^= ZOBRIST_CASTLE[cMask];
  if (pos.side === 'w') h ^= ZOBRIST_SIDE;
  return h;
}

// ── Transposition Table ──────────────────────────────────────────────────
const TT = new Map();
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;

function ttStore(hash, depth, score, flag, move) {
  TT.set(hash, { depth, score, flag, move });
}

function ttProbe(hash, depth, alpha, beta) {
  const entry = TT.get(hash);
  if (!entry) return null;
  if (entry.depth < depth) return null;
  if (entry.flag === TT_EXACT) return { score: entry.score, move: entry.move };
  if (entry.flag === TT_LOWER && entry.score > alpha) alpha = entry.score;
  if (entry.flag === TT_UPPER && entry.score < beta) beta = entry.score;
  if (alpha >= beta) return { score: entry.flag === TT_LOWER ? alpha : beta, move: entry.move };
  return null;
}

// ── Evaluation ───────────────────────────────────────────────────────────
function countMaterial(board) {
  let total = 0;
  for (const p of board) {
    if (p === '.') continue;
    const t = p.toUpperCase();
    if (t === 'K') continue;
    total += PIECE_VAL[t] || 0;
  }
  return total;
}

function evaluate(pos) {
  let score = 0;
  let whiteMaterial = 0, blackMaterial = 0;

  // Count material and position
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (p === '.') continue;
    const c = colorOf(p);
    const t = p.toUpperCase();
    const r = Math.floor(i / 8), f = i % 8;
    const pstIdx = c === 'w' ? i : (7 - r) * 8 + f;

    if (t !== 'K') {
      if (c === 'w') whiteMaterial += PIECE_VAL[t];
      else blackMaterial += PIECE_VAL[t];
    }

    const val = PIECE_VAL[t] + (PST[t] ? PST[t][pstIdx] : 0);
    score += c === 'w' ? val : -val;
  }

  // Endgame factor (less material = more endgame)
  const totalMaterial = whiteMaterial + blackMaterial;
  const endgameFactor = Math.min(1, totalMaterial / 2400); // full material ~2400

  // Pawn structure evaluation
  for (let f = 0; f < 8; f++) {
    let whitePawns = 0, blackPawns = 0;
    let whitePawnSquares = [], blackPawnSquares = [];
    for (let r = 0; r < 8; r++) {
      const p = pos.board[r * 8 + f];
      if (p === 'P') { whitePawns++; whitePawnSquares.push(r * 8 + f); }
      if (p === 'p') { blackPawns++; blackPawnSquares.push(r * 8 + f); }
    }
    // Isolated pawn: no friendly pawns on adjacent files
    const leftFile = f > 0 ? f - 1 : -1;
    const rightFile = f < 7 ? f + 1 : -1;
    let leftWhite = 0, leftBlack = 0, rightWhite = 0, rightBlack = 0;
    if (leftFile >= 0) {
      for (let r = 0; r < 8; r++) {
        if (pos.board[r * 8 + leftFile] === 'P') leftWhite++;
        if (pos.board[r * 8 + leftFile] === 'p') leftBlack++;
      }
    }
    if (rightFile >= 0) {
      for (let r = 0; r < 8; r++) {
        if (pos.board[r * 8 + rightFile] === 'P') rightWhite++;
        if (pos.board[r * 8 + rightFile] === 'p') rightBlack++;
      }
    }
    if (whitePawns > 0 && leftWhite === 0 && rightWhite === 0) score -= 20; // isolated white pawn
    if (blackPawns > 0 && leftBlack === 0 && rightBlack === 0) score += 20; // isolated black pawn
    if (whitePawns > 1) score -= 10 * (whitePawns - 1); // doubled white pawns
    if (blackPawns > 1) score += 10 * (blackPawns - 1); // doubled black pawns
  }

  // King safety (middlegame only)
  if (endgameFactor > 0.3) {
    const wkIdx = pos.board.indexOf('K');
    const bkIdx = pos.board.indexOf('k');
    if (wkIdx >= 0) {
      const wkr = Math.floor(wkIdx / 8), wkf = wkIdx % 8;
      const kMgIdx = wkr * 8 + wkf;
      score += K_MG[kMgIdx] * (1 - endgameFactor);
    }
    if (bkIdx >= 0) {
      const bkr = Math.floor(bkIdx / 8), bkf = bkIdx % 8;
      const kMgIdx = bkr * 8 + bkf;
      score -= K_MG[kMgIdx] * (1 - endgameFactor);
    }
  }

  // Rook on open/semi-open file bonus
  for (let f = 0; f < 8; f++) {
    let whitePawns = 0, blackPawns = 0;
    for (let r = 0; r < 8; r++) {
      if (pos.board[r * 8 + f] === 'P') whitePawns++;
      if (pos.board[r * 8 + f] === 'p') blackPawns++;
    }
    for (let r = 0; r < 8; r++) {
      const p = pos.board[r * 8 + f];
      if (p === 'R') {
        if (whitePawns === 0) score += 15; // open file
        else if (whitePawns === 1) score += 8; // semi-open
      }
      if (p === 'r') {
        if (blackPawns === 0) score -= 15;
        else if (blackPawns === 1) score -= 8;
      }
    }
  }

  // Connected passed pawn bonus
  for (let f = 0; f < 8; f++) {
    let leftHasWhite = false, rightHasWhite = false;
    let leftHasBlack = false, rightHasBlack = false;
    if (f > 0) { for (let r = 0; r < 8; r++) { if (pos.board[r * 8 + f - 1] === 'P') leftHasWhite = true; if (pos.board[r * 8 + f - 1] === 'p') leftHasBlack = true; } }
    if (f < 7) { for (let r = 0; r < 8; r++) { if (pos.board[r * 8 + f + 1] === 'P') rightHasWhite = true; if (pos.board[r * 8 + f + 1] === 'p') rightHasBlack = true; } }
    for (let r = 0; r < 8; r++) {
      if (pos.board[r * 8 + f] === 'P') {
        let blocked = false;
        for (let rr = 0; rr < r; rr++) { if (pos.board[rr * 8 + f] === 'p') { blocked = true; break; } }
        if (!blocked && (leftHasWhite || rightHasWhite)) score += 25;
      }
      if (pos.board[r * 8 + f] === 'p') {
        let blocked = false;
        for (let rr = r + 1; rr < 8; rr++) { if (pos.board[rr * 8 + f] === 'P') { blocked = true; break; } }
        if (!blocked && (leftHasBlack || rightHasBlack)) score -= 25;
      }
    }
  }

  return pos.side === 'w' ? score : -score;
}

// ── Attack Detection ─────────────────────────────────────────────────────
function isSquareAttacked(pos, sqIdx, byColor) {
  const tr = Math.floor(sqIdx / 8), tc = sqIdx % 8;
  const pr = byColor === 'w' ? tr + 1 : tr - 1;
  for (const dc of [-1, 1]) {
    const c = tc + dc;
    if (!inBounds(pr, c)) continue;
    const p = pos.board[pr * 8 + c];
    if (p !== '.' && colorOf(p) === byColor && p.toLowerCase() === 'p') return true;
  }
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const r = tr + dr, c = tc + dc;
    if (!inBounds(r, c)) continue;
    const p = pos.board[r * 8 + c];
    if (p !== '.' && colorOf(p) === byColor && p.toLowerCase() === 'n') return true;
  }
  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    let r = tr + dr, c = tc + dc;
    while (inBounds(r, c)) {
      const p = pos.board[r * 8 + c];
      if (p !== '.') { if (colorOf(p) === byColor && (p.toLowerCase() === 'b' || p.toLowerCase() === 'q')) return true; break; }
      r += dr; c += dc;
    }
  }
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let r = tr + dr, c = tc + dc;
    while (inBounds(r, c)) {
      const p = pos.board[r * 8 + c];
      if (p !== '.') { if (colorOf(p) === byColor && (p.toLowerCase() === 'r' || p.toLowerCase() === 'q')) return true; break; }
      r += dr; c += dc;
    }
  }
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    const r = tr + dr, c = tc + dc;
    if (!inBounds(r, c)) continue;
    const p = pos.board[r * 8 + c];
    if (p !== '.' && colorOf(p) === byColor && p.toLowerCase() === 'k') return true;
  }
  return false;
}

function isKingInCheck(pos, side) {
  const kIdx = pos.board.findIndex(p => p !== '.' && colorOf(p) === side && p.toLowerCase() === 'k');
  if (kIdx < 0) return true;
  return isSquareAttacked(pos, kIdx, opposite(side));
}

// ── Castling ─────────────────────────────────────────────────────────────
function canCastle(pos, side, kind) {
  const c = pos.castling;
  const right = side === 'w' ? (kind === 'king' ? 'K' : 'Q') : (kind === 'king' ? 'k' : 'q');
  if (!c.includes(right)) return false;
  const kSq = side === 'w' ? 'e1' : 'e8';
  const rSq = side === 'w' ? (kind === 'king' ? 'h1' : 'a1') : (kind === 'king' ? 'h8' : 'a8');
  if (pos.board[squareToIndex(kSq)] !== (side === 'w' ? 'K' : 'k')) return false;
  if (pos.board[squareToIndex(rSq)] !== (side === 'w' ? 'R' : 'r')) return false;
  if (isKingInCheck(pos, side)) return false;
  const betw = side === 'w' ? (kind === 'king' ? ['f1','g1'] : ['d1','c1','b1']) : (kind === 'king' ? ['f8','g8'] : ['d8','c8','b8']);
  const pass = side === 'w' ? (kind === 'king' ? ['f1','g1'] : ['d1','c1']) : (kind === 'king' ? ['f8','g8'] : ['d8','c8']);
  for (const s of betw) if (pos.board[squareToIndex(s)] !== '.') return false;
  for (const s of pass) if (isSquareAttacked(pos, squareToIndex(s), opposite(side))) return false;
  return true;
}

// ── Move Generation ──────────────────────────────────────────────────────
function pseudoLegalMoves(pos) {
  const moves = [];
  for (let i = 0; i < 64; i++) {
    const piece = pos.board[i];
    if (piece === '.' || colorOf(piece) !== pos.side) continue;
    const r = Math.floor(i / 8), c = i % 8;
    const lower = piece.toLowerCase();
    if (lower === 'p') {
      const dir = pos.side === 'w' ? -1 : 1;
      const startRank = pos.side === 'w' ? 6 : 1;
      const promoRank = pos.side === 'w' ? 0 : 7;
      const oneR = r + dir;
      if (inBounds(oneR, c) && pos.board[oneR * 8 + c] === '.') {
        const to = oneR * 8 + c;
        if (oneR === promoRank) { for (const p of ['q','r','b','n']) moves.push({ from: indexToSquare(i), to: indexToSquare(to), promotion: p }); }
        else moves.push({ from: indexToSquare(i), to: indexToSquare(to) });
        const twoR = r + dir * 2;
        if (r === startRank && inBounds(twoR, c) && pos.board[twoR * 8 + c] === '.') moves.push({ from: indexToSquare(i), to: indexToSquare(twoR * 8 + c) });
      }
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const to = nr * 8 + nc;
        const target = pos.board[to];
        const toSq = indexToSquare(to);
        if (to === pos.ep || (target !== '.' && colorOf(target) !== pos.side)) {
          if (nr === promoRank) { for (const p of ['q','r','b','n']) moves.push({ from: indexToSquare(i), to: toSq, promotion: p }); }
          else moves.push({ from: indexToSquare(i), to: toSq });
        }
      }
    } else if (lower === 'n') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const t = pos.board[nr * 8 + nc];
        if (t === '.' || colorOf(t) !== pos.side) moves.push({ from: indexToSquare(i), to: indexToSquare(nr * 8 + nc) });
      }
    } else if (lower === 'b' || lower === 'r' || lower === 'q') {
      const dirs = [];
      if (lower === 'b' || lower === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
      if (lower === 'r' || lower === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
          const t = pos.board[nr * 8 + nc];
          if (t === '.') moves.push({ from: indexToSquare(i), to: indexToSquare(nr * 8 + nc) });
          else { if (colorOf(t) !== pos.side) moves.push({ from: indexToSquare(i), to: indexToSquare(nr * 8 + nc) }); break; }
          nr += dr; nc += dc;
        }
      }
    } else if (lower === 'k') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const t = pos.board[nr * 8 + nc];
        if (t === '.' || colorOf(t) !== pos.side) moves.push({ from: indexToSquare(i), to: indexToSquare(nr * 8 + nc) });
      }
      if (canCastle(pos, pos.side, 'king')) moves.push({ from: indexToSquare(i), to: pos.side === 'w' ? 'g1' : 'g8' });
      if (canCastle(pos, pos.side, 'queen')) moves.push({ from: indexToSquare(i), to: pos.side === 'w' ? 'c1' : 'c8' });
    }
  }
  return moves;
}

// ── Make Move ────────────────────────────────────────────────────────────
function makeMove(pos, move) {
  const b = pos.board.slice();
  const from = squareToIndex(move.from), to = squareToIndex(move.to);
  const piece = b[from];
  const cap = b[to];
  const lower = piece.toLowerCase();
  b[from] = '.';
  if (lower === 'p' && to === pos.ep && cap === '.') b[to + (pos.side === 'w' ? 8 : -8)] = '.';
  if (lower === 'k' && Math.abs(to - from) === 2) {
    if (move.to === 'g1') { b[squareToIndex('f1')] = b[squareToIndex('h1')]; b[squareToIndex('h1')] = '.'; }
    else if (move.to === 'c1') { b[squareToIndex('d1')] = b[squareToIndex('a1')]; b[squareToIndex('a1')] = '.'; }
    else if (move.to === 'g8') { b[squareToIndex('f8')] = b[squareToIndex('h8')]; b[squareToIndex('h8')] = '.'; }
    else if (move.to === 'c8') { b[squareToIndex('d8')] = b[squareToIndex('a8')]; b[squareToIndex('a8')] = '.'; }
  }
  b[to] = move.promotion ? (pos.side === 'w' ? move.promotion.toUpperCase() : move.promotion.toLowerCase()) : piece;
  let cast = pos.castling;
  if (lower === 'k') cast = cast.replace(pos.side === 'w' ? /[KQ]/g : /[kq]/g, '');
  if (lower === 'r') {
    if (from === 56) cast = cast.replace('Q',''); if (from === 63) cast = cast.replace('K','');
    if (from === 0) cast = cast.replace('q',''); if (from === 7) cast = cast.replace('k','');
  }
  if (cap && cap.toLowerCase() === 'r') {
    if (to === 56) cast = cast.replace('Q',''); if (to === 63) cast = cast.replace('K','');
    if (to === 0) cast = cast.replace('q',''); if (to === 7) cast = cast.replace('k','');
  }
  let newEp = -1;
  if (lower === 'p' && Math.abs(to - from) === 16) newEp = (from + to) / 2;
  return {
    board: b, side: opposite(pos.side), castling: cast, ep: newEp,
    halfmove: (lower === 'p' || cap !== '.' || (lower === 'p' && to === pos.ep)) ? 0 : pos.halfmove + 1,
    fullmove: pos.fullmove + (pos.side === 'b' ? 1 : 0)
  };
}

// ── Move Ordering (MVV-LVA + Killer + History) ───────────────────────────
// Killer moves table: killer[depth][0] and killer[depth][1]
const killerTable = new Map();
// History table: history[from_square][to_square]
const historyTable = new Array(64);
for (let i = 0; i < 64; i++) historyTable[i] = new Array(64).fill(0);

function scoreMove(pos, m, killers) {
  let s = 0;
  const to = pos.board[squareToIndex(m.to)];
  if (to !== '.') {
    s = 10000 + (PIECE_VAL[to.toUpperCase()] || 0) * 10 - (PIECE_VAL[pos.board[squareToIndex(m.from)].toUpperCase()] || 0);
  }
  if (m.promotion) s += 9000 + PIECE_VAL[m.promotion.toUpperCase()];
  if (killers && killers.length > 0 && killers.some(k => k && k.from === m.from && k.to === m.to)) s += 8000;
  const fromSq = squareToIndex(m.from), toSq = squareToIndex(m.to);
  s += historyTable[fromSq][toSq];
  return s;
}

function orderMoves(pos, moves, killers) {
  return moves.map(m => ({ m, s: scoreMove(pos, m, killers) })).sort((a, b) => b.s - a.s).map(e => e.m);
}

// ── Quiescence Search ────────────────────────────────────────────────────
function quiesce(pos, alpha, beta) {
  const stand = evaluate(pos);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const moves = pseudoLegalMoves(pos);
  const captures = [];
  for (const m of moves) {
    const toSq = pos.board[squareToIndex(m.to)];
    const isCap = toSq !== '.' || (pos.board[squareToIndex(m.from)].toLowerCase() === 'p' && squareToIndex(m.to) === pos.ep);
    if (!isCap) continue;
    const next = makeMove(pos, m);
    const kIdx = next.board.findIndex(p => p !== '.' && colorOf(p) === pos.side && p.toLowerCase() === 'k');
    if (kIdx < 0) continue;
    if (!isSquareAttacked(next, kIdx, opposite(pos.side))) captures.push(m);
  }

  captures.sort((a, b) => {
    const va = PIECE_VAL[(pos.board[squareToIndex(a.to)] || '.').toUpperCase()] || 0;
    const vb = PIECE_VAL[(pos.board[squareToIndex(b.to)] || '.').toUpperCase()] || 0;
    return vb - va;
  });

  for (const m of captures) {
    const score = -quiesce(makeMove(pos, m), -beta, -alpha);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// ── Alpha-Beta with TT + Killer + History ────────────────────────────────
function alphaBeta(pos, depth, alpha, beta) {
  // TT probe
  const hash = computeHash(pos);
  const ttResult = ttProbe(hash, depth, alpha, beta);
  if (ttResult) return ttResult.score;

  if (depth === 0) return quiesce(pos, alpha, beta);

  const pMoves = pseudoLegalMoves(pos);
  const legal = [];
  for (const m of pMoves) {
    const next = makeMove(pos, m);
    const kIdx = next.board.findIndex(p => p !== '.' && colorOf(p) === pos.side && p.toLowerCase() === 'k');
    if (kIdx < 0) continue;
    if (!isSquareAttacked(next, kIdx, opposite(pos.side))) legal.push(m);
  }
  if (legal.length === 0) return isKingInCheck(pos, pos.side) ? -MATE + 1 : 0;

  // Get killers for this depth
  const killers = killerTable.get(depth) || [];

  // Order moves
  const ordered = orderMoves(pos, legal, killers);

  let best = -Infinity;
  let bestMove = null;
  let searched = 0;

  for (const m of ordered) {
    const next = makeMove(pos, m);
    const score = -alphaBeta(next, depth - 1, -beta, -alpha);
    if (score > best) { best = score; bestMove = m; }
    if (best > alpha) alpha = best;
    if (alpha >= beta) {
      // Record killer move
      if (!killers.some(k => k && k.from === m.from && k.to === m.to)) {
        killers.unshift(m);
        if (killers.length > 2) killers.pop();
        killerTable.set(depth, killers);
      }
      // Update history
      const fs = squareToIndex(m.from), ts = squareToIndex(m.to);
      historyTable[fs][ts] += depth * depth;
      if (historyTable[fs][ts] > 3000) {
        for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) historyTable[i][j] = Math.floor(historyTable[i][j] / 2);
      }
      break;
    }
    searched++;
  }

  // Store in TT
  let flag = TT_EXACT;
  if (best <= (ttResult ? ttResult.score : -Infinity)) flag = TT_UPPER;
  if (best >= beta) flag = TT_LOWER;
  ttStore(hash, depth, best, flag, bestMove);

  return best;
}

// ── Root Search ──────────────────────────────────────────────────────────
function search(pos) {
  const pMoves = pseudoLegalMoves(pos);
  const legal = [];
  for (const m of pMoves) {
    const next = makeMove(pos, m);
    const kIdx = next.board.findIndex(p => p !== '.' && colorOf(p) === pos.side && p.toLowerCase() === 'k');
    if (kIdx < 0) continue;
    if (!isSquareAttacked(next, kIdx, opposite(pos.side))) legal.push(m);
  }
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  TT.clear();
  killerTable.clear();

  // Order root moves
  const ordered = orderMoves(pos, legal, []);

  let bestMove = ordered[0];
  const depth = 3;
  let alpha = -MATE, beta = MATE;

  for (const m of ordered) {
    const score = -alphaBeta(makeMove(pos, m), depth - 1, -beta, -alpha);
    if (score > alpha) { alpha = score; bestMove = m; }
  }

  return bestMove;
}

// ── Main ─────────────────────────────────────────────────────────────────
const fen = readFileSync(0, 'utf8').trim();
const pos = parseFen(fen);

const pMoves = pseudoLegalMoves(pos);
const legal = [];
for (const m of pMoves) {
  const next = makeMove(pos, m);
  const kIdx = next.board.findIndex(p => p !== '.' && colorOf(p) === pos.side && p.toLowerCase() === 'k');
  if (kIdx < 0) continue;
  if (!isSquareAttacked(next, kIdx, opposite(pos.side))) legal.push(m);
}

if (legal.length === 0) {
  process.stdout.write('0000\n');
} else if (legal.length === 1) {
  const m = legal[0];
  process.stdout.write(`${m.from}${m.to}${m.promotion || ''}\n`);
} else {
  const best = search(pos);
  process.stdout.write(`${best.from}${best.to}${best.promotion || ''}\n`);
}
