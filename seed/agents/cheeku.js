import { readFileSync } from 'node:fs';

// ============================================================
// Chess Engine for Vibe Cup v1
// Single-file, zero-dependency, Node.js-only chess engine
// Alpha-beta with TT, null move, LMR, futility, opening book
// ============================================================

// ---- Constants ----
const FILES = 'abcdefgh';
const EMPTY = 0;
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const WHITE = 0, BLACK = 1;

const W_PAWN = 1, W_KNIGHT = 2, W_BISHOP = 3, W_ROOK = 4, W_QUEEN = 5, W_KING = 6;
const B_PAWN = 9, B_KNIGHT = 10, B_BISHOP = 11, B_ROOK = 12, B_QUEEN = 13, B_KING = 14;

function pieceColor(p) { return p === 0 ? -1 : (p >> 3); }
function pieceType(p) { return p & 7; }
function makePiece(color, type) { return (color << 3) | type; }

// ---- Square utilities ----
function sqRow(s) { return s >> 3; }
function sqCol(s) { return s & 7; }
function sqName(s) { return FILES[s & 7] + (8 - (s >> 3)); }
function nameToSq(name) { return (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]); }

// ---- Move encoding ----
const FLAG_QUIET = 0;
const FLAG_DOUBLE_PAWN = 1;
const FLAG_KING_CASTLE = 2;
const FLAG_QUEEN_CASTLE = 3;
const FLAG_CAPTURE = 4;
const FLAG_EP_CAPTURE = 5;
const FLAG_PROMO_N = 8;
const FLAG_PROMO_B = 9;
const FLAG_PROMO_R = 10;
const FLAG_PROMO_Q = 11;
const FLAG_PROMO_CAP_N = 12;
const FLAG_PROMO_CAP_B = 13;
const FLAG_PROMO_CAP_R = 14;
const FLAG_PROMO_CAP_Q = 15;

function encodeMove(from, to, flags) { return from | (to << 6) | (flags << 12); }
function moveFrom(m) { return m & 63; }
function moveTo(m) { return (m >> 6) & 63; }
function moveFlags(m) { return (m >> 12) & 15; }
function isCapture(m) { return (m >> 12) & 4; }
function isPromotion(m) { return (m >> 12) & 8; }

function promoType(flags) {
  const t = flags & 3;
  return t === 0 ? KNIGHT : t === 1 ? BISHOP : t === 2 ? ROOK : QUEEN;
}

function moveToUci(m) {
  let s = sqName(moveFrom(m)) + sqName(moveTo(m));
  const f = moveFlags(m);
  if (f >= 8) s += 'nbrq'[f & 3];
  return s;
}

// ---- Deterministic PRNG for Zobrist keys ----
function initZobrist() {
  let state = 1070372n;
  function next() {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= 0xFFFFFFFFFFFFFFFFn;
    return Number(state & 0xFFFFFFFFn);
  }
  const pieceKeys = new Array(16);
  for (let p = 0; p < 16; p++) {
    pieceKeys[p] = new Int32Array(64);
    for (let s = 0; s < 64; s++) pieceKeys[p][s] = next();
  }
  const sideKey = next();
  const castleKeys = new Int32Array(16);
  for (let i = 0; i < 16; i++) castleKeys[i] = next();
  const epKeys = new Int32Array(8);
  for (let i = 0; i < 8; i++) epKeys[i] = next();
  return { pieceKeys, sideKey, castleKeys, epKeys };
}

const Z = initZobrist();

// ---- Piece-Square Tables (midgame + endgame) ----
const FLIP = new Int32Array(64);
for (let i = 0; i < 64; i++) FLIP[i] = (7 - (i >> 3)) * 8 + (i & 7);

// Midgame PSTs
const PST_MG = [];
PST_MG[PAWN] = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];
PST_MG[KNIGHT] = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50,
];
PST_MG[BISHOP] = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10,  5,  5, 10, 10,  5,  5,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  5,  0,  0,  0,  0,  5,-10,
 -20,-10,-10,-10,-10,-10,-10,-20,
];
PST_MG[ROOK] = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
];
PST_MG[QUEEN] = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
   0,  0,  5,  5,  5,  5,  0, -5,
 -10,  5,  5,  5,  5,  5,  0,-10,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20,
];
PST_MG[KING] = [
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20,
];

// Endgame PSTs
const PST_EG = [];
PST_EG[PAWN] = [
   0,  0,  0,  0,  0,  0,  0,  0,
  80, 80, 80, 80, 80, 80, 80, 80,
  50, 50, 50, 50, 50, 50, 50, 50,
  30, 30, 30, 30, 30, 30, 30, 30,
  20, 20, 20, 20, 20, 20, 20, 20,
  10, 10, 10, 10, 10, 10, 10, 10,
  10, 10, 10, 10, 10, 10, 10, 10,
   0,  0,  0,  0,  0,  0,  0,  0,
];
PST_EG[KNIGHT] = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50,
];
PST_EG[BISHOP] = PST_MG[BISHOP].slice();
PST_EG[ROOK] = PST_MG[ROOK].slice();
PST_EG[QUEEN] = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5, 10, 10,  5,  0, -5,
  -5,  0,  5, 10, 10,  5,  0, -5,
 -10,  0,  5,  5,  5,  5,  0,-10,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20,
];
PST_EG[KING] = [
 -50,-40,-30,-20,-20,-30,-40,-50,
 -30,-20,-10,  0,  0,-10,-20,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-30,  0,  0,  0,  0,-30,-30,
 -50,-30,-30,-30,-30,-30,-30,-50,
];

// Material values
const MAT_MG = [0, 100, 320, 330, 500, 900, 20000];
const MAT_EG = [0, 100, 320, 330, 500, 900, 20000];

// Victim scores for MVV-LVA
const VICTIM_SCORE = [0, 100, 300, 300, 500, 900, 0, 0, 0, 100, 300, 300, 500, 900, 0];

// ---- Board State (global mutable) ----
const board = new Int32Array(64);
let sideToMove = WHITE;
let castleRights = 0;
let epSquare = -1;
let halfmoveClock = 0;
let fullmoveNumber = 1;
let hashKey = 0;
const kingPos = [0, 0];
const undoStack = [];

// ---- FEN Parsing ----
const FEN_PIECES = { P: W_PAWN, N: W_KNIGHT, B: W_BISHOP, R: W_ROOK, Q: W_QUEEN, K: W_KING,
                     p: B_PAWN, n: B_KNIGHT, b: B_BISHOP, r: B_ROOK, q: B_QUEEN, k: B_KING };

function parseFen(fen) {
  const parts = fen.trim().split(/\s+/);
  board.fill(EMPTY);
  let idx = 0;
  for (const ch of parts[0]) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') { idx += Number(ch); continue; }
    const p = FEN_PIECES[ch];
    board[idx] = p;
    if (pieceType(p) === KING) kingPos[pieceColor(p)] = idx;
    idx++;
  }
  sideToMove = (parts[1] || 'w') === 'w' ? WHITE : BLACK;
  castleRights = 0;
  const c = parts[2] || '-';
  if (c.includes('K')) castleRights |= 1;
  if (c.includes('Q')) castleRights |= 2;
  if (c.includes('k')) castleRights |= 4;
  if (c.includes('q')) castleRights |= 8;
  epSquare = (parts[3] && parts[3] !== '-') ? nameToSq(parts[3]) : -1;
  halfmoveClock = Number(parts[4] || 0);
  fullmoveNumber = Number(parts[5] || 1);
  hashKey = computeHash();
  undoStack.length = 0;
}

function computeHash() {
  let h = 0;
  for (let s = 0; s < 64; s++) {
    if (board[s]) h ^= Z.pieceKeys[board[s]][s];
  }
  if (sideToMove === BLACK) h ^= Z.sideKey;
  h ^= Z.castleKeys[castleRights];
  if (epSquare >= 0) h ^= Z.epKeys[epSquare & 7];
  return h;
}

// ---- Attack Detection ----
const KNIGHT_OFFSETS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const BISHOP_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ROOK_DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
const KING_DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

function isSquareAttacked(sq, byColor) {
  const r = sq >> 3, c = sq & 7;

  // Pawn attacks
  const pawnDir = byColor === WHITE ? 1 : -1;
  const pawnPiece = makePiece(byColor, PAWN);
  const pr = r + pawnDir;
  if (pr >= 0 && pr < 8) {
    if (c > 0 && board[pr * 8 + c - 1] === pawnPiece) return true;
    if (c < 7 && board[pr * 8 + c + 1] === pawnPiece) return true;
  }

  // Knight
  const knightPiece = makePiece(byColor, KNIGHT);
  for (let i = 0; i < 8; i++) {
    const nr = r + KNIGHT_OFFSETS[i][0], nc = c + KNIGHT_OFFSETS[i][1];
    if ((nr & 7) === nr && (nc & 7) === nc && board[nr * 8 + nc] === knightPiece) return true;
  }

  // King
  const kingPiece = makePiece(byColor, KING);
  for (let i = 0; i < 8; i++) {
    const nr = r + KING_DIRS[i][0], nc = c + KING_DIRS[i][1];
    if ((nr & 7) === nr && (nc & 7) === nc && board[nr * 8 + nc] === kingPiece) return true;
  }

  // Bishop/Queen (diagonal)
  const bishopPiece = makePiece(byColor, BISHOP);
  const queenPiece = makePiece(byColor, QUEEN);
  for (let i = 0; i < 4; i++) {
    const dr = BISHOP_DIRS[i][0], dc = BISHOP_DIRS[i][1];
    let nr = r + dr, nc = c + dc;
    while ((nr & 7) === nr && (nc & 7) === nc) {
      const p = board[nr * 8 + nc];
      if (p !== EMPTY) {
        if (p === bishopPiece || p === queenPiece) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }

  // Rook/Queen (straight)
  const rookPiece = makePiece(byColor, ROOK);
  for (let i = 0; i < 4; i++) {
    const dr = ROOK_DIRS[i][0], dc = ROOK_DIRS[i][1];
    let nr = r + dr, nc = c + dc;
    while ((nr & 7) === nr && (nc & 7) === nc) {
      const p = board[nr * 8 + nc];
      if (p !== EMPTY) {
        if (p === rookPiece || p === queenPiece) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }

  return false;
}

function inCheck(color) {
  return isSquareAttacked(kingPos[color], color ^ 1);
}

// ---- Move Generation ----
const moveBuffer = new Int32Array(32768);

function generateMoves(startIdx) {
  let idx = startIdx;
  const us = sideToMove, them = us ^ 1;
  const pawnDir = us === WHITE ? -1 : 1;
  const startRank = us === WHITE ? 6 : 1;
  const promoRank = us === WHITE ? 0 : 7;

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (piece === EMPTY || pieceColor(piece) !== us) continue;
    const pt = pieceType(piece);
    const r = from >> 3, c = from & 7;

    if (pt === PAWN) {
      const oneR = r + pawnDir;
      if (oneR >= 0 && oneR < 8) {
        const oneS = oneR * 8 + c;
        if (board[oneS] === EMPTY) {
          if (oneR === promoRank) {
            moveBuffer[idx++] = encodeMove(from, oneS, FLAG_PROMO_N);
            moveBuffer[idx++] = encodeMove(from, oneS, FLAG_PROMO_B);
            moveBuffer[idx++] = encodeMove(from, oneS, FLAG_PROMO_R);
            moveBuffer[idx++] = encodeMove(from, oneS, FLAG_PROMO_Q);
          } else {
            moveBuffer[idx++] = encodeMove(from, oneS, FLAG_QUIET);
            if (r === startRank) {
              const twoS = (r + pawnDir * 2) * 8 + c;
              if (board[twoS] === EMPTY) moveBuffer[idx++] = encodeMove(from, twoS, FLAG_DOUBLE_PAWN);
            }
          }
        }
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (nc < 0 || nc > 7) continue;
          const toS = oneR * 8 + nc;
          if (toS === epSquare) {
            moveBuffer[idx++] = encodeMove(from, toS, FLAG_EP_CAPTURE);
          } else if (board[toS] !== EMPTY && pieceColor(board[toS]) === them) {
            if (oneR === promoRank) {
              moveBuffer[idx++] = encodeMove(from, toS, FLAG_PROMO_CAP_N);
              moveBuffer[idx++] = encodeMove(from, toS, FLAG_PROMO_CAP_B);
              moveBuffer[idx++] = encodeMove(from, toS, FLAG_PROMO_CAP_R);
              moveBuffer[idx++] = encodeMove(from, toS, FLAG_PROMO_CAP_Q);
            } else {
              moveBuffer[idx++] = encodeMove(from, toS, FLAG_CAPTURE);
            }
          }
        }
      }
    } else if (pt === KNIGHT) {
      for (let i = 0; i < 8; i++) {
        const nr = r + KNIGHT_OFFSETS[i][0], nc = c + KNIGHT_OFFSETS[i][1];
        if ((nr & 7) !== nr || (nc & 7) !== nc) continue;
        const toS = nr * 8 + nc;
        const target = board[toS];
        if (target === EMPTY) moveBuffer[idx++] = encodeMove(from, toS, FLAG_QUIET);
        else if (pieceColor(target) === them) moveBuffer[idx++] = encodeMove(from, toS, FLAG_CAPTURE);
      }
    } else if (pt === BISHOP || pt === ROOK || pt === QUEEN) {
      const dirs = pt === BISHOP ? BISHOP_DIRS : pt === ROOK ? ROOK_DIRS : KING_DIRS;
      const numDirs = pt === QUEEN ? 8 : 4;
      for (let d = 0; d < numDirs; d++) {
        const dr = dirs[d][0], dc = dirs[d][1];
        let nr = r + dr, nc = c + dc;
        while ((nr & 7) === nr && (nc & 7) === nc) {
          const toS = nr * 8 + nc;
          const target = board[toS];
          if (target === EMPTY) {
            moveBuffer[idx++] = encodeMove(from, toS, FLAG_QUIET);
          } else {
            if (pieceColor(target) === them) moveBuffer[idx++] = encodeMove(from, toS, FLAG_CAPTURE);
            break;
          }
          nr += dr; nc += dc;
        }
      }
    } else if (pt === KING) {
      for (let d = 0; d < 8; d++) {
        const nr = r + KING_DIRS[d][0], nc = c + KING_DIRS[d][1];
        if ((nr & 7) !== nr || (nc & 7) !== nc) continue;
        const toS = nr * 8 + nc;
        const target = board[toS];
        if (target === EMPTY) moveBuffer[idx++] = encodeMove(from, toS, FLAG_QUIET);
        else if (pieceColor(target) === them) moveBuffer[idx++] = encodeMove(from, toS, FLAG_CAPTURE);
      }
      // Castling
      if (us === WHITE && from === 60) {
        if ((castleRights & 1) && board[61] === EMPTY && board[62] === EMPTY &&
            board[63] === W_ROOK && !isSquareAttacked(60, BLACK) &&
            !isSquareAttacked(61, BLACK) && !isSquareAttacked(62, BLACK))
          moveBuffer[idx++] = encodeMove(60, 62, FLAG_KING_CASTLE);
        if ((castleRights & 2) && board[59] === EMPTY && board[58] === EMPTY && board[57] === EMPTY &&
            board[56] === W_ROOK && !isSquareAttacked(60, BLACK) &&
            !isSquareAttacked(59, BLACK) && !isSquareAttacked(58, BLACK))
          moveBuffer[idx++] = encodeMove(60, 58, FLAG_QUEEN_CASTLE);
      } else if (us === BLACK && from === 4) {
        if ((castleRights & 4) && board[5] === EMPTY && board[6] === EMPTY &&
            board[7] === B_ROOK && !isSquareAttacked(4, WHITE) &&
            !isSquareAttacked(5, WHITE) && !isSquareAttacked(6, WHITE))
          moveBuffer[idx++] = encodeMove(4, 6, FLAG_KING_CASTLE);
        if ((castleRights & 8) && board[3] === EMPTY && board[2] === EMPTY && board[1] === EMPTY &&
            board[0] === B_ROOK && !isSquareAttacked(4, WHITE) &&
            !isSquareAttacked(3, WHITE) && !isSquareAttacked(2, WHITE))
          moveBuffer[idx++] = encodeMove(4, 2, FLAG_QUEEN_CASTLE);
      }
    }
  }
  return idx;
}

function generateCaptures(startIdx) {
  let idx = startIdx;
  const us = sideToMove, them = us ^ 1;
  const pawnDir = us === WHITE ? -1 : 1;
  const promoRank = us === WHITE ? 0 : 7;

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (piece === EMPTY || pieceColor(piece) !== us) continue;
    const pt = pieceType(piece);
    const r = from >> 3, c = from & 7;

    if (pt === PAWN) {
      const oneR = r + pawnDir;
      if (oneR >= 0 && oneR < 8) {
        // Promotion pushes
        if (oneR === promoRank && board[oneR * 8 + c] === EMPTY) {
          moveBuffer[idx++] = encodeMove(from, oneR * 8 + c, FLAG_PROMO_Q);
        }
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (nc < 0 || nc > 7) continue;
          const toS = oneR * 8 + nc;
          if (toS === epSquare) moveBuffer[idx++] = encodeMove(from, toS, FLAG_EP_CAPTURE);
          else if (board[toS] !== EMPTY && pieceColor(board[toS]) === them) {
            if (oneR === promoRank) moveBuffer[idx++] = encodeMove(from, toS, FLAG_PROMO_CAP_Q);
            else moveBuffer[idx++] = encodeMove(from, toS, FLAG_CAPTURE);
          }
        }
      }
    } else if (pt === KNIGHT) {
      for (let i = 0; i < 8; i++) {
        const nr = r + KNIGHT_OFFSETS[i][0], nc = c + KNIGHT_OFFSETS[i][1];
        if ((nr & 7) !== nr || (nc & 7) !== nc) continue;
        const toS = nr * 8 + nc;
        if (board[toS] !== EMPTY && pieceColor(board[toS]) === them)
          moveBuffer[idx++] = encodeMove(from, toS, FLAG_CAPTURE);
      }
    } else if (pt === BISHOP || pt === ROOK || pt === QUEEN) {
      const dirs = pt === BISHOP ? BISHOP_DIRS : pt === ROOK ? ROOK_DIRS : KING_DIRS;
      const numDirs = pt === QUEEN ? 8 : 4;
      for (let d = 0; d < numDirs; d++) {
        const dr = dirs[d][0], dc = dirs[d][1];
        let nr = r + dr, nc = c + dc;
        while ((nr & 7) === nr && (nc & 7) === nc) {
          const toS = nr * 8 + nc;
          const target = board[toS];
          if (target === EMPTY) { nr += dr; nc += dc; continue; }
          if (pieceColor(target) === them) moveBuffer[idx++] = encodeMove(from, toS, FLAG_CAPTURE);
          break;
        }
      }
    } else if (pt === KING) {
      for (let d = 0; d < 8; d++) {
        const nr = r + KING_DIRS[d][0], nc = c + KING_DIRS[d][1];
        if ((nr & 7) !== nr || (nc & 7) !== nc) continue;
        const toS = nr * 8 + nc;
        if (board[toS] !== EMPTY && pieceColor(board[toS]) === them)
          moveBuffer[idx++] = encodeMove(from, toS, FLAG_CAPTURE);
      }
    }
  }
  return idx;
}

// ---- Make / Unmake Move ----
function makeMove(move) {
  const from = moveFrom(move);
  const to = moveTo(move);
  const flags = moveFlags(move);
  const piece = board[from];
  const captured = board[to];
  const us = sideToMove;

  undoStack.push({ move, piece, captured, castleRights, epSquare, halfmoveClock, hashKey,
                   kp0: kingPos[0], kp1: kingPos[1] });

  hashKey ^= Z.castleKeys[castleRights];
  if (epSquare >= 0) hashKey ^= Z.epKeys[epSquare & 7];
  hashKey ^= Z.pieceKeys[piece][from];
  if (captured) hashKey ^= Z.pieceKeys[captured][to];

  halfmoveClock++;
  if (pieceType(piece) === PAWN || captured !== EMPTY) halfmoveClock = 0;
  if (us === BLACK) fullmoveNumber++;

  board[from] = EMPTY;
  epSquare = -1;

  if (flags === FLAG_EP_CAPTURE) {
    const capSq = to + (us === WHITE ? 8 : -8);
    hashKey ^= Z.pieceKeys[board[capSq]][capSq];
    board[capSq] = EMPTY;
    board[to] = piece;
    hashKey ^= Z.pieceKeys[piece][to];
    halfmoveClock = 0;
  } else if (flags === FLAG_DOUBLE_PAWN) {
    board[to] = piece;
    hashKey ^= Z.pieceKeys[piece][to];
    epSquare = (from + to) >> 1;
    hashKey ^= Z.epKeys[epSquare & 7];
  } else if (flags === FLAG_KING_CASTLE) {
    board[to] = piece;
    hashKey ^= Z.pieceKeys[piece][to];
    const rookFrom = us === WHITE ? 63 : 7;
    const rookTo = us === WHITE ? 61 : 5;
    const rook = board[rookFrom];
    hashKey ^= Z.pieceKeys[rook][rookFrom];
    board[rookFrom] = EMPTY;
    board[rookTo] = rook;
    hashKey ^= Z.pieceKeys[rook][rookTo];
  } else if (flags === FLAG_QUEEN_CASTLE) {
    board[to] = piece;
    hashKey ^= Z.pieceKeys[piece][to];
    const rookFrom = us === WHITE ? 56 : 0;
    const rookTo = us === WHITE ? 59 : 3;
    const rook = board[rookFrom];
    hashKey ^= Z.pieceKeys[rook][rookFrom];
    board[rookFrom] = EMPTY;
    board[rookTo] = rook;
    hashKey ^= Z.pieceKeys[rook][rookTo];
  } else if (flags >= 8) {
    const promoPiece = makePiece(us, promoType(flags));
    board[to] = promoPiece;
    hashKey ^= Z.pieceKeys[promoPiece][to];
    halfmoveClock = 0;
  } else {
    board[to] = piece;
    hashKey ^= Z.pieceKeys[piece][to];
  }

  if (pieceType(piece) === KING) kingPos[us] = to;

  // Update castling rights
  if (pieceType(piece) === KING) {
    castleRights &= us === WHITE ? ~3 : ~12;
  }
  if (from === 63 || to === 63) castleRights &= ~1;
  if (from === 56 || to === 56) castleRights &= ~2;
  if (from === 7 || to === 7) castleRights &= ~4;
  if (from === 0 || to === 0) castleRights &= ~8;

  hashKey ^= Z.castleKeys[castleRights];
  hashKey ^= Z.sideKey;
  sideToMove ^= 1;
}

function unmakeMove() {
  const u = undoStack.pop();
  const from = moveFrom(u.move);
  const to = moveTo(u.move);
  const flags = moveFlags(u.move);
  const us = sideToMove ^ 1;

  sideToMove = us;
  castleRights = u.castleRights;
  epSquare = u.epSquare;
  halfmoveClock = u.halfmoveClock;
  hashKey = u.hashKey;
  kingPos[0] = u.kp0;
  kingPos[1] = u.kp1;
  if (us === BLACK) fullmoveNumber--;

  board[from] = u.piece;
  board[to] = u.captured;

  if (flags === FLAG_EP_CAPTURE) {
    const capSq = to + (us === WHITE ? 8 : -8);
    board[capSq] = makePiece(us ^ 1, PAWN);
    board[to] = EMPTY;
  } else if (flags === FLAG_KING_CASTLE) {
    const rookFrom = us === WHITE ? 63 : 7;
    const rookTo = us === WHITE ? 61 : 5;
    board[rookFrom] = board[rookTo];
    board[rookTo] = EMPTY;
  } else if (flags === FLAG_QUEEN_CASTLE) {
    const rookFrom = us === WHITE ? 56 : 0;
    const rookTo = us === WHITE ? 59 : 3;
    board[rookFrom] = board[rookTo];
    board[rookTo] = EMPTY;
  }
}

function makeMoveIfLegal(move) {
  const us = sideToMove;
  makeMove(move);
  if (inCheck(us)) { unmakeMove(); return false; }
  return true;
}

// ---- Null Move ----
function makeNullMove() {
  undoStack.push({ move: 0, piece: 0, captured: 0, castleRights, epSquare, halfmoveClock,
                   hashKey, kp0: kingPos[0], kp1: kingPos[1] });
  hashKey ^= Z.sideKey;
  if (epSquare >= 0) {
    hashKey ^= Z.epKeys[epSquare & 7];
    epSquare = -1;
  }
  sideToMove ^= 1;
}

function unmakeNullMove() {
  const u = undoStack.pop();
  sideToMove ^= 1;
  epSquare = u.epSquare;
  halfmoveClock = u.halfmoveClock;
  hashKey = u.hashKey;
}

// ---- Evaluation ----
function evaluate() {
  let mgScore = 0, egScore = 0, phase = 0;
  let wBishops = 0, bBishops = 0;
  const wPawnFiles = new Int8Array(8);
  const bPawnFiles = new Int8Array(8);
  const wPawnMinRank = new Int8Array(8); // closest to rank 8 (row 0)
  const bPawnMaxRank = new Int8Array(8); // closest to rank 1 (row 7)
  wPawnMinRank.fill(7);
  bPawnMaxRank.fill(0);

  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (p === EMPTY) continue;
    const color = pieceColor(p);
    const pt = pieceType(p);
    const pstIdx = color === WHITE ? s : FLIP[s];

    if (pt === KNIGHT || pt === BISHOP) phase += 1;
    else if (pt === ROOK) phase += 2;
    else if (pt === QUEEN) phase += 4;

    if (pt === BISHOP) { if (color === WHITE) wBishops++; else bBishops++; }

    if (pt === PAWN) {
      const file = s & 7, rank = s >> 3;
      if (color === WHITE) { wPawnFiles[file]++; if (rank < wPawnMinRank[file]) wPawnMinRank[file] = rank; }
      else { bPawnFiles[file]++; if (rank > bPawnMaxRank[file]) bPawnMaxRank[file] = rank; }
    }

    const mg = MAT_MG[pt] + PST_MG[pt][pstIdx];
    const eg = MAT_EG[pt] + PST_EG[pt][pstIdx];
    if (color === WHITE) { mgScore += mg; egScore += eg; }
    else { mgScore -= mg; egScore -= eg; }
  }

  // Bishop pair
  if (wBishops >= 2) { mgScore += 30; egScore += 50; }
  if (bBishops >= 2) { mgScore -= 30; egScore -= 50; }

  // Pawn structure
  for (let f = 0; f < 8; f++) {
    // Doubled pawns
    if (wPawnFiles[f] > 1) { mgScore -= 10 * (wPawnFiles[f] - 1); egScore -= 20 * (wPawnFiles[f] - 1); }
    if (bPawnFiles[f] > 1) { mgScore += 10 * (bPawnFiles[f] - 1); egScore += 20 * (bPawnFiles[f] - 1); }

    // Isolated pawns
    const wAdj = (f > 0 ? wPawnFiles[f-1] : 0) + (f < 7 ? wPawnFiles[f+1] : 0);
    const bAdj = (f > 0 ? bPawnFiles[f-1] : 0) + (f < 7 ? bPawnFiles[f+1] : 0);
    if (wPawnFiles[f] > 0 && wAdj === 0) { mgScore -= 15; egScore -= 20; }
    if (bPawnFiles[f] > 0 && bAdj === 0) { mgScore += 15; egScore += 20; }

    // Passed pawns
    if (wPawnFiles[f] > 0) {
      const wr = wPawnMinRank[f];
      let passed = true;
      for (let r = 0; r < wr && passed; r++) {
        for (let df = -1; df <= 1; df++) {
          const nf = f + df;
          if (nf >= 0 && nf < 8 && board[r * 8 + nf] === B_PAWN) { passed = false; break; }
        }
      }
      if (passed) { const adv = 7 - wr; mgScore += adv * 10; egScore += adv * 25; }
    }
    if (bPawnFiles[f] > 0) {
      const br = bPawnMaxRank[f];
      let passed = true;
      for (let r = br + 1; r < 8 && passed; r++) {
        for (let df = -1; df <= 1; df++) {
          const nf = f + df;
          if (nf >= 0 && nf < 8 && board[r * 8 + nf] === W_PAWN) { passed = false; break; }
        }
      }
      if (passed) { const adv = br; mgScore -= adv * 10; egScore -= adv * 25; }
    }
  }

  // Rook on open/semi-open file
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (p === EMPTY || pieceType(p) !== ROOK) continue;
    const f = s & 7;
    if (pieceColor(p) === WHITE) {
      if (wPawnFiles[f] === 0 && bPawnFiles[f] === 0) { mgScore += 20; egScore += 10; }
      else if (wPawnFiles[f] === 0) { mgScore += 10; egScore += 5; }
    } else {
      if (wPawnFiles[f] === 0 && bPawnFiles[f] === 0) { mgScore -= 20; egScore -= 10; }
      else if (bPawnFiles[f] === 0) { mgScore -= 10; egScore -= 5; }
    }
  }

  // King safety (pawn shield)
  const wkFile = kingPos[WHITE] & 7, wkRank = kingPos[WHITE] >> 3;
  const bkFile = kingPos[BLACK] & 7, bkRank = kingPos[BLACK] >> 3;
  if (wkRank >= 6) {
    for (let df = -1; df <= 1; df++) {
      const f = wkFile + df;
      if (f < 0 || f > 7) continue;
      if (wPawnFiles[f] > 0 && wPawnMinRank[f] >= 5) mgScore += 12;
      else mgScore -= 18;
    }
  }
  if (bkRank <= 1) {
    for (let df = -1; df <= 1; df++) {
      const f = bkFile + df;
      if (f < 0 || f > 7) continue;
      if (bPawnFiles[f] > 0 && bPawnMaxRank[f] <= 2) mgScore -= 12;
      else mgScore += 18;
    }
  }

  // Tapered eval
  if (phase > 24) phase = 24;
  const score = ((mgScore * phase + egScore * (24 - phase)) / 24) | 0;
  return sideToMove === WHITE ? score : -score;
}

// ---- Transposition Table ----
const TT_SIZE = 1 << 19; // 524288 entries
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 0, TT_ALPHA = 1, TT_BETA = 2;

const ttKey = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Int8Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);

function ttStore(key, depth, flag, score, move) {
  const idx = (key >>> 0) & TT_MASK;
  if (depth >= ttDepth[idx] || ttKey[idx] !== key) {
    ttKey[idx] = key;
    ttDepth[idx] = depth;
    ttFlag[idx] = flag;
    ttScore[idx] = score;
    ttMove[idx] = move;
  }
}

function ttProbe(key) {
  const idx = (key >>> 0) & TT_MASK;
  if (ttKey[idx] === key) return idx;
  return -1;
}

// ---- Move Ordering ----
const killers = new Array(128);
for (let i = 0; i < 128; i++) killers[i] = [0, 0];
const historyTable = new Int32Array(2 * 64 * 64);

// Scores indexed by absolute buffer position (same as moveBuffer) to avoid cross-ply corruption
const moveScores = new Int32Array(32768);

function scoreMoves(start, end, ply, hashMove) {
  for (let i = start; i < end; i++) {
    const m = moveBuffer[i];
    if (m === hashMove) {
      moveScores[i] = 10000000;
    } else if (isCapture(m) || moveFlags(m) === FLAG_EP_CAPTURE) {
      const captured = board[moveTo(m)];
      const attacker = board[moveFrom(m)];
      moveScores[i] = 1000000 + (captured ? VICTIM_SCORE[captured] : 100) * 8 - (VICTIM_SCORE[attacker] || 0);
    } else if (isPromotion(m)) {
      moveScores[i] = 900000 + promoType(moveFlags(m)) * 100;
    } else if (ply < 128 && m === killers[ply][0]) {
      moveScores[i] = 800000;
    } else if (ply < 128 && m === killers[ply][1]) {
      moveScores[i] = 700000;
    } else {
      moveScores[i] = historyTable[sideToMove * 4096 + moveFrom(m) * 64 + moveTo(m)];
    }
  }
}

function pickBest(current, end) {
  let bestIdx = current, bestScore = moveScores[current];
  for (let i = current + 1; i < end; i++) {
    if (moveScores[i] > bestScore) { bestScore = moveScores[i]; bestIdx = i; }
  }
  if (bestIdx !== current) {
    let tmp = moveBuffer[current]; moveBuffer[current] = moveBuffer[bestIdx]; moveBuffer[bestIdx] = tmp;
    tmp = moveScores[current]; moveScores[current] = moveScores[bestIdx]; moveScores[bestIdx] = tmp;
  }
}

// ---- Search ----
const INF = 999999;
const MATE = 100000;
let nodes = 0;
let searchStartTime = 0;
let timeLimit = 0;
let stopped = false;

function checkTime() {
  if ((nodes & 2047) === 0 && Date.now() - searchStartTime >= timeLimit) stopped = true;
}

function qsearch(alpha, beta, ply) {
  nodes++;
  checkTime();
  if (stopped) return 0;

  const standPat = evaluate();
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;
  if (standPat + 1000 < alpha) return alpha; // delta pruning

  const start = ply * 256;
  const end = generateCaptures(start);

  // Score captures using absolute indices
  for (let i = start; i < end; i++) {
    const m = moveBuffer[i];
    const captured = board[moveTo(m)];
    const attacker = board[moveFrom(m)];
    moveScores[i] = (captured ? VICTIM_SCORE[captured] : 100) * 8 - (VICTIM_SCORE[attacker] || 0);
  }

  for (let i = start; i < end; i++) {
    // Selection sort using absolute indices
    let bestJ = i, bestS = moveScores[i];
    for (let j = i + 1; j < end; j++) {
      if (moveScores[j] > bestS) { bestS = moveScores[j]; bestJ = j; }
    }
    if (bestJ !== i) {
      let tmp = moveBuffer[i]; moveBuffer[i] = moveBuffer[bestJ]; moveBuffer[bestJ] = tmp;
      tmp = moveScores[i]; moveScores[i] = moveScores[bestJ]; moveScores[bestJ] = tmp;
    }

    const m = moveBuffer[i];

    // Skip losing captures (SEE approximation)
    const captured = board[moveTo(m)];
    const attacker = board[moveFrom(m)];
    if (captured && VICTIM_SCORE[captured] + 200 < VICTIM_SCORE[attacker] && !isPromotion(m)) continue;

    if (!makeMoveIfLegal(m)) continue;
    const score = -qsearch(-beta, -alpha, ply + 1);
    unmakeMove();

    if (stopped) return 0;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// Futility margins
const FUTILITY_MARGIN = [0, 200, 350, 500];

function alphaBeta(depth, alpha, beta, ply, doNull) {
  if (stopped) return 0;
  if (halfmoveClock >= 100) return 0;

  // Mate distance pruning
  let mateVal = MATE - ply;
  if (mateVal < beta) { beta = mateVal; if (alpha >= mateVal) return mateVal; }
  mateVal = -MATE + ply;
  if (mateVal > alpha) { alpha = mateVal; if (beta <= mateVal) return mateVal; }

  // TT probe
  const ttIdx = ttProbe(hashKey);
  let hashMove = 0;
  if (ttIdx >= 0) {
    hashMove = ttMove[ttIdx];
    if (ttDepth[ttIdx] >= depth) {
      const s = ttScore[ttIdx];
      if (ttFlag[ttIdx] === TT_EXACT) return s;
      if (ttFlag[ttIdx] === TT_ALPHA && s <= alpha) return alpha;
      if (ttFlag[ttIdx] === TT_BETA && s >= beta) return beta;
    }
  }

  if (depth <= 0) return qsearch(alpha, beta, ply);

  nodes++;
  checkTime();
  if (stopped) return 0;

  const inCheckNow = inCheck(sideToMove);
  if (inCheckNow) depth++;

  const staticEval = inCheckNow ? -INF : evaluate();

  // Reverse futility pruning
  if (!inCheckNow && depth <= 3 && ply > 0 && staticEval - FUTILITY_MARGIN[depth] >= beta) {
    return staticEval - FUTILITY_MARGIN[depth];
  }

  // Null move pruning
  if (doNull && !inCheckNow && depth >= 3 && ply > 0 && staticEval >= beta) {
    let hasNonPawn = false;
    for (let s = 0; s < 64; s++) {
      const p = board[s];
      if (p !== EMPTY && pieceColor(p) === sideToMove && pieceType(p) !== PAWN && pieceType(p) !== KING) {
        hasNonPawn = true; break;
      }
    }
    if (hasNonPawn) {
      const R = depth >= 6 ? 3 : 2;
      makeNullMove();
      const nullScore = -alphaBeta(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
      unmakeNullMove();
      if (stopped) return 0;
      if (nullScore >= beta) return beta;
    }
  }

  const start = ply * 256;
  const end = generateMoves(start);
  scoreMoves(start, end, ply, hashMove);

  let bestScore = -INF, bestMove = 0, movesSearched = 0;
  let flag = TT_ALPHA;

  const canFutility = !inCheckNow && depth <= 3 && ply > 0 && staticEval + FUTILITY_MARGIN[depth] <= alpha;

  for (let i = start; i < end; i++) {
    pickBest(i, end);
    const m = moveBuffer[i];

    // Futility pruning: skip quiet moves that can't raise alpha
    if (canFutility && movesSearched > 0 && !isCapture(m) && !isPromotion(m) && moveFlags(m) !== FLAG_EP_CAPTURE) {
      continue;
    }

    if (!makeMoveIfLegal(m)) continue;

    let score;
    const givesCheck = inCheck(sideToMove);

    // Late move reductions
    if (movesSearched >= 4 && depth >= 3 && !inCheckNow && !givesCheck &&
        !isCapture(m) && !isPromotion(m) && moveFlags(m) !== FLAG_EP_CAPTURE) {
      let R = 1;
      if (movesSearched >= 8) R = 2;
      if (movesSearched >= 16) R = 3;
      score = -alphaBeta(depth - 1 - R, -alpha - 1, -alpha, ply + 1, true);
      if (score > alpha) score = -alphaBeta(depth - 1, -beta, -alpha, ply + 1, true);
    } else if (movesSearched > 0) {
      // PVS
      score = -alphaBeta(depth - 1, -alpha - 1, -alpha, ply + 1, true);
      if (score > alpha && score < beta) score = -alphaBeta(depth - 1, -beta, -alpha, ply + 1, true);
    } else {
      score = -alphaBeta(depth - 1, -beta, -alpha, ply + 1, true);
    }

    unmakeMove();
    if (stopped) return 0;
    movesSearched++;

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
      if (score > alpha) {
        alpha = score;
        flag = TT_EXACT;
        if (score >= beta) {
          // Killer and history updates
          if (!isCapture(m) && moveFlags(m) !== FLAG_EP_CAPTURE && !isPromotion(m) && ply < 128) {
            if (killers[ply][0] !== m) {
              killers[ply][1] = killers[ply][0];
              killers[ply][0] = m;
            }
            const hIdx = sideToMove * 4096 + moveFrom(m) * 64 + moveTo(m);
            historyTable[hIdx] += depth * depth;
            if (historyTable[hIdx] > 100000) {
              for (let j = 0; j < historyTable.length; j++) historyTable[j] >>= 1;
            }
          }
          ttStore(hashKey, depth, TT_BETA, bestScore, bestMove);
          return bestScore;
        }
      }
    }
  }

  if (movesSearched === 0) {
    if (inCheckNow) return -MATE + ply;
    return 0;
  }

  ttStore(hashKey, depth, flag, bestScore, bestMove);
  return bestScore;
}

// Iterative deepening with aspiration windows
function search(maxTime) {
  searchStartTime = Date.now();
  timeLimit = maxTime;
  stopped = false;
  nodes = 0;

  for (let i = 0; i < 128; i++) { killers[i][0] = 0; killers[i][1] = 0; }
  historyTable.fill(0);

  // Find any legal move as fallback
  let bestMove = 0;
  const start = 0;
  const end = generateMoves(start);
  for (let i = start; i < end; i++) {
    if (makeMoveIfLegal(moveBuffer[i])) {
      unmakeMove();
      bestMove = moveBuffer[i];
      break;
    }
  }

  let prevScore = 0;

  for (let depth = 1; depth <= 50; depth++) {
    let alpha, beta;

    // Aspiration window
    if (depth >= 4) {
      alpha = prevScore - 50;
      beta = prevScore + 50;
    } else {
      alpha = -INF;
      beta = INF;
    }

    let score = alphaBeta(depth, alpha, beta, 0, true);

    // Re-search with wider window if outside aspiration
    if (!stopped && (score <= alpha || score >= beta)) {
      score = alphaBeta(depth, -INF, INF, 0, true);
    }

    if (stopped) break;

    prevScore = score;
    const entry = ttProbe(hashKey);
    if (entry >= 0 && ttMove[entry]) bestMove = ttMove[entry];

    if (Math.abs(score) >= MATE - 100) break;
    if (Date.now() - searchStartTime > maxTime * 0.45) break;
  }

  return bestMove;
}

// ---- Opening Book ----
// Apply a UCI move string to current position (for book building)
function applyUciMove(uci) {
  const from = nameToSq(uci.slice(0, 2));
  const to = nameToSq(uci.slice(2, 4));
  const promoChar = uci.length > 4 ? uci[4] : null;

  const start = 0;
  const end = generateMoves(start);
  for (let i = start; i < end; i++) {
    const m = moveBuffer[i];
    if (moveFrom(m) === from && moveTo(m) === to) {
      if (promoChar) {
        const pt = promoType(moveFlags(m));
        const expected = { n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN }[promoChar];
        if (pt !== expected) continue;
      }
      if (makeMoveIfLegal(m)) return true;
    }
  }
  return false;
}

const openingBook = new Map();

function buildBook() {
  const lines = [
    // --- WHITE OPENINGS ---
    // Italian Game / Giuoco Piano
    "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d4 e5d4 c3d4 c5b4 b1c3",
    "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8c5 c2c3 d7d6 b1d2",
    "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 d2d3 g8f6 c2c3",
    // Ruy Lopez
    "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8",
    "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 e8g8 c2c3 d7d6",
    "e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f8e7",
    // Scotch Game
    "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 b1c3 f8b4 d4c6 b7c6 f1d3",
    "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 f8c5 c1e3 d8f6 c2c3",
    // Queen's Gambit
    "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3 b8d7",
    "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 g1f3 f8e7 c1f4 e8g8 e2e3",
    "d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 e7e6 e2e3 b8d7 f1d3",
    // London System
    "d2d4 d7d5 c1f4 g8f6 e2e3 e7e6 g1f3 f8d6 f4d6 c7d6 f1d3",
    "d2d4 g8f6 c1f4 d7d5 e2e3 e7e6 g1f3 f8d6 f4g3 e8g8",
    "d2d4 d7d5 c1f4 g8f6 e2e3 c7c5 c2c3 b8c6 g1f3 e7e6",
    // English Opening
    "c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5 c4d5 f6d5 f1g2",
    "c2c4 g8f6 b1c3 e7e5 g1f3 b8c6 g2g3 f8b4 f1g2",
    // --- BLACK DEFENSES ---
    // Sicilian Defense
    "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6",
    "e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5 d4b5 d7d6",
    "e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 a7a6 f1d3 g8f6 e1g1",
    // French Defense
    "e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7 e4e5 f6d7 g5e7 d8e7",
    "e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6 g1f3 d8b6",
    "e2e4 e7e6 d2d4 d7d5 b1d2 g8f6 e4e5 f6d7 f1d3 c7c5 c2c3",
    // Caro-Kann Defense
    "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6 h2h4",
    "e2e4 c7c6 d2d4 d7d5 e4e5 c8f5 g1f3 e7e6 f1e2 c6c5",
    // King's Indian Defense
    "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8 f1e2 e7e5",
    "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 f2f3 e8g8 c1e3",
    // Nimzo-Indian
    "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 d1c2 e8g8 a2a3 b4c3 c2c3",
    "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5 g1f3",
    // Queen's Indian
    "d2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8b7 f1g2 f8e7 e1g1 e8g8",
    // Petroff Defense
    "e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5 f1d3",
    // Philidor Defense
    "e2e4 e7e5 g1f3 d7d6 d2d4 g8f6 b1c3 b8d7 f1c4",
  ];

  for (const line of lines) {
    const moves = line.split(' ');
    parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    for (let i = 0; i < moves.length; i++) {
      const key = hashKey;
      if (!openingBook.has(key)) {
        openingBook.set(key, moves[i]);
      }
      if (!applyUciMove(moves[i])) break;
    }
  }
}

// ---- Main ----
buildBook();

const fen = readFileSync(0, 'utf8').trim();
parseFen(fen);

// Check opening book first
const bookMove = openingBook.get(hashKey);
if (bookMove) {
  process.stdout.write(`${bookMove}\n`);
} else {
  const bestMove = search(200);
  process.stdout.write(`${bestMove ? moveToUci(bestMove) : '0000'}\n`);
}
