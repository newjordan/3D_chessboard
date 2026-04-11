import { readFileSync } from 'node:fs';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const FILES = 'abcdefgh';
const INF = 999999;
const MATE_SCORE = 100000;
const MAX_PLY = 100;
const TIME_BUDGET = 350; // ms — 350ms search + ~100ms overhead = ~450ms total

// Move encoding: (from << 9) | (to << 3) | promo
const PROMO_ENC = { q: 1, r: 2, b: 3, n: 4 };
const PROMO_DEC = [undefined, 'q', 'r', 'b', 'n'];
const NO_MOVE = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// BOARD UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════
function sq2i(sq) { return (8 - +sq[1]) * 8 + FILES.indexOf(sq[0]); }
function i2sq(i) { return FILES[i & 7] + (8 - (i >> 3)); }
function colorOf(p) { if (p === '.') return null; return p === p.toUpperCase() ? 'w' : 'b'; }
function opp(s) { return s === 'w' ? 'b' : 'w'; }

function encMove(from, to, promo) {
  return (from << 9) | (to << 3) | (promo ? PROMO_ENC[promo] : 0);
}
function mFrom(m) { return m >> 9; }
function mTo(m) { return (m >> 3) & 63; }
function mPromo(m) { return PROMO_DEC[m & 7]; }
function moveToUci(m) { return i2sq(mFrom(m)) + i2sq(mTo(m)) + (mPromo(m) || ''); }

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTION TABLES
// ═══════════════════════════════════════════════════════════════════════════════
const KNIGHT_DIRS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const DIAG_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ORTH_DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
const ALL_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];

// ═══════════════════════════════════════════════════════════════════════════════
// ZOBRIST HASHING
// ═══════════════════════════════════════════════════════════════════════════════
const Z = (() => {
  let s = 1070372;
  const r32 = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0; };
  const piece = {};
  for (const p of 'PNBRQKpnbrqk') {
    piece[p] = new Uint32Array(64);
    for (let i = 0; i < 64; i++) piece[p][i] = r32();
  }
  const side = r32();
  const ep = new Uint32Array(8);
  for (let i = 0; i < 8; i++) ep[i] = r32();
  const castle = new Uint32Array(16);
  for (let i = 0; i < 16; i++) castle[i] = r32();
  return { piece, side, ep, castle };
})();

// ═══════════════════════════════════════════════════════════════════════════════
// CASTLING — bitmask: K=8, Q=4, k=2, q=1
// ═══════════════════════════════════════════════════════════════════════════════
function castleStr2Bits(s) {
  if (!s || s === '-') return 0;
  let b = 0;
  if (s.includes('K')) b |= 8;
  if (s.includes('Q')) b |= 4;
  if (s.includes('k')) b |= 2;
  if (s.includes('q')) b |= 1;
  return b;
}

const CASTLE_MASK = new Uint8Array(64).fill(15);
CASTLE_MASK[sq2i('a1')] &= ~4;
CASTLE_MASK[sq2i('e1')] &= ~12;
CASTLE_MASK[sq2i('h1')] &= ~8;
CASTLE_MASK[sq2i('a8')] &= ~1;
CASTLE_MASK[sq2i('e8')] &= ~3;
CASTLE_MASK[sq2i('h8')] &= ~2;

// ═══════════════════════════════════════════════════════════════════════════════
// FEN PARSING
// ═══════════════════════════════════════════════════════════════════════════════
function parseFen(fen) {
  const parts = fen.trim().split(/\s+/);
  const board = [];
  for (const row of parts[0].split('/')) {
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') { for (let j = 0; j < +ch; j++) board.push('.'); }
      else board.push(ch);
    }
  }
  const side = parts[1] || 'w';
  const castle = castleStr2Bits(parts[2]);
  const epStr = parts[3];
  const epSq = (epStr && epStr !== '-') ? sq2i(epStr) : -1;

  let hash = 0;
  let wk = -1, bk = -1;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p !== '.') {
      hash ^= Z.piece[p][i];
      if (p === 'K') wk = i;
      if (p === 'k') bk = i;
    }
  }
  if (side === 'b') hash ^= Z.side;
  if (epSq >= 0) hash ^= Z.ep[epSq & 7];
  hash ^= Z.castle[castle];

  return {
    board, side, castle, ep: epSq,
    halfmove: +(parts[4] || 0), fullmove: +(parts[5] || 1),
    hash: hash >>> 0, wk, bk,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATTACK DETECTION
// ═══════════════════════════════════════════════════════════════════════════════
function isAttacked(board, sq, by) {
  const tr = sq >> 3, tc = sq & 7;

  // Pawn
  const pr = by === 'w' ? tr + 1 : tr - 1;
  if (pr >= 0 && pr < 8) {
    if (tc > 0) { const p = board[pr * 8 + tc - 1]; if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'p') return true; }
    if (tc < 7) { const p = board[pr * 8 + tc + 1]; if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'p') return true; }
  }

  // Knight
  for (const [dr, dc] of KNIGHT_DIRS) {
    const r = tr + dr, c = tc + dc;
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const p = board[r * 8 + c];
      if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'n') return true;
    }
  }

  // Diagonal sliders (bishop, queen)
  for (const [dr, dc] of DIAG_DIRS) {
    let r = tr + dr, c = tc + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const p = board[r * 8 + c];
      if (p !== '.') {
        if (colorOf(p) === by) { const l = p.toLowerCase(); if (l === 'b' || l === 'q') return true; }
        break;
      }
      r += dr; c += dc;
    }
  }

  // Orthogonal sliders (rook, queen)
  for (const [dr, dc] of ORTH_DIRS) {
    let r = tr + dr, c = tc + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const p = board[r * 8 + c];
      if (p !== '.') {
        if (colorOf(p) === by) { const l = p.toLowerCase(); if (l === 'r' || l === 'q') return true; }
        break;
      }
      r += dr; c += dc;
    }
  }

  // King
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const r = tr + dr, c = tc + dc;
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const p = board[r * 8 + c];
      if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'k') return true;
    }
  }

  return false;
}

// Check if the given side's king is in check (uses cached king positions)
function sideInCheck(pos, side) {
  const ki = side === 'w' ? pos.wk : pos.bk;
  if (ki < 0) return true;
  return isAttacked(pos.board, ki, opp(side));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASTLING VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════
function canCastle(pos, kind) {
  const { side, board, castle } = pos;
  const bit = side === 'w' ? (kind === 'K' ? 8 : 4) : (kind === 'K' ? 2 : 1);
  if (!(castle & bit)) return false;

  const rank = side === 'w' ? 7 : 0;
  const kingIdx = rank * 8 + 4;
  if (board[kingIdx] !== (side === 'w' ? 'K' : 'k')) return false;

  const enemy = opp(side);
  if (isAttacked(board, kingIdx, enemy)) return false;

  if (kind === 'K') {
    if (board[rank * 8 + 7] !== (side === 'w' ? 'R' : 'r')) return false;
    if (board[rank * 8 + 5] !== '.' || board[rank * 8 + 6] !== '.') return false;
    if (isAttacked(board, rank * 8 + 5, enemy) || isAttacked(board, rank * 8 + 6, enemy)) return false;
  } else {
    if (board[rank * 8] !== (side === 'w' ? 'R' : 'r')) return false;
    if (board[rank * 8 + 1] !== '.' || board[rank * 8 + 2] !== '.' || board[rank * 8 + 3] !== '.') return false;
    if (isAttacked(board, rank * 8 + 3, enemy) || isAttacked(board, rank * 8 + 2, enemy)) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVE APPLICATION (incremental Zobrist hash + king position tracking)
// ═══════════════════════════════════════════════════════════════════════════════
function applyMove(pos, mv) {
  const from = mFrom(mv), to = mTo(mv), promo = mPromo(mv);
  const board = pos.board.slice();
  const piece = board[from];
  const captured = board[to];
  const lower = piece.toLowerCase();
  let hash = pos.hash;

  hash ^= Z.castle[pos.castle];
  if (pos.ep >= 0) hash ^= Z.ep[pos.ep & 7];

  hash ^= Z.piece[piece][from];
  board[from] = '.';

  if (captured !== '.') hash ^= Z.piece[captured][to];

  // En passant capture
  let epCapIdx = -1;
  if (lower === 'p' && to === pos.ep && captured === '.') {
    epCapIdx = to + (pos.side === 'w' ? 8 : -8);
    hash ^= Z.piece[board[epCapIdx]][epCapIdx];
    board[epCapIdx] = '.';
  }

  // Castling rook
  if (lower === 'k' && Math.abs((to & 7) - (from & 7)) === 2) {
    const rk = from >> 3;
    if ((to & 7) === 6) {
      const rf = rk * 8 + 7, rt = rk * 8 + 5;
      hash ^= Z.piece[board[rf]][rf]; hash ^= Z.piece[board[rf]][rt];
      board[rt] = board[rf]; board[rf] = '.';
    } else {
      const rf = rk * 8, rt = rk * 8 + 3;
      hash ^= Z.piece[board[rf]][rf]; hash ^= Z.piece[board[rf]][rt];
      board[rt] = board[rf]; board[rf] = '.';
    }
  }

  const newPiece = promo
    ? (pos.side === 'w' ? promo.toUpperCase() : promo.toLowerCase())
    : piece;
  board[to] = newPiece;
  hash ^= Z.piece[newPiece][to];

  const newCastle = pos.castle & CASTLE_MASK[from] & CASTLE_MASK[to];
  hash ^= Z.castle[newCastle];

  let newEp = -1;
  if (lower === 'p' && Math.abs(to - from) === 16) {
    newEp = (from + to) >> 1;
    hash ^= Z.ep[newEp & 7];
  }

  hash ^= Z.side;

  // Track king positions
  let wk = pos.wk, bk = pos.bk;
  if (piece === 'K') wk = to;
  else if (piece === 'k') bk = to;

  return {
    board, side: opp(pos.side), castle: newCastle, ep: newEp,
    halfmove: (lower === 'p' || captured !== '.' || epCapIdx >= 0) ? 0 : pos.halfmove + 1,
    fullmove: pos.fullmove + (pos.side === 'b' ? 1 : 0),
    hash: hash >>> 0, wk, bk,
  };
}

function applyNull(pos) {
  let hash = pos.hash;
  hash ^= Z.side;
  if (pos.ep >= 0) hash ^= Z.ep[pos.ep & 7];
  return {
    board: pos.board, side: opp(pos.side), castle: pos.castle, ep: -1,
    halfmove: pos.halfmove, fullmove: pos.fullmove,
    hash: hash >>> 0, wk: pos.wk, bk: pos.bk,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVE GENERATION (pseudo-legal)
// ═══════════════════════════════════════════════════════════════════════════════
function genMoves(pos) {
  const moves = [];
  const { board, side, ep } = pos;

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (piece === '.' || colorOf(piece) !== side) continue;
    const r = i >> 3, c = i & 7;
    const lower = piece.toLowerCase();

    if (lower === 'p') {
      const dir = side === 'w' ? -1 : 1;
      const startRank = side === 'w' ? 6 : 1;
      const promoRank = side === 'w' ? 0 : 7;
      const nr = r + dir;
      if (nr >= 0 && nr < 8) {
        const toFwd = nr * 8 + c;
        if (board[toFwd] === '.') {
          if (nr === promoRank) {
            moves.push(encMove(i, toFwd, 'q'), encMove(i, toFwd, 'r'), encMove(i, toFwd, 'b'), encMove(i, toFwd, 'n'));
          } else {
            moves.push(encMove(i, toFwd, null));
            const nr2 = r + dir * 2;
            if (r === startRank && board[nr2 * 8 + c] === '.') moves.push(encMove(i, nr2 * 8 + c, null));
          }
        }
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (nc < 0 || nc >= 8) continue;
          const toIdx = nr * 8 + nc;
          const tgt = board[toIdx];
          if ((tgt !== '.' && colorOf(tgt) !== side) || toIdx === ep) {
            if (nr === promoRank) {
              moves.push(encMove(i, toIdx, 'q'), encMove(i, toIdx, 'r'), encMove(i, toIdx, 'b'), encMove(i, toIdx, 'n'));
            } else {
              moves.push(encMove(i, toIdx, null));
            }
          }
        }
      }
      continue;
    }

    if (lower === 'n') {
      for (const [dr, dc] of KNIGHT_DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const tgt = board[nr * 8 + nc];
          if (tgt === '.' || colorOf(tgt) !== side) moves.push(encMove(i, nr * 8 + nc, null));
        }
      }
      continue;
    }

    if (lower === 'b' || lower === 'r' || lower === 'q') {
      const dirs = lower === 'b' ? DIAG_DIRS : lower === 'r' ? ORTH_DIRS : ALL_DIRS;
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const tgt = board[nr * 8 + nc];
          if (tgt === '.') { moves.push(encMove(i, nr * 8 + nc, null)); }
          else { if (colorOf(tgt) !== side) moves.push(encMove(i, nr * 8 + nc, null)); break; }
          nr += dr; nc += dc;
        }
      }
      continue;
    }

    if (lower === 'k') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const tgt = board[nr * 8 + nc];
          if (tgt === '.' || colorOf(tgt) !== side) moves.push(encMove(i, nr * 8 + nc, null));
        }
      }
      if (canCastle(pos, 'K')) moves.push(encMove(i, r * 8 + 6, null));
      if (canCastle(pos, 'Q')) moves.push(encMove(i, r * 8 + 2, null));
    }
  }
  return moves;
}

function legalMoves(pos) {
  return genMoves(pos).filter(mv => {
    const next = applyMove(pos, mv);
    return !sideInCheck(next, pos.side);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUATION — Tapered PeSTO + pawn structure + rook files + king safety
// ═══════════════════════════════════════════════════════════════════════════════
const MG_MAT = { p: 82, n: 337, b: 365, r: 477, q: 1025, k: 0 };
const EG_MAT = { p: 94, n: 281, b: 297, r: 512, q: 936, k: 0 };
const PHASE_W = { p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 };

const MG_PST = {
  p: [0,0,0,0,0,0,0,0,98,134,61,95,68,126,34,-11,-6,7,26,31,65,56,25,-20,-14,13,6,21,23,12,17,-23,-27,-2,-5,12,17,6,10,-25,-26,-4,-4,-10,3,3,33,-12,-35,-1,-20,-23,-15,24,38,-22,0,0,0,0,0,0,0,0],
  n: [-167,-89,-34,-49,61,-97,-15,-107,-73,-41,72,36,23,62,7,-17,-47,60,37,65,84,129,73,44,-9,17,19,53,37,69,18,22,-13,4,16,13,28,19,21,-8,-23,-9,12,10,19,17,25,-16,-29,-53,-12,-3,-1,18,-14,-19,-105,-21,-58,-33,-17,-28,-19,-23],
  b: [-29,4,-82,-37,-25,-42,7,-8,-26,16,-18,-13,30,59,18,-47,-16,37,43,40,35,50,37,-2,-4,5,19,50,37,37,7,-2,-6,13,13,26,34,12,10,4,0,15,15,15,14,27,18,10,4,15,16,0,7,21,33,1,-33,-3,-14,-21,-13,-12,-39,-21],
  r: [32,42,32,51,63,9,31,43,27,32,58,62,80,67,26,44,-5,19,26,36,17,45,61,16,-24,-11,7,26,24,35,-8,-20,-36,-26,-12,-1,9,-7,6,-23,-45,-25,-16,-17,3,0,-5,-33,-44,-16,-20,-9,-1,11,-6,-71,-19,-13,1,17,16,7,-37,-26],
  q: [-28,0,29,12,59,44,43,45,-24,-39,-5,1,-16,57,28,54,-13,-17,7,8,29,56,47,57,-27,-27,-16,-16,-1,17,-2,1,-9,-26,-9,-10,-2,-4,3,-3,-14,2,-11,-2,-5,2,14,5,-35,-8,11,2,8,15,-3,1,-1,-18,-9,10,-15,-25,-31,-50],
  k: [-65,23,16,-15,-56,-34,2,13,29,-1,-20,-7,-8,-4,-38,-29,-9,24,2,-16,-20,6,22,-22,-17,-20,-12,-27,-30,-25,-14,-36,-49,-1,-27,-39,-46,-44,-33,-51,-14,-14,-22,-46,-44,-30,-15,-27,1,7,-8,-64,-43,-16,9,8,-15,36,12,-54,8,-28,24,14],
};
const EG_PST = {
  p: [0,0,0,0,0,0,0,0,178,173,158,134,147,132,165,187,94,100,85,67,56,53,82,84,32,24,13,5,-2,4,17,17,13,9,-3,-7,-7,-8,3,-1,4,7,-6,1,0,-5,-1,-8,13,8,8,-10,-6,-8,-4,-14,0,0,0,0,0,0,0,0],
  n: [-58,-38,-13,-28,-31,-27,-63,-99,-25,-8,-25,-2,-9,-25,-24,-52,-24,-20,10,9,-1,-9,-19,-41,-17,3,22,22,22,11,8,-18,-18,-6,16,25,16,17,4,-18,-23,-3,-1,15,10,-3,-20,-22,-42,-20,-10,-5,-2,-20,-23,-44,-29,-51,-23,-15,-22,-18,-50,-64],
  b: [-14,-21,-11,-8,-7,-9,-17,-24,-8,-4,7,-12,-3,-13,-4,-14,2,-8,0,-1,-2,6,0,4,-3,9,12,9,14,10,3,2,-6,3,13,19,7,10,-3,-9,-12,-3,8,10,13,3,-7,-15,-14,-18,-7,-1,4,-9,-15,-27,-23,-9,-23,-5,-9,-16,-5,-17],
  r: [13,10,18,15,12,12,8,5,11,13,13,11,-3,3,8,3,7,7,7,5,4,-3,-5,-3,4,3,13,1,2,1,-1,2,3,5,8,4,-5,-6,-8,-11,-4,0,-5,-1,-7,-12,-8,-16,-6,-6,0,2,-9,-9,-11,-3,-9,2,3,-1,-5,-13,4,-20],
  q: [-9,22,22,27,27,19,10,20,-17,20,32,41,58,25,30,0,-20,6,9,49,47,35,19,9,3,22,24,45,57,40,57,36,-18,28,19,47,31,34,39,23,-16,-27,15,6,9,17,10,5,-22,-23,-30,-16,-16,-23,-36,-32,-33,-28,-22,-43,-5,-32,-20,-41],
  k: [-74,-35,-18,-18,-11,15,4,-17,-12,17,14,17,17,38,23,11,10,17,23,15,20,45,44,13,-8,22,24,27,26,33,26,3,-18,-4,21,24,27,23,9,-11,-19,-3,11,21,23,16,7,-9,-27,-11,4,13,14,4,-5,-17,-53,-34,-21,-11,-28,-14,-24,-43],
};

// Passed pawn bonus by advancement: index = ranks advanced (0=just left start, 6=one step from promo)
const PASSED_MG = [0, 5, 10, 20, 40, 65, 100];
const PASSED_EG = [0, 10, 20, 45, 80, 135, 230];

// Center distance table for mop-up eval (0=center, 3=corner)
const CENTER_DIST = [
  3,3,3,3,3,3,3,3,
  3,2,2,2,2,2,2,3,
  3,2,1,1,1,1,2,3,
  3,2,1,0,0,1,2,3,
  3,2,1,0,0,1,2,3,
  3,2,1,1,1,1,2,3,
  3,2,2,2,2,2,2,3,
  3,3,3,3,3,3,3,3,
];

function manhattanDist(a, b) {
  return Math.abs((a >> 3) - (b >> 3)) + Math.abs((a & 7) - (b & 7));
}

// SEE piece values for bad capture pruning
const SEE_VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

function evaluate(pos) {
  const { board } = pos;
  let mg = 0, eg = 0, phase = 0;
  let wB = 0, bB = 0;
  let wMat = 0, bMat = 0; // raw material for mop-up eval

  // Pawn file data for structure evaluation
  const wPF = [0,0,0,0,0,0,0,0]; // white pawn count per file
  const bPF = [0,0,0,0,0,0,0,0]; // black pawn count per file
  const wPBest = [8,8,8,8,8,8,8,8]; // most advanced white pawn per file (min row)
  const bPBest = [-1,-1,-1,-1,-1,-1,-1,-1]; // most advanced black pawn per file (max row)
  const bPMin = [8,8,8,8,8,8,8,8]; // min row of black pawn per file (for white passed check)
  const wPMax = [-1,-1,-1,-1,-1,-1,-1,-1]; // max row of white pawn per file (for black passed check)

  // Rook file presence (bitmask)
  let wRookFiles = 0, bRookFiles = 0;

  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p === '.') continue;
    const isWhite = p === p.toUpperCase();
    const lower = p.toLowerCase();
    const r = i >> 3, c = i & 7;

    // Material + PST
    const pstIdx = isWhite ? i : (7 - r) * 8 + c;
    const mgVal = MG_MAT[lower] + MG_PST[lower][pstIdx];
    const egVal = EG_MAT[lower] + EG_PST[lower][pstIdx];
    if (isWhite) { mg += mgVal; eg += egVal; } else { mg -= mgVal; eg -= egVal; }
    phase += PHASE_W[lower];

    if (lower === 'b') { if (isWhite) wB++; else bB++; }

    // Track raw material (for mop-up eval) — no separate loop needed
    if (lower !== 'k') {
      const v = SEE_VAL[lower] || 0;
      if (isWhite) wMat += v; else bMat += v;
    }

    if (lower === 'p') {
      if (isWhite) {
        wPF[c]++;
        if (r < wPBest[c]) wPBest[c] = r;
        if (r > wPMax[c]) wPMax[c] = r;
      } else {
        bPF[c]++;
        if (r > bPBest[c]) bPBest[c] = r;
        if (r < bPMin[c]) bPMin[c] = r;
      }
    }

    if (lower === 'r') {
      if (isWhite) wRookFiles |= (1 << c); else bRookFiles |= (1 << c);
      // Rook on 7th rank bonus
      if (isWhite && r === 1) { mg += 20; eg += 30; }
      if (!isWhite && r === 6) { mg -= 20; eg -= 30; }
    }
  }

  // Bishop pair bonus
  if (wB >= 2) { mg += 30; eg += 50; }
  if (bB >= 2) { mg -= 30; eg -= 50; }

  // ─── Pawn structure ────────────────────────────────────────────────────
  for (let f = 0; f < 8; f++) {
    // Doubled pawns penalty
    if (wPF[f] > 1) { const d = wPF[f] - 1; mg -= 10 * d; eg -= 20 * d; }
    if (bPF[f] > 1) { const d = bPF[f] - 1; mg += 10 * d; eg += 20 * d; }

    // Isolated pawns penalty (no friendly pawn on adjacent files)
    if (wPF[f] > 0) {
      if ((f === 0 || wPF[f-1] === 0) && (f === 7 || wPF[f+1] === 0)) {
        mg -= 12; eg -= 18;
      }
    }
    if (bPF[f] > 0) {
      if ((f === 0 || bPF[f-1] === 0) && (f === 7 || bPF[f+1] === 0)) {
        mg += 12; eg += 18;
      }
    }

    // Passed pawns (no enemy pawn ahead on same or adjacent files)
    if (wPF[f] > 0) {
      const r = wPBest[f]; // most advanced white pawn row on this file
      let passed = true;
      for (let af = (f > 0 ? f-1 : 0); af <= (f < 7 ? f+1 : 7); af++) {
        if (bPF[af] > 0 && bPMin[af] < r) { passed = false; break; }
      }
      if (passed && r <= 6) { // r=6 means pawn on rank 2 (just left start)
        const adv = 6 - r; // 0 (rank 3) to 6 (rank 7=one step from promo)
        // r=6→adv=0, r=5→adv=1, ..., r=1→adv=5, r=0→adv=6 (impossible, would promote)
        if (adv >= 0 && adv < 7) { mg += PASSED_MG[adv]; eg += PASSED_EG[adv]; }
      }
    }
    if (bPF[f] > 0) {
      const r = bPBest[f]; // most advanced black pawn row
      let passed = true;
      for (let af = (f > 0 ? f-1 : 0); af <= (f < 7 ? f+1 : 7); af++) {
        if (wPF[af] > 0 && wPMax[af] > r) { passed = false; break; }
      }
      if (passed && r >= 1) {
        const adv = r - 1; // 0 (rank 6) to 6 (rank 2=one step)
        if (adv >= 0 && adv < 7) { mg -= PASSED_MG[adv]; eg -= PASSED_EG[adv]; }
      }
    }
  }

  // ─── Rook on open/semi-open files ──────────────────────────────────────
  for (let f = 0; f < 8; f++) {
    if (wRookFiles & (1 << f)) {
      if (!wPF[f] && !bPF[f]) { mg += 22; eg += 12; }
      else if (!wPF[f]) { mg += 12; eg += 6; }
    }
    if (bRookFiles & (1 << f)) {
      if (!wPF[f] && !bPF[f]) { mg -= 22; eg -= 12; }
      else if (!bPF[f]) { mg -= 12; eg -= 6; }
    }
  }

  // ─── King safety: pawn shield (middlegame only) ────────────────────────
  if (pos.wk >= 0) {
    const wkr = pos.wk >> 3, wkc = pos.wk & 7;
    if (wkr >= 6) { // king on back ranks
      for (let dc = -1; dc <= 1; dc++) {
        const fc = wkc + dc;
        if (fc < 0 || fc > 7) continue;
        if (board[(wkr - 1) * 8 + fc] === 'P') mg += 12;
        else mg -= 8;
      }
    }
  }
  if (pos.bk >= 0) {
    const bkr = pos.bk >> 3, bkc = pos.bk & 7;
    if (bkr <= 1) {
      for (let dc = -1; dc <= 1; dc++) {
        const fc = bkc + dc;
        if (fc < 0 || fc > 7) continue;
        if (board[(bkr + 1) * 8 + fc] === 'p') mg -= 12;
        else mg += 8;
      }
    }
  }

  // ─── Mop-up evaluation (convert winning positions faster) ───────────────
  // When significantly ahead, drive enemy king to corner + bring our king close
  const matDiff = wMat - bMat;
  if (Math.abs(matDiff) > 300) {
    const winSide = matDiff > 0 ? 'w' : 'b';
    const losingKing = winSide === 'w' ? pos.bk : pos.wk;
    const winningKing = winSide === 'w' ? pos.wk : pos.bk;
    if (losingKing >= 0 && winningKing >= 0) {
      // Bonus for enemy king in corner
      const cornerBonus = CENTER_DIST[losingKing] * 15;
      // Bonus for our king close to their king (for delivery)
      const closeness = (14 - manhattanDist(winningKing, losingKing)) * 5;
      const mopUp = cornerBonus + closeness;
      if (winSide === 'w') { eg += mopUp; } else { eg -= mopUp; }
    }
  }

  if (phase > 24) phase = 24;
  const score = ((mg * phase + eg * (24 - phase)) / 24) | 0;
  // Tempo bonus: small advantage for having the move
  return (pos.side === 'w' ? score : -score) + 12;
}

// Non-pawn material existence check
function hasNonPawnMaterial(board, side) {
  const pieces = side === 'w' ? 'NBRQ' : 'nbrq';
  for (let i = 0; i < 64; i++) if (pieces.includes(board[i])) return true;
  return false;
}

function isInsufficient(board) {
  let wN = 0, wB = 0, bN = 0, bB = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p === '.' || p.toLowerCase() === 'k') continue;
    const l = p.toLowerCase();
    if (l === 'p' || l === 'r' || l === 'q') return false;
    const isW = p === p.toUpperCase();
    if (l === 'n') { if (isW) wN++; else bN++; }
    if (l === 'b') { if (isW) wB++; else bB++; }
  }
  if (!wN && !wB && !bN && !bB) return true;
  if (wN + wB <= 1 && !bN && !bB) return true;
  if (bN + bB <= 1 && !wN && !wB) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSPOSITION TABLE (with ply-adjusted mate scores)
// ═══════════════════════════════════════════════════════════════════════════════
const TT_BITS = 20;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_HASH  = new Uint32Array(TT_SIZE);
const TT_SCORE = new Int32Array(TT_SIZE);
const TT_DEPTH = new Int8Array(TT_SIZE);
const TT_FLAG  = new Uint8Array(TT_SIZE);
const TT_MOVE  = new Uint16Array(TT_SIZE);
const TT_NONE = 0, TT_EXACT = 1, TT_ALPHA = 2, TT_BETA = 3;

function adjustMateStore(score, ply) {
  if (score > MATE_SCORE - MAX_PLY) return score + ply;
  if (score < -(MATE_SCORE - MAX_PLY)) return score - ply;
  return score;
}

function adjustMateRetrieve(score, ply) {
  if (score > MATE_SCORE - MAX_PLY) return score - ply;
  if (score < -(MATE_SCORE - MAX_PLY)) return score + ply;
  return score;
}

function ttProbe(hash, depth, alpha, beta, ply) {
  const idx = hash & TT_MASK;
  if (TT_FLAG[idx] === TT_NONE || TT_HASH[idx] !== (hash >>> 0)) return null;
  const move = TT_MOVE[idx];
  if (TT_DEPTH[idx] < depth) return { move, score: null };
  const rawScore = TT_SCORE[idx];
  const s = adjustMateRetrieve(rawScore, ply);
  const f = TT_FLAG[idx];
  if (f === TT_EXACT) return { move, score: s };
  if (f === TT_ALPHA && s <= alpha) return { move, score: alpha };
  if (f === TT_BETA && s >= beta) return { move, score: beta };
  return { move, score: null };
}

function ttStore(hash, score, depth, flag, move, ply) {
  const idx = hash & TT_MASK;
  if (TT_FLAG[idx] === TT_NONE || TT_DEPTH[idx] <= depth || TT_HASH[idx] !== (hash >>> 0)) {
    TT_HASH[idx] = hash >>> 0;
    TT_SCORE[idx] = adjustMateStore(score, ply);
    TT_DEPTH[idx] = depth;
    TT_FLAG[idx] = flag;
    if (move) TT_MOVE[idx] = move & 0xFFFF;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVE ORDERING
// ═══════════════════════════════════════════════════════════════════════════════
const PV_ORDER = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 10 };
const killers = Array.from({ length: MAX_PLY }, () => [0, 0]);
const history = new Int32Array(4096);

function scoreMove(pos, mv, ttMove, ply) {
  if (mv === ttMove) return 100000;
  const from = mFrom(mv), to = mTo(mv);
  const { board, ep } = pos;
  const promo = mv & 7;
  if (promo === 1) return 90000; // queen promotion
  if (promo !== 0) return 85000; // other promotions (knight can be huge)
  const victim = board[to];
  if (victim !== '.') return 50000 + PV_ORDER[victim.toLowerCase()] * 10 - PV_ORDER[board[from].toLowerCase()];
  if (board[from].toLowerCase() === 'p' && to === ep) return 49000;
  if (ply < MAX_PLY) {
    if (killers[ply][0] === mv) return 40000;
    if (killers[ply][1] === mv) return 39000;
  }
  return history[from * 64 + to] || 0;
}

function sortMoves(pos, moves, ttMove, ply) {
  const n = moves.length;
  const scores = new Array(n);
  for (let i = 0; i < n; i++) scores[i] = scoreMove(pos, moves[i], ttMove, ply);
  // Insertion sort (fast for ~30 elements, cache friendly)
  for (let i = 1; i < n; i++) {
    const mv = moves[i], sc = scores[i];
    let j = i - 1;
    while (j >= 0 && scores[j] < sc) {
      moves[j + 1] = moves[j]; scores[j + 1] = scores[j]; j--;
    }
    moves[j + 1] = mv; scores[j + 1] = sc;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH GLOBALS
// ═══════════════════════════════════════════════════════════════════════════════
let nodeCount = 0;
let searchAborted = false;
let maxNodes = 500000; // deterministic node limit (set per-depth in pickMove)

const pathHashes = new Uint32Array(512);
let pathLen = 0;

function isRepetition(hash) {
  for (let i = pathLen - 1; i >= 0; i--) {
    if (pathHashes[i] === hash) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUIESCENCE SEARCH (captures + ALL promotions)
// ═══════════════════════════════════════════════════════════════════════════════
function qsearch(pos, alpha, beta, ply) {
  if (searchAborted) return 0;
  nodeCount++;
  if (nodeCount >= maxNodes) { searchAborted = true; return 0; }
  if (ply >= MAX_PLY) return evaluate(pos);

  const stand = evaluate(pos);
  if (stand >= beta) return beta;
  if (stand + 1100 < alpha) return alpha; // delta pruning
  if (stand > alpha) alpha = stand;

  const moves = genMoves(pos);
  const tactical = [];
  for (const mv of moves) {
    const to = mTo(mv);
    // Include captures, ALL promotions (not just queen), and EP captures
    if (pos.board[to] !== '.' || (mv & 7) !== 0) {
      tactical.push(mv);
    } else if (pos.board[mFrom(mv)].toLowerCase() === 'p' && to === pos.ep) {
      tactical.push(mv);
    }
  }
  sortMoves(pos, tactical, NO_MOVE, ply);

  for (const mv of tactical) {
    // SEE-based bad capture pruning: skip captures where we lose material
    // Example: don't capture a pawn with a queen if the square is defended
    const to = mTo(mv);
    const victim = pos.board[to];
    const attacker = pos.board[mFrom(mv)];
    if (victim !== '.' && (mv & 7) === 0) { // non-promo captures only
      const victimVal = SEE_VAL[victim.toLowerCase()] || 0;
      const attackerVal = SEE_VAL[attacker.toLowerCase()] || 0;
      // If attacker is much more valuable than victim, and the square is defended, skip
      if (attackerVal > victimVal + 200 && isAttacked(pos.board, to, opp(pos.side))) continue;
    }

    const next = applyMove(pos, mv);
    if (sideInCheck(next, pos.side)) continue;
    const score = -qsearch(next, -beta, -alpha, ply + 1);
    if (searchAborted) return 0;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEGAMAX ALPHA-BETA
// Features: null-move, LMR, check extensions (unconditional), PVS,
//           futility pruning, reverse futility, late move pruning
// ═══════════════════════════════════════════════════════════════════════════════

// Precompute LMR reduction table
const LMR = Array.from({ length: 64 }, (_, d) =>
  Array.from({ length: 64 }, (_, m) =>
    d === 0 || m === 0 ? 0 : Math.max(0, Math.floor(Math.log(d) * Math.log(m) / 2.5))
  )
);

function negamax(pos, depth, alpha, beta, ply, canNull) {
  if (searchAborted) return 0;
  nodeCount++;
  if (nodeCount >= maxNodes) { searchAborted = true; return 0; }
  if (ply >= MAX_PLY) return evaluate(pos);

  // Draw detection
  if (pos.halfmove >= 100) return 0;
  if (ply > 0 && isRepetition(pos.hash)) return 0;
  if (isInsufficient(pos.board)) return 0;

  if (depth <= 0) return qsearch(pos, alpha, beta, ply);

  const origAlpha = alpha;
  const isInCheck = sideInCheck(pos, pos.side);

  // ─── Check extension (capped to prevent explosion) ─────────────────────
  // When in check, few moves are legal; extend to avoid horizon effect.
  // Cap: only extend if effective depth won't exceed ~30 plies.
  if (isInCheck && ply + depth < 30) depth++;

  // TT probe (with ply-adjusted mate scores)
  const ttResult = ttProbe(pos.hash, depth, alpha, beta, ply);
  let ttMove = NO_MOVE;
  if (ttResult) {
    ttMove = ttResult.move;
    if (ply > 0 && ttResult.score !== null) return ttResult.score;
  }

  // ─── Reverse futility pruning (static null-move pruning) ───────────────
  if (!isInCheck && depth <= 3 && ply > 0) {
    const rfpMargin = [0, 200, 400, 600];
    if (evaluate(pos) - rfpMargin[depth] >= beta) return beta;
  }

  // ─── Null-move pruning ─────────────────────────────────────────────────
  if (canNull && !isInCheck && depth >= 3 && ply > 0 && hasNonPawnMaterial(pos.board, pos.side)) {
    const R = 3 + (depth >= 8 ? 1 : 0); // adaptive R
    const nullPos = applyNull(pos);
    const nullScore = -negamax(nullPos, depth - 1 - R, -beta, -beta + 1, ply + 1, false);
    if (searchAborted) return 0;
    if (nullScore >= beta) return beta;
  }

  // ─── Futility pruning flag ─────────────────────────────────────────────
  let futilityPrune = false;
  if (!isInCheck && depth <= 2 && ply > 0) {
    const margin = depth === 1 ? 200 : 500;
    if (evaluate(pos) + margin < alpha) futilityPrune = true;
  }

  // ─── Generate and sort moves ───────────────────────────────────────────
  const moves = genMoves(pos);
  sortMoves(pos, moves, ttMove, ply);

  let legalCount = 0, bestScore = -INF, bestMove = NO_MOVE;
  pathHashes[pathLen++] = pos.hash;

  for (let i = 0; i < moves.length; i++) {
    const mv = moves[i];
    const next = applyMove(pos, mv);
    if (sideInCheck(next, pos.side)) continue; // skip illegal
    legalCount++;

    const isCap = pos.board[mTo(mv)] !== '.';
    const isPromo = (mv & 7) !== 0;

    // Lazy givesCheck: only compute when needed for pruning/LMR
    let isTactical = isCap || isPromo;
    if (!isTactical && (futilityPrune || (depth >= 3 && legalCount > 3 && !isInCheck))) {
      if (sideInCheck(next, next.side)) isTactical = true; // gives check
    }

    // Futility: skip quiet moves
    if (futilityPrune && !isTactical && legalCount > 1) continue;

    // ─── Late move pruning: skip late quiet moves at shallow depth ────
    if (depth <= 2 && !isTactical && !isInCheck && legalCount > 6 + 3 * depth) continue;

    let score;
    const newDepth = depth - 1;

    // ─── LMR (log-based reduction) ───────────────────────────────────
    if (depth >= 3 && legalCount > 3 && !isTactical && !isInCheck) {
      let R = LMR[Math.min(depth, 63)][Math.min(legalCount, 63)];
      if (R < 1) R = 1;
      score = -negamax(next, newDepth - R, -alpha - 1, -alpha, ply + 1, true);
      if (searchAborted) { pathLen--; return 0; }
      if (score > alpha) score = -negamax(next, newDepth, -beta, -alpha, ply + 1, true);
    }
    // ─── PVS (Principal Variation Search) ─────────────────────────────
    else if (legalCount > 1) {
      score = -negamax(next, newDepth, -alpha - 1, -alpha, ply + 1, true);
      if (searchAborted) { pathLen--; return 0; }
      if (score > alpha && score < beta) score = -negamax(next, newDepth, -beta, -alpha, ply + 1, true);
    } else {
      score = -negamax(next, newDepth, -beta, -alpha, ply + 1, true);
    }

    if (searchAborted) { pathLen--; return 0; }

    if (score > bestScore) { bestScore = score; bestMove = mv; }
    if (score > alpha) {
      alpha = score;
      if (alpha >= beta) {
        // Beta cutoff — update killers/history for quiet moves
        if (!isCap && !isPromo && ply < MAX_PLY) {
          if (killers[ply][0] !== mv) { killers[ply][1] = killers[ply][0]; killers[ply][0] = mv; }
          const f = mFrom(mv), t = mTo(mv);
          history[f * 64 + t] += depth * depth;
          if (history[f * 64 + t] > 30000) { for (let j = 0; j < 4096; j++) history[j] >>= 1; }
        }
        pathLen--;
        ttStore(pos.hash, beta, depth, TT_BETA, bestMove, ply);
        return beta;
      }
    }
  }

  pathLen--;

  // No legal moves: checkmate or stalemate
  if (legalCount === 0) return isInCheck ? -(MATE_SCORE - ply) : 0;

  ttStore(pos.hash, bestScore, depth, bestScore > origAlpha ? TT_EXACT : TT_ALPHA, bestMove, ply);
  return bestScore;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ITERATIVE DEEPENING with aspiration windows + root PVS
// ═══════════════════════════════════════════════════════════════════════════════
function pickMove(pos) {
  const legal = legalMoves(pos);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  // Reset search state
  for (let i = 0; i < MAX_PLY; i++) { killers[i][0] = 0; killers[i][1] = 0; }
  history.fill(0);
  pathLen = 0;
  nodeCount = 0;

  const TOTAL_NODE_BUDGET = 80000; // FIXED deterministic node budget (~400ms at typical NPS)
  let bestMove = legal[0];
  let prevScore = 0;
  let lastDepthNodes = 0; // nodes used by last completed depth

  for (let depth = 1; depth <= 40; depth++) {
    // ─── Deterministic depth gating (node-count prediction, no Date.now) ───
    if (depth > 1) {
      // Predict: next depth takes ~4x last depth's nodes
      const predictedNodes = lastDepthNodes * 4;
      if (nodeCount + predictedNodes > TOTAL_NODE_BUDGET) break;
    }

    searchAborted = false;
    const depthStartNodes = nodeCount;

    // Set hard node limit: remaining budget
    // This is the ONLY abort mechanism inside the search — fully deterministic
    maxNodes = TOTAL_NODE_BUDGET;

    // Aspiration window (from depth 5)
    let alpha = -INF, beta = INF;
    let aspWindow = 50;
    if (depth >= 5) {
      alpha = prevScore - aspWindow;
      beta = prevScore + aspWindow;
    }

    let depthBest = NO_MOVE;
    let depthScore = -INF;
    let aspFailed = true;

    while (aspFailed) {
      aspFailed = false;
      depthBest = NO_MOVE;
      depthScore = -INF;

      const rootMoves = legal.slice();
      sortMoves(pos, rootMoves, bestMove, 0);
      pathLen = 0;

      let first = true;
      for (const mv of rootMoves) {
        const next = applyMove(pos, mv);
        // legal already filtered — no redundant sideInCheck needed

        pathHashes[0] = pos.hash;
        pathLen = 1;

        let score;
        // Root PVS: full window for first move, null window for rest
        if (first) {
          score = -negamax(next, depth - 1, -beta, -alpha, 1, true);
          first = false;
        } else {
          score = -negamax(next, depth - 1, -alpha - 1, -alpha, 1, true);
          if (!searchAborted && score > alpha && score < beta) {
            score = -negamax(next, depth - 1, -beta, -alpha, 1, true);
          }
        }

        pathLen = 0;
        if (searchAborted) break;

        if (score > depthScore) {
          depthScore = score;
          depthBest = mv;
        }
        if (score > alpha) alpha = score;
      }

      if (searchAborted) break;

      // Handle aspiration window failure: widen and re-search
      if (depth >= 5 && (depthScore <= prevScore - aspWindow || depthScore >= prevScore + aspWindow)) {
        aspWindow *= 4;
        if (aspWindow > 500) {
          alpha = -INF; beta = INF;
        } else {
          alpha = prevScore - aspWindow;
          beta = prevScore + aspWindow;
        }
        aspFailed = true;
      }
    }

    // Track nodes this depth used (for branching factor prediction)
    lastDepthNodes = nodeCount - depthStartNodes;

    if (searchAborted) break;

    if (depthBest !== NO_MOVE) {
      bestMove = depthBest;
      prevScore = depthScore;
    }

    // Stop if we found a forced mate
    if (depthScore >= MATE_SCORE - 200 || depthScore <= -(MATE_SCORE - 200)) break;
  }

  return bestMove;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
const fen = readFileSync(0, 'utf8').trim();
const pos = parseFen(fen);
const move = pickMove(pos);
process.stdout.write(`${move ? moveToUci(move) : '0000'}\n`);
