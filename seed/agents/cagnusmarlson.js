import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

// ============================================================================
// SECTION 1: Board Representation & FEN Parsing
// ============================================================================

const FILES = 'abcdefgh';

// Precompute square name lookup tables
const SQ_NAMES = new Array(64);
const SQ_FROM_NAME = {};
for (let i = 0; i < 64; i++) {
  const r = i >> 3, f = i & 7;
  const name = FILES[f] + (8 - r);
  SQ_NAMES[i] = name;
  SQ_FROM_NAME[name] = i;
}

function squareToIndex(square) { return SQ_FROM_NAME[square]; }
function indexToSquare(index) { return SQ_NAMES[index]; }

function colorOf(piece) {
  if (!piece || piece === '.') return null;
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

function opposite(side) { return side === 'w' ? 'b' : 'w'; }

function parseFen(fen) {
  const [placement, side, castling, ep, halfmove, fullmove] = fen.trim().split(/\s+/);
  const board = [];
  let wKing = -1, bKing = -1;
  for (const row of placement.split('/')) {
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        for (let j = 0; j < +ch; j++) board.push('.');
      } else {
        if (ch === 'K') wKing = board.length;
        else if (ch === 'k') bKing = board.length;
        board.push(ch);
      }
    }
  }
  return {
    board,
    side: side || 'w',
    castling: castling && castling !== '-' ? castling : '-',
    enPassant: ep || '-',
    halfmove: Number(halfmove || 0),
    fullmove: Number(fullmove || 1),
    wKing,
    bKing,
  };
}

function stripCastling(castling) { return castling.replace(/-/g, ''); }
function normalizeCastling(castling) { const out = stripCastling(castling); return out || '-'; }

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function isSquareAttacked(pos, sqIdx, by) {
  const board = pos.board;
  const tr = sqIdx >> 3;
  const tc = sqIdx & 7;

  const pawnRow = by === 'w' ? tr + 1 : tr - 1;
  if (pawnRow >= 0 && pawnRow < 8) {
    for (const dc of [-1, 1]) {
      const c = tc + dc;
      if (c < 0 || c > 7) continue;
      const p = board[pawnRow * 8 + c];
      if (p !== '.' && colorOf(p) === by && (p === 'p' || p === 'P')) return true;
    }
  }

  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const r = tr + dr, c = tc + dc;
    if (r < 0 || r > 7 || c < 0 || c > 7) continue;
    const p = board[r * 8 + c];
    if (p !== '.' && colorOf(p) === by && (p === 'n' || p === 'N')) return true;
  }

  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    let r = tr + dr, c = tc + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const p = board[r * 8 + c];
      if (p !== '.') {
        if (colorOf(p) === by && (p === 'b' || p === 'B' || p === 'q' || p === 'Q')) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let r = tr + dr, c = tc + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const p = board[r * 8 + c];
      if (p !== '.') {
        if (colorOf(p) === by && (p === 'r' || p === 'R' || p === 'q' || p === 'Q')) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    const r = tr + dr, c = tc + dc;
    if (r < 0 || r > 7 || c < 0 || c > 7) continue;
    const p = board[r * 8 + c];
    if (p !== '.' && colorOf(p) === by && (p === 'k' || p === 'K')) return true;
  }
  return false;
}

function isKingInCheck(pos, side) {
  const kingIdx = side === 'w' ? pos.wKing : pos.bKing;
  if (kingIdx < 0) return true;
  return isSquareAttacked(pos, kingIdx, opposite(side));
}

function hasPiece(pos, sq, piece) { return pos.board[SQ_FROM_NAME[sq]] === piece; }

function canCastle(pos, side, kind) {
  const rights = stripCastling(pos.castling);
  const right = side === 'w' ? (kind === 'king' ? 'K' : 'Q') : (kind === 'king' ? 'k' : 'q');
  if (!rights.includes(right)) return false;
  const kingSq = side === 'w' ? 'e1' : 'e8';
  const rookSq = side === 'w' ? (kind === 'king' ? 'h1' : 'a1') : (kind === 'king' ? 'h8' : 'a8');
  const between = side === 'w'
    ? (kind === 'king' ? ['f1', 'g1'] : ['d1', 'c1', 'b1'])
    : (kind === 'king' ? ['f8', 'g8'] : ['d8', 'c8', 'b8']);
  const pass = side === 'w'
    ? (kind === 'king' ? ['f1', 'g1'] : ['d1', 'c1'])
    : (kind === 'king' ? ['f8', 'g8'] : ['d8', 'c8']);
  const kingPiece = side === 'w' ? 'K' : 'k';
  const rookPiece = side === 'w' ? 'R' : 'r';
  if (!hasPiece(pos, kingSq, kingPiece) || !hasPiece(pos, rookSq, rookPiece)) return false;
  if (isKingInCheck(pos, side)) return false;
  for (const sq of between) {
    if (pos.board[SQ_FROM_NAME[sq]] !== '.') return false;
  }
  for (const sq of pass) {
    if (isSquareAttacked(pos, SQ_FROM_NAME[sq], opposite(side))) return false;
  }
  return true;
}

// ============================================================================
// SECTION 2: Piece-Square Tables & Evaluation Constants (PeSTO)
// ============================================================================

const PIECE_VALUES_MG = { p: 82, n: 337, b: 365, r: 477, q: 1025, k: 0 };
const PIECE_VALUES_EG = { p: 94, n: 281, b: 297, r: 512, q: 936, k: 0 };
const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const PHASE_WEIGHTS = { p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 };

const PST_MG = {
  p: [0,0,0,0,0,0,0,0,98,134,61,95,68,126,34,-11,-6,7,26,31,65,56,25,-20,-14,13,6,21,23,12,17,-23,-27,-2,-5,12,17,6,10,-25,-26,-4,-4,-10,3,3,33,-12,-35,-1,-20,-23,-15,24,38,-22,0,0,0,0,0,0,0,0],
  n: [-167,-89,-34,-49,61,-97,-15,-107,-73,-41,72,36,23,62,7,-17,-47,60,37,65,84,129,73,44,-9,17,19,53,37,69,18,22,-13,4,16,13,28,19,21,-8,-23,-9,12,10,19,17,25,-16,-29,-53,-12,-3,-1,18,-14,-19,-105,-21,-58,-33,-17,-28,-19,-23],
  b: [-29,4,-82,-37,-25,-42,7,-8,-26,16,-18,-13,30,59,18,-47,-16,37,43,40,35,50,37,-2,-4,5,19,50,37,37,7,-2,-6,13,13,26,34,12,10,4,0,15,15,15,14,27,18,10,4,15,16,0,7,21,33,1,-33,-3,-14,-21,-13,-12,-39,-21],
  r: [32,42,32,51,63,9,31,43,27,32,58,62,80,67,26,44,-5,19,26,36,17,45,61,16,-24,-11,7,26,24,35,-8,-20,-36,-26,-12,-1,9,-7,6,-23,-45,-25,-16,-17,3,0,-5,-33,-44,-16,-20,-9,-1,11,-6,-71,-19,-13,1,17,16,7,-37,-26],
  q: [-28,0,29,12,59,44,43,45,-24,-39,-5,1,-16,57,28,54,-13,-17,7,8,29,56,47,57,-27,-27,-16,-16,-1,17,-2,1,-9,-26,-9,-10,-2,-4,3,-3,-14,2,-11,-2,-5,2,14,5,-35,-8,11,2,8,15,-3,1,-1,-18,-9,10,-15,-25,-31,-50],
  k: [-65,23,16,-15,-56,-34,2,13,29,-1,-20,-7,-8,-4,-38,-29,-9,24,2,-16,-20,6,22,-22,-17,-20,-12,-27,-30,-25,-14,-36,-49,-1,-27,-39,-46,-44,-33,-51,-14,-14,-22,-46,-44,-30,-15,-27,1,7,-8,-64,-43,-16,9,8,-15,36,12,-54,8,-28,24,14],
};

const PST_EG = {
  p: [0,0,0,0,0,0,0,0,178,173,158,134,147,132,165,187,94,100,85,67,56,53,82,84,32,24,13,5,-2,4,17,17,13,9,-3,-7,-7,-8,3,-1,4,7,-6,1,0,-5,-1,-8,13,8,8,10,13,0,2,-7,0,0,0,0,0,0,0,0],
  n: [-58,-38,-13,-28,-31,-27,-63,-99,-25,-8,-25,-2,-9,-25,-24,-52,-24,-20,10,9,-1,-9,-19,-41,-17,3,22,22,22,11,8,-18,-18,-6,16,25,16,17,4,-18,-23,-3,-1,15,10,-3,-20,-22,-42,-20,-10,-5,-2,-20,-23,-44,-29,-51,-23,-15,-22,-18,-50,-64],
  b: [-14,-21,-11,-8,-7,-9,-17,-24,-8,-4,7,-12,-3,-13,-4,-14,2,-8,0,-1,-2,6,0,4,-3,9,12,9,14,10,3,2,-6,3,13,19,7,10,-3,-9,-12,-3,8,10,13,3,-7,-15,-14,-18,-7,-1,4,-9,-15,-27,-23,-9,-23,-5,-9,-16,-5,-17],
  r: [13,10,18,15,12,12,8,5,11,13,13,11,-3,3,8,3,7,7,7,5,4,-3,-5,-3,4,3,13,1,2,1,-1,2,3,5,8,4,-5,-6,-8,-11,-4,0,-5,-1,-7,-12,-8,-16,-6,-6,0,2,-9,-9,-11,-3,-9,2,3,-1,-5,-13,4,-20],
  q: [-9,22,22,27,27,19,10,20,-17,20,32,41,58,25,30,0,-20,6,9,49,47,35,19,9,3,22,24,45,57,40,57,36,-18,28,19,47,31,34,39,23,-16,-27,15,6,9,17,10,5,-22,-23,-30,-16,-16,-23,-36,-32,-33,-28,-22,-43,-5,-32,-20,-41],
  k: [-74,-35,-18,-18,-11,15,4,-17,-12,17,14,17,17,38,23,11,10,17,23,15,20,45,44,13,-8,22,24,27,26,33,26,3,-18,-4,21,24,27,23,9,-11,-19,-3,11,21,23,16,7,-9,-27,-11,4,13,14,4,-5,-17,-53,-34,-21,-11,-28,-14,-24,-43],
};

// ============================================================================
// SECTION 3: Zobrist Hashing
// ============================================================================

const PIECE_TO_IDX = {};
'PNBRQKpnbrqk'.split('').forEach((p, i) => { PIECE_TO_IDX[p] = i; });

let _zSeed = 0x6A7D3C2E;
function xorshift32() {
  _zSeed ^= _zSeed << 13;
  _zSeed ^= _zSeed >> 17;
  _zSeed ^= _zSeed << 5;
  return _zSeed >>> 0;
}

const ZOBRIST_PIECE = new Array(768);
for (let i = 0; i < 768; i++) ZOBRIST_PIECE[i] = [xorshift32(), xorshift32()];
const ZOBRIST_SIDE = [xorshift32(), xorshift32()];
const ZOBRIST_CASTLING = new Array(16);
for (let i = 0; i < 16; i++) ZOBRIST_CASTLING[i] = [xorshift32(), xorshift32()];
const ZOBRIST_EP = new Array(8);
for (let i = 0; i < 8; i++) ZOBRIST_EP[i] = [xorshift32(), xorshift32()];

function castlingToIndex(castling) {
  let idx = 0;
  if (castling.includes('K')) idx |= 1;
  if (castling.includes('Q')) idx |= 2;
  if (castling.includes('k')) idx |= 4;
  if (castling.includes('q')) idx |= 8;
  return idx;
}

function hashPosition(pos) {
  let lo = 0, hi = 0;
  for (let sq = 0; sq < 64; sq++) {
    const piece = pos.board[sq];
    if (piece !== '.') {
      const idx = PIECE_TO_IDX[piece] * 64 + sq;
      lo ^= ZOBRIST_PIECE[idx][0];
      hi ^= ZOBRIST_PIECE[idx][1];
    }
  }
  if (pos.side === 'b') { lo ^= ZOBRIST_SIDE[0]; hi ^= ZOBRIST_SIDE[1]; }
  const ci = castlingToIndex(pos.castling);
  lo ^= ZOBRIST_CASTLING[ci][0];
  hi ^= ZOBRIST_CASTLING[ci][1];
  if (pos.enPassant !== '-') {
    const epFile = FILES.indexOf(pos.enPassant[0]);
    if (epFile >= 0) { lo ^= ZOBRIST_EP[epFile][0]; hi ^= ZOBRIST_EP[epFile][1]; }
  }
  return [lo >>> 0, hi >>> 0];
}

// Incremental hash helpers
function zhPiece(lo, hi, piece, sq) {
  const idx = PIECE_TO_IDX[piece] * 64 + sq;
  return [(lo ^ ZOBRIST_PIECE[idx][0]) >>> 0, (hi ^ ZOBRIST_PIECE[idx][1]) >>> 0];
}

// ============================================================================
// SECTION 3b: Make/Unmake Move
// ============================================================================

// Undo stack - preallocated for performance
const undoStack = [];
let undoTop = -1;

// Pre-cached square indices
const SQ_A1 = SQ_FROM_NAME['a1'], SQ_H1 = SQ_FROM_NAME['h1'];
const SQ_A8 = SQ_FROM_NAME['a8'], SQ_H8 = SQ_FROM_NAME['h8'];
const SQ_E1 = SQ_FROM_NAME['e1'], SQ_E8 = SQ_FROM_NAME['e8'];
const SQ_F1 = SQ_FROM_NAME['f1'], SQ_G1 = SQ_FROM_NAME['g1'];
const SQ_D1 = SQ_FROM_NAME['d1'], SQ_C1 = SQ_FROM_NAME['c1'];
const SQ_F8 = SQ_FROM_NAME['f8'], SQ_G8 = SQ_FROM_NAME['g8'];
const SQ_D8 = SQ_FROM_NAME['d8'], SQ_C8 = SQ_FROM_NAME['c8'];

function initHash(pos) {
  const h = hashPosition(pos);
  pos.hashLo = h[0];
  pos.hashHi = h[1];
}

function makeMove(pos, move) {
  const from = SQ_FROM_NAME[move.from];
  const to = SQ_FROM_NAME[move.to];
  const board = pos.board;
  const piece = board[from];
  const target = board[to];
  const lower = piece.toLowerCase();
  const side = pos.side;

  // Save undo info
  undoTop++;
  let undo;
  if (undoTop < undoStack.length) {
    undo = undoStack[undoTop];
  } else {
    undo = {};
    undoStack.push(undo);
  }
  undo.from = from;
  undo.to = to;
  undo.piece = piece;
  undo.target = target;
  undo.castling = pos.castling;
  undo.enPassant = pos.enPassant;
  undo.halfmove = pos.halfmove;
  undo.fullmove = pos.fullmove;
  undo.wKing = pos.wKing;
  undo.bKing = pos.bKing;
  undo.hashLo = pos.hashLo;
  undo.hashHi = pos.hashHi;
  undo.promotion = move.promotion || null;
  undo.epCaptureSq = -1;
  undo.castleRookFrom = -1;
  undo.castleRookTo = -1;
  undo.castleRookPiece = null;

  let lo = pos.hashLo, hi = pos.hashHi;

  // XOR out old castling
  const oldCI = castlingToIndex(pos.castling);
  lo ^= ZOBRIST_CASTLING[oldCI][0];
  hi ^= ZOBRIST_CASTLING[oldCI][1];

  // XOR out old EP
  if (pos.enPassant !== '-') {
    const epFile = FILES.indexOf(pos.enPassant[0]);
    if (epFile >= 0) { lo ^= ZOBRIST_EP[epFile][0]; hi ^= ZOBRIST_EP[epFile][1]; }
  }

  // XOR out side (toggle)
  lo ^= ZOBRIST_SIDE[0];
  hi ^= ZOBRIST_SIDE[1];

  // Remove piece from 'from'
  {
    const idx = PIECE_TO_IDX[piece] * 64 + from;
    lo ^= ZOBRIST_PIECE[idx][0]; hi ^= ZOBRIST_PIECE[idx][1];
  }
  board[from] = '.';

  // Handle en passant capture
  if (lower === 'p' && move.to === pos.enPassant && target === '.') {
    const captureIdx = to + (side === 'w' ? 8 : -8);
    const epPiece = board[captureIdx];
    undo.epCaptureSq = captureIdx;
    undo.epCapturePiece = epPiece;
    board[captureIdx] = '.';
    const zpIdx = PIECE_TO_IDX[epPiece] * 64 + captureIdx;
    lo ^= ZOBRIST_PIECE[zpIdx][0]; hi ^= ZOBRIST_PIECE[zpIdx][1];
  }

  // Handle castling (move the rook)
  if (lower === 'k' && Math.abs(to - from) === 2) {
    let rookFrom, rookTo;
    const rookPiece = side === 'w' ? 'R' : 'r';
    if (to === SQ_G1) { rookFrom = SQ_H1; rookTo = SQ_F1; }
    else if (to === SQ_C1) { rookFrom = SQ_A1; rookTo = SQ_D1; }
    else if (to === SQ_G8) { rookFrom = SQ_H8; rookTo = SQ_F8; }
    else if (to === SQ_C8) { rookFrom = SQ_A8; rookTo = SQ_D8; }
    undo.castleRookFrom = rookFrom;
    undo.castleRookTo = rookTo;
    undo.castleRookPiece = rookPiece;
    // Move rook
    board[rookTo] = rookPiece;
    board[rookFrom] = '.';
    // Hash rook movement
    const rFromIdx = PIECE_TO_IDX[rookPiece] * 64 + rookFrom;
    lo ^= ZOBRIST_PIECE[rFromIdx][0]; hi ^= ZOBRIST_PIECE[rFromIdx][1];
    const rToIdx = PIECE_TO_IDX[rookPiece] * 64 + rookTo;
    lo ^= ZOBRIST_PIECE[rToIdx][0]; hi ^= ZOBRIST_PIECE[rToIdx][1];
  }

  // Remove captured piece from hash
  if (target !== '.') {
    const tIdx = PIECE_TO_IDX[target] * 64 + to;
    lo ^= ZOBRIST_PIECE[tIdx][0]; hi ^= ZOBRIST_PIECE[tIdx][1];
  }

  // Place piece at 'to' (with promotion)
  const placedPiece = move.promotion
    ? (side === 'w' ? move.promotion.toUpperCase() : move.promotion.toLowerCase())
    : piece;
  board[to] = placedPiece;
  {
    const pIdx = PIECE_TO_IDX[placedPiece] * 64 + to;
    lo ^= ZOBRIST_PIECE[pIdx][0]; hi ^= ZOBRIST_PIECE[pIdx][1];
  }

  // Update halfmove clock
  if (lower === 'p' || target !== '.') pos.halfmove = 0;
  else pos.halfmove++;

  // Update en passant
  pos.enPassant = '-';
  if (lower === 'p' && Math.abs(to - from) === 16) {
    pos.enPassant = SQ_NAMES[(from + to) >> 1];
  }

  // Update castling rights
  let newCastling = stripCastling(pos.castling);
  if (lower === 'k') {
    newCastling = newCastling.replace(side === 'w' ? /[KQ]/g : /[kq]/g, '');
    if (side === 'w') pos.wKing = to; else pos.bKing = to;
  }
  if (lower === 'r') {
    if (from === SQ_A1) newCastling = newCastling.replace('Q', '');
    if (from === SQ_H1) newCastling = newCastling.replace('K', '');
    if (from === SQ_A8) newCastling = newCastling.replace('q', '');
    if (from === SQ_H8) newCastling = newCastling.replace('k', '');
  }
  if (target !== '.' && target.toLowerCase() === 'r') {
    if (to === SQ_A1) newCastling = newCastling.replace('Q', '');
    if (to === SQ_H1) newCastling = newCastling.replace('K', '');
    if (to === SQ_A8) newCastling = newCastling.replace('q', '');
    if (to === SQ_H8) newCastling = newCastling.replace('k', '');
  }
  pos.castling = newCastling || '-';

  // Update fullmove
  if (side === 'b') pos.fullmove++;

  // Switch side
  pos.side = opposite(side);

  // XOR in new castling
  const newCI = castlingToIndex(pos.castling);
  lo ^= ZOBRIST_CASTLING[newCI][0]; hi ^= ZOBRIST_CASTLING[newCI][1];

  // XOR in new EP
  if (pos.enPassant !== '-') {
    const epFile = FILES.indexOf(pos.enPassant[0]);
    if (epFile >= 0) { lo ^= ZOBRIST_EP[epFile][0]; hi ^= ZOBRIST_EP[epFile][1]; }
  }

  pos.hashLo = lo >>> 0;
  pos.hashHi = hi >>> 0;
}

function unmakeMove(pos) {
  const undo = undoStack[undoTop--];
  const board = pos.board;

  // Restore side, castling, EP, halfmove, fullmove, king positions, hash
  pos.side = opposite(pos.side);
  pos.castling = undo.castling;
  pos.enPassant = undo.enPassant;
  pos.halfmove = undo.halfmove;
  pos.fullmove = undo.fullmove;
  pos.wKing = undo.wKing;
  pos.bKing = undo.bKing;
  pos.hashLo = undo.hashLo;
  pos.hashHi = undo.hashHi;

  const from = undo.from;
  const to = undo.to;

  // Remove the piece from 'to', restore original piece at 'from'
  board[from] = undo.piece;
  board[to] = undo.target;

  // Restore en passant captured pawn
  if (undo.epCaptureSq >= 0) {
    board[undo.epCaptureSq] = undo.epCapturePiece;
  }

  // Restore castling rook
  if (undo.castleRookFrom >= 0) {
    board[undo.castleRookFrom] = undo.castleRookPiece;
    board[undo.castleRookTo] = '.';
  }
}

// Clone-based applyMove kept only for legalMoves in pickMove initial list
function applyMove(pos, move) {
  const next = {
    board: pos.board.slice(),
    side: opposite(pos.side),
    castling: stripCastling(pos.castling),
    enPassant: '-',
    halfmove: pos.halfmove + 1,
    fullmove: pos.fullmove + (pos.side === 'b' ? 1 : 0),
    wKing: pos.wKing,
    bKing: pos.bKing,
    hashLo: 0, hashHi: 0,
  };

  const from = SQ_FROM_NAME[move.from];
  const to = SQ_FROM_NAME[move.to];
  const piece = next.board[from];
  const target = next.board[to];
  const lower = piece.toLowerCase();

  next.board[from] = '.';

  if (lower === 'p' && move.to === pos.enPassant && target === '.') {
    const captureIdx = to + (pos.side === 'w' ? 8 : -8);
    next.board[captureIdx] = '.';
  }

  if (lower === 'k' && Math.abs(to - from) === 2) {
    if (to === SQ_G1) { next.board[SQ_F1] = next.board[SQ_H1]; next.board[SQ_H1] = '.'; }
    else if (to === SQ_C1) { next.board[SQ_D1] = next.board[SQ_A1]; next.board[SQ_A1] = '.'; }
    else if (to === SQ_G8) { next.board[SQ_F8] = next.board[SQ_H8]; next.board[SQ_H8] = '.'; }
    else if (to === SQ_C8) { next.board[SQ_D8] = next.board[SQ_A8]; next.board[SQ_A8] = '.'; }
  }

  next.board[to] = move.promotion
    ? (pos.side === 'w' ? move.promotion.toUpperCase() : move.promotion.toLowerCase())
    : piece;

  if (lower === 'p' || target !== '.') next.halfmove = 0;
  if (lower === 'p' && Math.abs(to - from) === 16) {
    next.enPassant = SQ_NAMES[(from + to) >> 1];
  }

  if (lower === 'k') {
    next.castling = next.castling.replace(pos.side === 'w' ? /[KQ]/g : /[kq]/g, '');
    if (pos.side === 'w') next.wKing = to; else next.bKing = to;
  }
  if (lower === 'r') {
    if (from === SQ_A1) next.castling = next.castling.replace('Q', '');
    if (from === SQ_H1) next.castling = next.castling.replace('K', '');
    if (from === SQ_A8) next.castling = next.castling.replace('q', '');
    if (from === SQ_H8) next.castling = next.castling.replace('k', '');
  }
  if (target.toLowerCase() === 'r') {
    if (to === SQ_A1) next.castling = next.castling.replace('Q', '');
    if (to === SQ_H1) next.castling = next.castling.replace('K', '');
    if (to === SQ_A8) next.castling = next.castling.replace('q', '');
    if (to === SQ_H8) next.castling = next.castling.replace('k', '');
  }

  next.castling = normalizeCastling(next.castling);
  initHash(next);
  return next;
}

// ============================================================================
// SECTION 4: Move Generation
// ============================================================================

function pseudoLegalMoves(pos) {
  const moves = [];
  const side = pos.side;
  const board = pos.board;
  const push = (m) => moves.push(m);

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (piece === '.' || colorOf(piece) !== side) continue;
    const r = i >> 3, c = i & 7;
    const lower = piece.toLowerCase();
    const fromSq = SQ_NAMES[i];

    if (lower === 'p') {
      const dir = side === 'w' ? -1 : 1;
      const startRank = side === 'w' ? 6 : 1;
      const promoRank = side === 'w' ? 0 : 7;
      const oneR = r + dir;
      if (oneR >= 0 && oneR < 8 && board[oneR * 8 + c] === '.') {
        const to = oneR * 8 + c;
        const toSq = SQ_NAMES[to];
        if (oneR === promoRank) {
          push({ from: fromSq, to: toSq, promotion: 'q' });
          push({ from: fromSq, to: toSq, promotion: 'r' });
          push({ from: fromSq, to: toSq, promotion: 'b' });
          push({ from: fromSq, to: toSq, promotion: 'n' });
        } else {
          push({ from: fromSq, to: toSq });
        }
        const twoR = r + dir * 2;
        if (r === startRank && twoR >= 0 && twoR < 8 && board[twoR * 8 + c] === '.') {
          push({ from: fromSq, to: SQ_NAMES[twoR * 8 + c] });
        }
      }
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
        const to = nr * 8 + nc;
        const target = board[to];
        const toSq = SQ_NAMES[to];
        if (toSq === pos.enPassant || (target !== '.' && colorOf(target) !== side)) {
          if (nr === promoRank) {
            push({ from: fromSq, to: toSq, promotion: 'q' });
            push({ from: fromSq, to: toSq, promotion: 'r' });
            push({ from: fromSq, to: toSq, promotion: 'b' });
            push({ from: fromSq, to: toSq, promotion: 'n' });
          } else {
            push({ from: fromSq, to: toSq });
          }
        }
      }
      continue;
    }

    const addSlides = (dirs) => {
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const target = board[nr * 8 + nc];
          if (target === '.') push({ from: fromSq, to: SQ_NAMES[nr * 8 + nc] });
          else {
            if (colorOf(target) !== side) push({ from: fromSq, to: SQ_NAMES[nr * 8 + nc] });
            break;
          }
          nr += dr; nc += dc;
        }
      }
    };

    if (lower === 'n') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
        const target = board[nr * 8 + nc];
        if (target === '.' || colorOf(target) !== side) push({ from: fromSq, to: SQ_NAMES[nr * 8 + nc] });
      }
    } else if (lower === 'b') addSlides([[-1,-1],[-1,1],[1,-1],[1,1]]);
    else if (lower === 'r') addSlides([[-1,0],[1,0],[0,-1],[0,1]]);
    else if (lower === 'q') addSlides([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    else if (lower === 'k') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
        const target = board[nr * 8 + nc];
        if (target === '.' || colorOf(target) !== side) push({ from: fromSq, to: SQ_NAMES[nr * 8 + nc] });
      }
      if (canCastle(pos, side, 'king')) push({ from: fromSq, to: side === 'w' ? 'g1' : 'g8' });
      if (canCastle(pos, side, 'queen')) push({ from: fromSq, to: side === 'w' ? 'c1' : 'c8' });
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

// ============================================================================
// SECTION 5: Transposition Table
// ============================================================================

const TT_SIZE = 1 << 20;
const TT_MASK = TT_SIZE - 1;
const TT = new Uint32Array(TT_SIZE * 5);

const TT_FLAG_EXACT = 0;
const TT_FLAG_ALPHA = 1;
const TT_FLAG_BETA = 2;

function ttIndex(hashLo) { return (hashLo & TT_MASK) * 5; }

function encodeTTMove(move) {
  if (!move) return 0;
  const from = SQ_FROM_NAME[move.from];
  const to = SQ_FROM_NAME[move.to];
  const promo = move.promotion ? 'qrbn'.indexOf(move.promotion) + 1 : 0;
  return (from | (to << 6) | (promo << 12)) >>> 0;
}

function decodeTTMove(encoded) {
  if (!encoded) return null;
  const from = encoded & 63;
  const to = (encoded >> 6) & 63;
  const promo = (encoded >> 12) & 7;
  return {
    from: SQ_NAMES[from],
    to: SQ_NAMES[to],
    promotion: promo ? 'qrbn'[promo - 1] : undefined,
  };
}

const MATE_SCORE = 99999;
const INF = 100000;

function scoreToTT(score, ply) {
  if (score > MATE_SCORE - 200) return score + ply;
  if (score < -MATE_SCORE + 200) return score - ply;
  return score;
}

function scoreFromTT(score, ply) {
  if (score > MATE_SCORE - 200) return score - ply;
  if (score < -MATE_SCORE + 200) return score + ply;
  return score;
}

function ttProbe(hashLo, hashHi, depth, alpha, beta, ply) {
  const idx = ttIndex(hashLo);
  if (TT[idx] !== hashHi || TT[idx + 1] !== hashLo) return null;
  const storedDepth = TT[idx + 2] & 0xFF;
  const flag = (TT[idx + 2] >> 8) & 0xFF;
  const rawScore = (TT[idx + 3] | 0) - 50000;
  const score = scoreFromTT(rawScore, ply);
  const bestMove = decodeTTMove(TT[idx + 4]);
  if (storedDepth >= depth) {
    if (flag === TT_FLAG_EXACT) return { score, bestMove, hit: true };
    if (flag === TT_FLAG_ALPHA && score <= alpha) return { score: alpha, bestMove, hit: true };
    if (flag === TT_FLAG_BETA && score >= beta) return { score: beta, bestMove, hit: true };
  }
  return { score: null, bestMove, hit: false };
}

function ttStore(hashLo, hashHi, depth, flag, score, bestMove, ply) {
  const idx = ttIndex(hashLo);
  const storedDepth = TT[idx + 2] & 0xFF;
  if (depth >= storedDepth || TT[idx] !== hashHi || TT[idx + 1] !== hashLo) {
    TT[idx] = hashHi;
    TT[idx + 1] = hashLo;
    TT[idx + 2] = (depth & 0xFF) | ((flag & 0xFF) << 8);
    TT[idx + 3] = (scoreToTT(score, ply) + 50000) >>> 0;
    TT[idx + 4] = encodeTTMove(bestMove);
  }
}

// ============================================================================
// SECTION 6: Evaluation
// ============================================================================

function chebyshevDist(sq1, sq2) {
  const r1 = sq1 >> 3, c1 = sq1 & 7;
  const r2 = sq2 >> 3, c2 = sq2 & 7;
  return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
}

const CONTEMPT = 15;

// King-ring attack evaluation
function countKingRingAttacks(pos, kingSq, by) {
  const kr = kingSq >> 3, kc = kingSq & 7;
  let totalWeight = 0;
  const board = pos.board;

  const ringSquares = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = kr + dr, c = kc + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8) ringSquares.push(r * 8 + c);
    }
  }

  const attackWeights = { n: 2, b: 2, r: 2, q: 4 };

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (piece === '.' || colorOf(piece) !== by) continue;
    const lower = piece.toLowerCase();
    const weight = attackWeights[lower];
    if (!weight) continue;

    const pr = sq >> 3, pc = sq & 7;
    let attacksRing = false;

    if (lower === 'n') {
      for (const ringSq of ringSquares) {
        const rr = ringSq >> 3, rc = ringSq & 7;
        const dr2 = Math.abs(pr - rr), dc2 = Math.abs(pc - rc);
        if ((dr2 === 2 && dc2 === 1) || (dr2 === 1 && dc2 === 2)) { attacksRing = true; break; }
      }
    } else if (lower === 'b' || lower === 'q') {
      for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        let r = pr + dr, c = pc + dc;
        while (r >= 0 && r < 8 && c >= 0 && c < 8) {
          const idx = r * 8 + c;
          for (const rs of ringSquares) {
            if (rs === idx) { attacksRing = true; break; }
          }
          if (attacksRing) break;
          if (board[idx] !== '.') break;
          r += dr; c += dc;
        }
        if (attacksRing) break;
      }
    }
    if (!attacksRing && (lower === 'r' || lower === 'q')) {
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let r = pr + dr, c = pc + dc;
        while (r >= 0 && r < 8 && c >= 0 && c < 8) {
          const idx = r * 8 + c;
          for (const rs of ringSquares) {
            if (rs === idx) { attacksRing = true; break; }
          }
          if (attacksRing) break;
          if (board[idx] !== '.') break;
          r += dr; c += dc;
        }
        if (attacksRing) break;
      }
    }

    if (attacksRing) totalWeight += weight;
  }

  return totalWeight;
}

// Detect simple endgames for specialized evaluation
function detectEndgame(pos) {
  let wPieces = [], bPieces = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq];
    if (p === '.' || p.toLowerCase() === 'k') continue;
    if (colorOf(p) === 'w') wPieces.push(p.toLowerCase());
    else bPieces.push(p.toLowerCase());
  }

  const wCount = wPieces.length;
  const bCount = bPieces.length;

  if (wCount === 0 && bCount === 0) return 'DRAW';
  if (wCount === 0 && bCount === 1 && (bPieces[0] === 'n' || bPieces[0] === 'b')) return 'DRAW';
  if (bCount === 0 && wCount === 1 && (wPieces[0] === 'n' || wPieces[0] === 'b')) return 'DRAW';

  if (wCount === 1 && wPieces[0] === 'r' && bCount === 0) return 'KRK_W';
  if (bCount === 1 && bPieces[0] === 'r' && wCount === 0) return 'KRK_B';

  if (wCount === 1 && wPieces[0] === 'q' && bCount === 0) return 'KQK_W';
  if (bCount === 1 && bPieces[0] === 'q' && wCount === 0) return 'KQK_B';

  return null;
}

// Evaluate KRK or KQK: drive lone king to edge, keep winning king close
function evalKXK(pos, winningSide, pieceValue) {
  const winKing = winningSide === 'w' ? pos.wKing : pos.bKing;
  const loseKing = winningSide === 'w' ? pos.bKing : pos.wKing;
  const loseR = loseKing >> 3, loseC = loseKing & 7;

  const edgeDistR = Math.min(loseR, 7 - loseR);
  const edgeDistC = Math.min(loseC, 7 - loseC);
  const edgeDist = edgeDistR + edgeDistC;

  const kingDist = chebyshevDist(winKing, loseKing);

  let score = pieceValue + 200 - edgeDist * 30 + (7 - kingDist) * 20;

  return winningSide === 'w'
    ? (pos.side === 'w' ? score : -score)
    : (pos.side === 'w' ? -score : score);
}

function evaluate(pos) {
  // Check for simple endgames first
  const eg = detectEndgame(pos);
  if (eg === 'DRAW') return 0;
  if (eg === 'KRK_W') return evalKXK(pos, 'w', 500);
  if (eg === 'KRK_B') return evalKXK(pos, 'b', 500);
  if (eg === 'KQK_W') return evalKXK(pos, 'w', 900);
  if (eg === 'KQK_B') return evalKXK(pos, 'b', 900);

  let mgScore = 0;
  let egScore = 0;
  let phase = 0;
  let wBishops = 0, bBishops = 0;
  const board = pos.board;

  const wPawnFiles = new Uint8Array(8);
  const bPawnFiles = new Uint8Array(8);
  const wPawnRanks = [7,7,7,7,7,7,7,7];
  const bPawnRanks = [0,0,0,0,0,0,0,0];

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (piece === '.') continue;
    const isWhite = piece === piece.toUpperCase();
    const lower = piece.toLowerCase();
    const sign = isWhite ? 1 : -1;
    const rank = sq >> 3;
    const file = sq & 7;

    mgScore += sign * PIECE_VALUES_MG[lower];
    egScore += sign * PIECE_VALUES_EG[lower];

    const pstIdx = isWhite ? sq : (sq ^ 56);
    mgScore += sign * PST_MG[lower][pstIdx];
    egScore += sign * PST_EG[lower][pstIdx];

    phase += PHASE_WEIGHTS[lower];

    if (lower === 'p') {
      if (isWhite) { wPawnFiles[file]++; if (rank < wPawnRanks[file]) wPawnRanks[file] = rank; }
      else { bPawnFiles[file]++; if (rank > bPawnRanks[file]) bPawnRanks[file] = rank; }
    }
    if (lower === 'b') { if (isWhite) wBishops++; else bBishops++; }
  }

  if (wBishops >= 2) { mgScore += 30; egScore += 50; }
  if (bBishops >= 2) { mgScore -= 30; egScore -= 50; }

  for (let f = 0; f < 8; f++) {
    if (wPawnFiles[f] > 1) { mgScore -= 10 * (wPawnFiles[f] - 1); egScore -= 20 * (wPawnFiles[f] - 1); }
    if (bPawnFiles[f] > 1) { mgScore += 10 * (bPawnFiles[f] - 1); egScore += 20 * (bPawnFiles[f] - 1); }

    const wAdj = (f > 0 ? wPawnFiles[f - 1] : 0) + (f < 7 ? wPawnFiles[f + 1] : 0);
    const bAdj = (f > 0 ? bPawnFiles[f - 1] : 0) + (f < 7 ? bPawnFiles[f + 1] : 0);
    if (wPawnFiles[f] > 0 && wAdj === 0) { mgScore -= 15; egScore -= 20; }
    if (bPawnFiles[f] > 0 && bAdj === 0) { mgScore += 15; egScore += 20; }

    if (wPawnFiles[f] > 0) {
      const advRank = wPawnRanks[f];
      let passed = true;
      for (let r = advRank - 1; r >= 0; r--) {
        for (let df = -1; df <= 1; df++) {
          const nf = f + df;
          if (nf < 0 || nf > 7) continue;
          if (board[r * 8 + nf] === 'p') { passed = false; break; }
        }
        if (!passed) break;
      }
      if (passed) {
        const advancement = 6 - advRank;
        let bonus = advancement * advancement * 10;
        // Blocker detection: less valuable if enemy piece blocks the square in front
        const frontSq = (advRank - 1) * 8 + f;
        if (advRank > 0 && board[frontSq] !== '.' && colorOf(board[frontSq]) === 'b') {
          bonus = Math.round(bonus * 0.6);
        }
        // Support detection: more valuable if defended by another pawn
        let supported = false;
        for (const df of [-1, 1]) {
          const sf = f + df;
          if (sf >= 0 && sf < 8 && board[advRank * 8 + sf] === 'P') { supported = true; break; }
          if (sf >= 0 && sf < 8 && advRank + 1 < 8 && board[(advRank + 1) * 8 + sf] === 'P') { supported = true; break; }
        }
        if (supported) bonus = Math.round(bonus * 1.3);
        mgScore += bonus; egScore += bonus * 3;
      }
    }
    if (bPawnFiles[f] > 0) {
      const advRank = bPawnRanks[f];
      let passed = true;
      for (let r = advRank + 1; r < 8; r++) {
        for (let df = -1; df <= 1; df++) {
          const nf = f + df;
          if (nf < 0 || nf > 7) continue;
          if (board[r * 8 + nf] === 'P') { passed = false; break; }
        }
        if (!passed) break;
      }
      if (passed) {
        const advancement = advRank - 1;
        let bonus = advancement * advancement * 10;
        // Blocker detection
        const frontSq = (advRank + 1) * 8 + f;
        if (advRank < 7 && board[frontSq] !== '.' && colorOf(board[frontSq]) === 'w') {
          bonus = Math.round(bonus * 0.6);
        }
        // Support detection
        let supported = false;
        for (const df of [-1, 1]) {
          const sf = f + df;
          if (sf >= 0 && sf < 8 && board[advRank * 8 + sf] === 'p') { supported = true; break; }
          if (sf >= 0 && sf < 8 && advRank - 1 >= 0 && board[(advRank - 1) * 8 + sf] === 'p') { supported = true; break; }
        }
        if (supported) bonus = Math.round(bonus * 1.3);
        mgScore -= bonus; egScore -= bonus * 3;
      }
    }
  }

  let wMobility = 0, bMobility = 0;
  const wKingR = pos.wKing >> 3, wKingC = pos.wKing & 7;
  const bKingR = pos.bKing >> 3, bKingC = pos.bKing & 7;

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (piece === '.') continue;
    const isWhite = piece === piece.toUpperCase();
    const lower = piece.toLowerCase();
    const sign = isWhite ? 1 : -1;
    const file = sq & 7;
    const rank = sq >> 3;

    if (lower === 'r') {
      const friendlyPawns = isWhite ? wPawnFiles[file] : bPawnFiles[file];
      const enemyPawns = isWhite ? bPawnFiles[file] : wPawnFiles[file];
      if (friendlyPawns === 0 && enemyPawns === 0) { mgScore += sign * 20; egScore += sign * 25; }
      else if (friendlyPawns === 0) { mgScore += sign * 10; egScore += sign * 15; }
      const seventhRank = isWhite ? 1 : 6;
      if (rank === seventhRank) { mgScore += sign * 20; egScore += sign * 30; }
    }

    if (lower === 'n') {
      let mob = 0;
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = rank + dr, nc = file + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const t = board[nr * 8 + nc];
          if (t === '.' || colorOf(t) !== (isWhite ? 'w' : 'b')) mob++;
        }
      }
      if (isWhite) wMobility += mob; else bMobility += mob;
    } else if (lower === 'b' || lower === 'r' || lower === 'q') {
      const dirs = lower === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]]
        : lower === 'r' ? [[-1,0],[1,0],[0,-1],[0,1]]
        : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
      let mob = 0;
      for (const [dr, dc] of dirs) {
        let nr = rank + dr, nc = file + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const t = board[nr * 8 + nc];
          if (t === '.') { mob++; }
          else { if (colorOf(t) !== (isWhite ? 'w' : 'b')) mob++; break; }
          nr += dr; nc += dc;
        }
      }
      if (isWhite) wMobility += mob; else bMobility += mob;
    }
  }

  const mobilityDiff = wMobility - bMobility;
  mgScore += mobilityDiff * 2;
  egScore += mobilityDiff;

  // King-ring attack evaluation (midgame only)
  if (phase > 6) {
    const wAttackWeight = countKingRingAttacks(pos, pos.bKing, 'w');
    const bAttackWeight = countKingRingAttacks(pos, pos.wKing, 'b');
    const wAttackBonus = Math.round(wAttackWeight * wAttackWeight / 4);
    const bAttackBonus = Math.round(bAttackWeight * bAttackWeight / 4);
    mgScore += wAttackBonus - bAttackBonus;
  }

  if (phase > 6) {
    const evalShield = (kingIdx, side) => {
      let shield = 0;
      const kr = kingIdx >> 3;
      const kc = kingIdx & 7;
      const dir = side === 'w' ? -1 : 1;
      const pawn = side === 'w' ? 'P' : 'p';
      for (let dc = -1; dc <= 1; dc++) {
        const fc = kc + dc;
        if (fc < 0 || fc > 7) continue;
        const r1 = kr + dir;
        const r2 = kr + dir * 2;
        if (r1 >= 0 && r1 < 8 && board[r1 * 8 + fc] === pawn) shield += 15;
        else if (r2 >= 0 && r2 < 8 && board[r2 * 8 + fc] === pawn) shield += 5;
        else shield -= 10;
      }
      return shield;
    };
    const wShield = evalShield(pos.wKing, 'w');
    const bShield = evalShield(pos.bKing, 'b');
    mgScore += wShield - bShield;

    for (let dc = -1; dc <= 1; dc++) {
      const wf = wKingC + dc;
      if (wf >= 0 && wf < 8 && wPawnFiles[wf] === 0 && bPawnFiles[wf] === 0) mgScore -= 15;
      const bf = bKingC + dc;
      if (bf >= 0 && bf < 8 && wPawnFiles[bf] === 0 && bPawnFiles[bf] === 0) mgScore += 15;
    }
  }

  if (phase <= 8) {
    const wCenterDist = Math.abs(wKingR - 3.5) + Math.abs(wKingC - 3.5);
    const bCenterDist = Math.abs(bKingR - 3.5) + Math.abs(bKingC - 3.5);
    egScore += (bCenterDist - wCenterDist) * 12;
    const kingDist = chebyshevDist(pos.wKing, pos.bKing);
    egScore += (7 - kingDist) * 8;
  }

  // Tempo bonus: side to move has a small advantage
  mgScore += 10;
  egScore += 5;

  phase = Math.min(phase, 24);
  const score = Math.round((mgScore * phase + egScore * (24 - phase)) / 24);

  const sideScore = pos.side === 'w' ? score : -score;
  return sideScore;
}

// ============================================================================
// SECTION 7: Move Ordering
// ============================================================================

const killers = new Array(128);
for (let i = 0; i < 128; i++) killers[i] = [null, null];

const historyW = new Array(64);
const historyB = new Array(64);
for (let i = 0; i < 64; i++) {
  historyW[i] = new Int32Array(64);
  historyB[i] = new Int32Array(64);
}

const countermoveW = new Array(64);
const countermoveB = new Array(64);
for (let i = 0; i < 64; i++) {
  countermoveW[i] = new Array(64).fill(null);
  countermoveB[i] = new Array(64).fill(null);
}

function movesMatch(a, b) {
  if (!a || !b) return false;
  return a.from === b.from && a.to === b.to && (a.promotion || '') === (b.promotion || '');
}

function scoreMove(pos, move, ttMove, ply, prevMove) {
  if (movesMatch(move, ttMove)) return 1000000;

  const fromIdx = SQ_FROM_NAME[move.from];
  const toIdx = SQ_FROM_NAME[move.to];
  const target = pos.board[toIdx];
  const movingPiece = pos.board[fromIdx];

  if (target !== '.') {
    const victimVal = PIECE_VALUES[target.toLowerCase()];
    const attackerVal = PIECE_VALUES[movingPiece.toLowerCase()];
    return 100000 + victimVal * 16 - attackerVal;
  }

  if (movingPiece.toLowerCase() === 'p' && move.to === pos.enPassant) return 105000;
  if (move.promotion) return 90000 + PIECE_VALUES[move.promotion];

  if (ply < 128) {
    if (movesMatch(move, killers[ply][0])) return 50000;
    if (movesMatch(move, killers[ply][1])) return 49999;
  }

  if (prevMove) {
    const cm = pos.side === 'w' ? countermoveW : countermoveB;
    const prevFrom = SQ_FROM_NAME[prevMove.from];
    const prevTo = SQ_FROM_NAME[prevMove.to];
    if (movesMatch(move, cm[prevFrom][prevTo])) return 40000;
  }

  const hist = pos.side === 'w' ? historyW : historyB;
  return hist[fromIdx][toIdx];
}

function scoreMoves(pos, moves, ttMove, ply, prevMove) {
  const scores = new Int32Array(moves.length);
  for (let i = 0; i < moves.length; i++) {
    scores[i] = scoreMove(pos, moves[i], ttMove, ply, prevMove);
  }
  return scores;
}

function pickNext(moves, scores, start) {
  let bestIdx = start;
  let bestScore = scores[start];
  for (let i = start + 1; i < moves.length; i++) {
    if (scores[i] > bestScore) {
      bestScore = scores[i];
      bestIdx = i;
    }
  }
  if (bestIdx !== start) {
    const tmpMove = moves[start]; moves[start] = moves[bestIdx]; moves[bestIdx] = tmpMove;
    const tmpScore = scores[start]; scores[start] = scores[bestIdx]; scores[bestIdx] = tmpScore;
  }
}

// ============================================================================
// SECTION 8: Search Engine (using makeMove/unmakeMove)
// ============================================================================

let nodes = 0;
let searchStartTime = 0;
let timeLimit = 0;
let searchAborted = false;

function checkTime() {
  if ((nodes & 511) === 0) {
    if (performance.now() - searchStartTime > timeLimit) {
      searchAborted = true;
    }
  }
}

function isCapture(pos, move) {
  const toIdx = SQ_FROM_NAME[move.to];
  if (pos.board[toIdx] !== '.') return true;
  if (pos.board[SQ_FROM_NAME[move.from]].toLowerCase() === 'p' && move.to === pos.enPassant) return true;
  return false;
}

function quiesce(pos, alpha, beta, ply) {
  nodes++;
  checkTime();
  if (searchAborted) return 0;

  const standPat = evaluate(pos);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  if (ply > 20) return standPat;

  const allMoves = pseudoLegalMoves(pos);
  const captures = [];
  for (const m of allMoves) {
    if (isCapture(pos, m) || m.promotion) captures.push(m);
  }

  if (captures.length === 0) return alpha;

  const capScores = scoreMoves(pos, captures, null, ply, null);
  for (let i = 0; i < captures.length; i++) pickNext(captures, capScores, i);

  const savedSide = pos.side;
  for (const move of captures) {
    const toIdx = SQ_FROM_NAME[move.to];
    const capturedPiece = pos.board[toIdx];
    if (capturedPiece !== '.' && !move.promotion) {
      const delta = standPat + PIECE_VALUES[capturedPiece.toLowerCase()] + 200;
      if (delta < alpha) continue;
    }

    makeMove(pos, move);
    if (isKingInCheck(pos, savedSide)) { unmakeMove(pos); continue; }

    const score = -quiesce(pos, -beta, -alpha, ply + 1);
    unmakeMove(pos);
    if (searchAborted) return 0;

    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

function negamax(pos, depth, alpha, beta, ply, doNull, prevMove) {
  nodes++;
  checkTime();
  if (searchAborted) return 0;

  const isPV = beta - alpha > 1;

  // TT probe using incremental hash
  const hashLo = pos.hashLo;
  const hashHi = pos.hashHi;
  const ttEntry = ttProbe(hashLo, hashHi, depth, alpha, beta, ply);
  let ttMove = null;
  if (ttEntry) {
    ttMove = ttEntry.bestMove;
    if (ttEntry.hit && !isPV) return ttEntry.score;
  }

  const inCheck = isKingInCheck(pos, pos.side);

  if (inCheck) depth++;

  if (depth <= 0) return quiesce(pos, alpha, beta, ply);

  const staticEval = (!inCheck && ply > 0) ? evaluate(pos) : 0;

  if (!isPV && !inCheck && depth <= 3 && ply > 0) {
    if (staticEval - 120 * depth >= beta) return beta;
  }

  // Null move pruning
  if (doNull && !inCheck && depth >= 3 && ply > 0 && !isPV) {
    let nonPawnCount = 0;
    let hasQueen = false;
    for (let sq = 0; sq < 64; sq++) {
      const p = pos.board[sq];
      if (p !== '.' && colorOf(p) === pos.side) {
        const l = p.toLowerCase();
        if (l === 'q') hasQueen = true;
        if (l !== 'p' && l !== 'k') nonPawnCount++;
      }
      if (nonPawnCount >= 2) break;
    }
    if (nonPawnCount >= 2 || hasQueen) {
      // Null move: just flip side, clear EP
      const oldSide = pos.side;
      const oldEP = pos.enPassant;
      const oldHalfmove = pos.halfmove;
      const oldHashLo = pos.hashLo;
      const oldHashHi = pos.hashHi;

      // Update hash for null move
      let nlo = pos.hashLo, nhi = pos.hashHi;
      // Toggle side
      nlo ^= ZOBRIST_SIDE[0]; nhi ^= ZOBRIST_SIDE[1];
      // Remove old EP
      if (pos.enPassant !== '-') {
        const epFile = FILES.indexOf(pos.enPassant[0]);
        if (epFile >= 0) { nlo ^= ZOBRIST_EP[epFile][0]; nhi ^= ZOBRIST_EP[epFile][1]; }
      }

      pos.side = opposite(pos.side);
      pos.enPassant = '-';
      pos.halfmove++;
      pos.hashLo = nlo >>> 0;
      pos.hashHi = nhi >>> 0;

      const R = depth > 6 ? 3 : 2;
      const nullScore = -negamax(pos, depth - 1 - R, -beta, -beta + 1, ply + 1, false, null);

      pos.side = oldSide;
      pos.enPassant = oldEP;
      pos.halfmove = oldHalfmove;
      pos.hashLo = oldHashLo;
      pos.hashHi = oldHashHi;

      if (!searchAborted && nullScore >= beta) return beta;
    }
  }

  const moves = pseudoLegalMoves(pos);
  const moveScores = scoreMoves(pos, moves, ttMove, ply, prevMove);

  let bestScore = -INF;
  let bestMove = null;
  let legalCount = 0;
  let ttFlag = TT_FLAG_ALPHA;

  const savedSide = pos.side;

  for (let i = 0; i < moves.length; i++) {
    pickNext(moves, moveScores, i);
    const move = moves[i];

    makeMove(pos, move);
    if (isKingInCheck(pos, savedSide)) { unmakeMove(pos); continue; }
    legalCount++;

    const fromIdx = SQ_FROM_NAME[move.from];
    const toIdx = SQ_FROM_NAME[move.to];
    const curUndo = undoStack[undoTop];
    const wasCapture = curUndo.target !== '.' || curUndo.epCaptureSq >= 0;
    const isQuiet = !wasCapture && !move.promotion;
    const givesCheck = isKingInCheck(pos, pos.side);

    if (!isPV && !inCheck && !givesCheck && depth <= 2 && isQuiet && legalCount > 1) {
      if (staticEval + 150 * depth <= alpha) { unmakeMove(pos); continue; }
    }

    let score;

    if (legalCount === 1) {
      score = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, true, move);
    } else if (legalCount > 3 && depth >= 3 && !inCheck && isQuiet && !givesCheck) {
      let reduction = Math.max(1, Math.floor(Math.log(legalCount) * Math.log(depth) / 2.5));
      if (reduction >= depth - 1) reduction = depth - 2;
      score = -negamax(pos, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true, move);
      if (score > alpha && !searchAborted) {
        score = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, true, move);
      }
    } else {
      score = -negamax(pos, depth - 1, -alpha - 1, -alpha, ply + 1, true, move);
      if (score > alpha && score < beta && !searchAborted) {
        score = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, true, move);
      }
    }

    unmakeMove(pos);

    if (searchAborted) return bestScore > -INF ? bestScore : 0;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }

    if (score > alpha) {
      alpha = score;
      ttFlag = TT_FLAG_EXACT;
    }

    if (alpha >= beta) {
      ttFlag = TT_FLAG_BETA;
      if (isQuiet && ply < 128) {
        killers[ply][1] = killers[ply][0];
        killers[ply][0] = move;
        const hist = savedSide === 'w' ? historyW : historyB;
        hist[fromIdx][toIdx] += depth * depth;
        if (hist[fromIdx][toIdx] > 100000) {
          for (let a = 0; a < 64; a++) for (let b = 0; b < 64; b++) hist[a][b] >>= 1;
        }
        if (prevMove) {
          const cm = savedSide === 'w' ? countermoveW : countermoveB;
          const pf = SQ_FROM_NAME[prevMove.from];
          const pt = SQ_FROM_NAME[prevMove.to];
          cm[pf][pt] = move;
        }
      }
      break;
    }
  }

  if (legalCount === 0) {
    if (inCheck) return -MATE_SCORE + ply;
    return 0;
  }

  ttStore(hashLo, hashHi, depth, ttFlag, bestScore, bestMove, ply);

  return bestScore;
}

// ============================================================================
// SECTION 9: Iterative Deepening with Aspiration Windows
// ============================================================================

const OPENING_BOOK_ENTRIES = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 'e2e4'],
  ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3', 'e7e5'],
  ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6', 'g1f3'],
  ['rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -', 'b8c6'],
  ['r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -', 'f1b5'],
  ['r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -', 'a7a6'],
  ['r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -', 'f8c5'],
  ['rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6', 'g1f3'],
  ['rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -', 'd7d6'],
  ['rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'e4e5'],
  ['rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3', 'd7d5'],
  ['rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6', 'c2c4'],
  ['rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3', 'e7e6'],
  ['rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3', 'e7e5'],
  // French Defense
  ['rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'd2d4'],
  ['rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3', 'd7d5'],
  ['rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq d6', 'b1c3'],
  ['rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq -', 'g8f6'],
  // Caro-Kann
  ['rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'd2d4'],
  ['rnbqkbnr/pp1ppppp/2p5/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3', 'd7d5'],
  ['rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq d6', 'b1c3'],
  ['rnbqkbnr/pp2pppp/2p5/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq -', 'd5e4'],
  // King's Indian Defense
  ['rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3', 'g8f6'],
  ['rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', 'c2c4'],
  ['rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3', 'g7g6'],
  ['rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -', 'b1c3'],
  // London System
  ['rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6', 'c1f4'],
  ['rnbqkbnr/ppp1pppp/8/3p4/3P1B2/8/PPP1PPPP/RN1QKBNR b KQkq -', 'g8f6'],
  ['rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/8/PPP1PPPP/RN1QKBNR w KQkq -', 'e2e3'],
];
const OPENING_BOOK = new Map();
for (const [key, move] of OPENING_BOOK_ENTRIES) OPENING_BOOK.set(key, move);

function pickMove(pos) {
  const legal = legalMoves(pos);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  // Check opening book
  const boardFen = pos.board.reduce((acc, p, i) => {
    if (i > 0 && i % 8 === 0) acc += '/';
    if (p === '.') {
      const last = acc[acc.length - 1];
      if (last >= '1' && last <= '7') acc = acc.slice(0, -1) + String(Number(last) + 1);
      else acc += '1';
    } else acc += p;
    return acc;
  }, '') + ' ' + pos.side + ' ' + pos.castling + ' ' + pos.enPassant;

  const bookMove = OPENING_BOOK.get(boardFen);
  if (bookMove) {
    const from = bookMove.slice(0, 2);
    const to = bookMove.slice(2, 4);
    const promo = bookMove.length > 4 ? bookMove[4] : undefined;
    const match = legal.find(m => m.from === from && m.to === to && (m.promotion || '') === (promo || ''));
    if (match) return match;
  }

  // Initialize incremental hash for search
  initHash(pos);

  searchStartTime = performance.now();

  if (legal.length <= 3) timeLimit = 50;
  else if (legal.length <= 10) timeLimit = 120;
  else timeLimit = 180;

  searchAborted = false;
  nodes = 0;

  for (let i = 0; i < 128; i++) killers[i] = [null, null];

  let bestMove = legal[0];
  let prevScore = 0;
  let lastIterMs = 0;

  for (let depth = 1; depth <= 50; depth++) {
    const elapsed = performance.now() - searchStartTime;
    if (depth > 1 && (elapsed + lastIterMs * 1.5 > timeLimit || elapsed > timeLimit * 0.7)) break;

    const iterStart = performance.now();
    searchAborted = false;

    let score;

    if (depth >= 4) {
      let windowSize = 50;
      let a = prevScore - windowSize;
      let b = prevScore + windowSize;

      score = negamax(pos, depth, a, b, 0, true, null);

      if (!searchAborted && (score <= a || score >= b)) {
        windowSize *= 4;
        a = prevScore - windowSize;
        b = prevScore + windowSize;
        score = negamax(pos, depth, a, b, 0, true, null);
      }

      if (!searchAborted && (score <= a || score >= b)) {
        score = negamax(pos, depth, -INF, INF, 0, true, null);
      }
    } else {
      score = negamax(pos, depth, -INF, INF, 0, true, null);
    }

    if (searchAborted) break;

    lastIterMs = performance.now() - iterStart;
    prevScore = score;

    // Extract best move from TT
    const hashLo = pos.hashLo;
    const hashHi = pos.hashHi;
    const ttEntry = ttProbe(hashLo, hashHi, 0, -INF, INF, 0);
    if (ttEntry && ttEntry.bestMove) {
      const ttMoveUci = moveToUci(ttEntry.bestMove);
      const isLegal = legal.some(m => moveToUci(m) === ttMoveUci);
      if (isLegal) bestMove = ttEntry.bestMove;
    }

    if (Math.abs(score) > MATE_SCORE - 100) break;
  }

  return bestMove;
}

// Entry point
const fen = readFileSync(0, 'utf8').trim();
const pos = parseFen(fen);
const move = pickMove(pos);
process.stdout.write(`${move ? moveToUci(move) : '0000'}\n`);
