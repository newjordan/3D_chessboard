import { readFileSync } from 'node:fs';

// ---- Constants ----
const EMPTY = 0;
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const WHITE = 0, BLACK = 8;

const PIECE_TYPE = (p) => p & 7;

// 0x88 square helpers
const SQ = (rank, file) => (rank << 4) | file;
const RANK = (sq) => sq >> 4;
const FILE = (sq) => sq & 0x0F;
const ON_BOARD = (sq) => (sq & 0x88) === 0;

// Algebraic conversion
const FILES_STR = 'abcdefgh';
const sqToAlg = (sq) => FILES_STR[FILE(sq)] + (8 - RANK(sq));
const algToSq = (s) => SQ(8 - Number(s[1]), FILES_STR.indexOf(s[0]));

// Castling flags
const C_WK = 1, C_WQ = 2, C_BK = 4, C_BQ = 8;

// Material values (centipawns)
const PIECE_VAL = [0, 100, 320, 330, 500, 900, 20000];

// Move offsets
const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33];
const KING_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17];
const BISHOP_DIRS = [-17, -15, 15, 17];
const ROOK_DIRS = [-16, -1, 1, 16];
const QUEEN_DIRS = [-17, -16, -15, -1, 1, 15, 16, 17];

// ---- Zobrist Hashing ----
function xorshift32(state) {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

let rngState = 1070372;
function nextRandom() {
  rngState = xorshift32(rngState);
  return rngState;
}

const zobristPiece = new Array(15);
for (let p = 1; p <= 14; p++) {
  zobristPiece[p] = new Uint32Array(128);
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    zobristPiece[p][SQ(r, f)] = nextRandom();
  }
}
const zobristSide = nextRandom();
const zobristCastling = new Uint32Array(16);
for (let i = 0; i < 16; i++) zobristCastling[i] = nextRandom();
const zobristEP = new Uint32Array(8);
for (let i = 0; i < 8; i++) zobristEP[i] = nextRandom();

// ---- Board State (global, mutable) ----
const board = new Int8Array(128);
const pieceList = [
  [[], [], [], [], [], [], []], // white: [0]=unused, [1]=pawns, ..., [6]=king
  [[], [], [], [], [], [], []], // black: same
];
let side = 0;
let castling = 0;
let enPassant = -1;
let halfmove = 0;
let fullmove = 1;
let posHash = 0;

const historyStack = [];

// Position history for repetition detection
const positionHistory = new Map();

function resetBoard() {
  board.fill(EMPTY);
  for (let c = 0; c < 2; c++) for (let t = 0; t < 7; t++) pieceList[c][t] = [];
  side = 0; castling = 0; enPassant = -1; halfmove = 0; fullmove = 1; posHash = 0;
  historyStack.length = 0;
  positionHistory.clear();
}

function addPiece(sq, piece) {
  board[sq] = piece;
  pieceList[piece >> 3][piece & 7].push(sq);
}

function parseFen(fen) {
  resetBoard();
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split('/');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') { f += Number(ch); continue; }
      const color = ch === ch.toUpperCase() ? WHITE : BLACK;
      const typeMap = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };
      const type = typeMap[ch.toLowerCase()];
      addPiece(SQ(r, f), color | type);
      f++;
    }
  }
  side = parts[1] === 'b' ? 1 : 0;
  castling = 0;
  if (parts[2] && parts[2] !== '-') {
    if (parts[2].includes('K')) castling |= C_WK;
    if (parts[2].includes('Q')) castling |= C_WQ;
    if (parts[2].includes('k')) castling |= C_BK;
    if (parts[2].includes('q')) castling |= C_BQ;
  }
  enPassant = (parts[3] && parts[3] !== '-') ? algToSq(parts[3]) : -1;
  halfmove = Number(parts[4] || 0);
  fullmove = Number(parts[5] || 1);

  // Compute initial Zobrist hash
  posHash = 0;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = SQ(r, f);
    if (board[sq] !== EMPTY) posHash ^= zobristPiece[board[sq]][sq];
  }
  if (side === 1) posHash ^= zobristSide;
  posHash ^= zobristCastling[castling];
  if (enPassant !== -1) posHash ^= zobristEP[FILE(enPassant)];
}

// ---- Attack Detection ----
function isSquareAttacked(sq, bySide) {
  const byColor = bySide << 3;

  // Pawn attacks
  const pawnDir = bySide === 0 ? 1 : -1;
  const pLeft = sq + (pawnDir * 16) - 1;
  const pRight = sq + (pawnDir * 16) + 1;
  if (ON_BOARD(pLeft) && board[pLeft] === (byColor | PAWN)) return true;
  if (ON_BOARD(pRight) && board[pRight] === (byColor | PAWN)) return true;

  // Knight attacks
  for (let i = 0; i < 8; i++) {
    const t = sq + KNIGHT_OFFSETS[i];
    if (ON_BOARD(t) && board[t] === (byColor | KNIGHT)) return true;
  }

  // King attacks
  for (let i = 0; i < 8; i++) {
    const t = sq + KING_OFFSETS[i];
    if (ON_BOARD(t) && board[t] === (byColor | KING)) return true;
  }

  // Bishop/Queen diagonal attacks
  for (let d = 0; d < 4; d++) {
    let t = sq + BISHOP_DIRS[d];
    while (ON_BOARD(t)) {
      const p = board[t];
      if (p !== EMPTY) {
        if (p === (byColor | BISHOP) || p === (byColor | QUEEN)) return true;
        break;
      }
      t += BISHOP_DIRS[d];
    }
  }

  // Rook/Queen orthogonal attacks
  for (let d = 0; d < 4; d++) {
    let t = sq + ROOK_DIRS[d];
    while (ON_BOARD(t)) {
      const p = board[t];
      if (p !== EMPTY) {
        if (p === (byColor | ROOK) || p === (byColor | QUEEN)) return true;
        break;
      }
      t += ROOK_DIRS[d];
    }
  }

  return false;
}

function isInCheck(sideToCheck) {
  const kingList = pieceList[sideToCheck][KING];
  if (kingList.length === 0) return true;
  return isSquareAttacked(kingList[0], sideToCheck ^ 1);
}

// ---- Move Encoding ----
const MF_QUIET = 0;
const MF_CAPTURE = 1;
const MF_DOUBLE_PAWN = 2;
const MF_EP_CAPTURE = 3;
const MF_CASTLE_K = 4;
const MF_CASTLE_Q = 5;
const MF_PROMO_N = 6;
const MF_PROMO_B = 7;
const MF_PROMO_R = 8;
const MF_PROMO_Q = 9;
const MF_PROMO_CAP_N = 10;
const MF_PROMO_CAP_B = 11;
const MF_PROMO_CAP_R = 12;
const MF_PROMO_CAP_Q = 13;

function encodeMove(from, to, flag, captured) {
  return from | (to << 7) | (flag << 14) | (captured << 18);
}

function moveFrom(m) { return m & 0x7F; }
function moveTo(m) { return (m >> 7) & 0x7F; }
function moveFlag(m) { return (m >> 14) & 0xF; }
function moveCaptured(m) { return (m >> 18) & 0xF; }

function moveToUci(m) {
  let uci = sqToAlg(moveFrom(m)) + sqToAlg(moveTo(m));
  const flag = moveFlag(m);
  if (flag >= MF_PROMO_N && flag <= MF_PROMO_CAP_Q) {
    const promoTypes = { [MF_PROMO_N]: 'n', [MF_PROMO_B]: 'b', [MF_PROMO_R]: 'r', [MF_PROMO_Q]: 'q',
                         [MF_PROMO_CAP_N]: 'n', [MF_PROMO_CAP_B]: 'b', [MF_PROMO_CAP_R]: 'r', [MF_PROMO_CAP_Q]: 'q' };
    uci += promoTypes[flag];
  }
  return uci;
}

// ---- Make / Unmake ----
function removePiece(sq) {
  const p = board[sq];
  if (p === EMPTY) return;
  posHash ^= zobristPiece[p][sq];
  const list = pieceList[p >> 3][p & 7];
  const idx = list.indexOf(sq);
  if (idx !== -1) { list[idx] = list[list.length - 1]; list.pop(); }
  board[sq] = EMPTY;
}

function putPiece(sq, piece) {
  board[sq] = piece;
  pieceList[piece >> 3][piece & 7].push(sq);
  posHash ^= zobristPiece[piece][sq];
}

function movePiece(from, to) {
  const p = board[from];
  posHash ^= zobristPiece[p][from];
  posHash ^= zobristPiece[p][to];
  const list = pieceList[p >> 3][p & 7];
  const idx = list.indexOf(from);
  list[idx] = to;
  board[to] = p;
  board[from] = EMPTY;
}

function makeMove(m) {
  const from = moveFrom(m);
  const to = moveTo(m);
  const flag = moveFlag(m);
  const captured = board[to];

  historyStack.push({ m, castling, enPassant, halfmove, posHash, captured });

  // Track position for repetition detection
  const prevCount = positionHistory.get(posHash) || 0;
  positionHistory.set(posHash, prevCount + 1);

  // Remove old castling and EP from hash
  posHash ^= zobristCastling[castling];
  if (enPassant !== -1) posHash ^= zobristEP[FILE(enPassant)];

  halfmove++;

  // Handle captures (not EP)
  if (captured !== EMPTY && flag !== MF_EP_CAPTURE) {
    removePiece(to);
    halfmove = 0;
  }

  const piece = board[from];
  const pt = piece & 7;

  if (pt === PAWN) halfmove = 0;

  // En passant capture
  if (flag === MF_EP_CAPTURE) {
    const epPawnSq = side === 0 ? to + 16 : to - 16;
    removePiece(epPawnSq);
    halfmove = 0;
  }

  movePiece(from, to);

  // Double pawn push
  if (flag === MF_DOUBLE_PAWN) {
    enPassant = side === 0 ? from - 16 : from + 16;
  } else {
    enPassant = -1;
  }

  // Castling rook move
  if (flag === MF_CASTLE_K) {
    if (side === 0) movePiece(SQ(7, 7), SQ(7, 5));
    else movePiece(SQ(0, 7), SQ(0, 5));
  } else if (flag === MF_CASTLE_Q) {
    if (side === 0) movePiece(SQ(7, 0), SQ(7, 3));
    else movePiece(SQ(0, 0), SQ(0, 3));
  }

  // Promotions
  if (flag >= MF_PROMO_N) {
    const promoMap = {
      [MF_PROMO_N]: KNIGHT, [MF_PROMO_B]: BISHOP, [MF_PROMO_R]: ROOK, [MF_PROMO_Q]: QUEEN,
      [MF_PROMO_CAP_N]: KNIGHT, [MF_PROMO_CAP_B]: BISHOP, [MF_PROMO_CAP_R]: ROOK, [MF_PROMO_CAP_Q]: QUEEN,
    };
    removePiece(to);
    putPiece(to, (side << 3) | promoMap[flag]);
  }

  // Update castling rights
  if (pt === KING) {
    if (side === 0) castling &= ~(C_WK | C_WQ);
    else castling &= ~(C_BK | C_BQ);
  }
  if (pt === ROOK) {
    if (from === SQ(7, 0)) castling &= ~C_WQ;
    if (from === SQ(7, 7)) castling &= ~C_WK;
    if (from === SQ(0, 0)) castling &= ~C_BQ;
    if (from === SQ(0, 7)) castling &= ~C_BK;
  }
  if (to === SQ(7, 0)) castling &= ~C_WQ;
  if (to === SQ(7, 7)) castling &= ~C_WK;
  if (to === SQ(0, 0)) castling &= ~C_BQ;
  if (to === SQ(0, 7)) castling &= ~C_BK;

  // Add new castling and EP to hash, flip side
  posHash ^= zobristCastling[castling];
  if (enPassant !== -1) posHash ^= zobristEP[FILE(enPassant)];
  posHash ^= zobristSide;

  side ^= 1;
  if (side === 0) fullmove++;
}

function unmakeMove() {
  const entry = historyStack.pop();
  const m = entry.m;
  const from = moveFrom(m);
  const to = moveTo(m);
  const flag = moveFlag(m);

  side ^= 1;
  if (side === 0) fullmove--;

  // Undo promotion
  if (flag >= MF_PROMO_N) {
    removePiece(to);
    putPiece(to, (side << 3) | PAWN);
  }

  movePiece(to, from);

  // Undo castling rook
  if (flag === MF_CASTLE_K) {
    if (side === 0) movePiece(SQ(7, 5), SQ(7, 7));
    else movePiece(SQ(0, 5), SQ(0, 7));
  } else if (flag === MF_CASTLE_Q) {
    if (side === 0) movePiece(SQ(7, 3), SQ(7, 0));
    else movePiece(SQ(0, 3), SQ(0, 0));
  }

  // Restore captured piece
  if (flag === MF_EP_CAPTURE) {
    const epPawnSq = side === 0 ? to + 16 : to - 16;
    putPiece(epPawnSq, ((side ^ 1) << 3) | PAWN);
  } else if (entry.captured !== EMPTY) {
    putPiece(to, entry.captured);
  }

  castling = entry.castling;
  enPassant = entry.enPassant;
  halfmove = entry.halfmove;

  // Restore position history count
  const curCount = positionHistory.get(entry.posHash) || 1;
  if (curCount <= 1) positionHistory.delete(entry.posHash);
  else positionHistory.set(entry.posHash, curCount - 1);

  posHash = entry.posHash;
}

// ---- Move Generation ----
function generateMoves(moves, startIdx) {
  let idx = startIdx;
  const us = side;
  const them = us ^ 1;
  const themColor = them << 3;

  // Pawns
  const pawns = pieceList[us][PAWN];
  const pawnDir = us === 0 ? -16 : 16;
  const startRank = us === 0 ? 6 : 1;
  const promoRank = us === 0 ? 0 : 7;

  for (let pi = 0; pi < pawns.length; pi++) {
    const sq = pawns[pi];
    const oneUp = sq + pawnDir;

    if (ON_BOARD(oneUp) && board[oneUp] === EMPTY) {
      if (RANK(oneUp) === promoRank) {
        moves[idx++] = encodeMove(sq, oneUp, MF_PROMO_Q, 0);
        moves[idx++] = encodeMove(sq, oneUp, MF_PROMO_R, 0);
        moves[idx++] = encodeMove(sq, oneUp, MF_PROMO_B, 0);
        moves[idx++] = encodeMove(sq, oneUp, MF_PROMO_N, 0);
      } else {
        moves[idx++] = encodeMove(sq, oneUp, MF_QUIET, 0);
        if (RANK(sq) === startRank) {
          const twoUp = sq + pawnDir * 2;
          if (board[twoUp] === EMPTY) {
            moves[idx++] = encodeMove(sq, twoUp, MF_DOUBLE_PAWN, 0);
          }
        }
      }
    }

    for (const dc of [-1, 1]) {
      const capSq = sq + pawnDir + dc;
      if (!ON_BOARD(capSq)) continue;

      if (capSq === enPassant) {
        moves[idx++] = encodeMove(sq, capSq, MF_EP_CAPTURE, 0);
      } else if (board[capSq] !== EMPTY && (board[capSq] & 8) === themColor) {
        const cap = board[capSq];
        if (RANK(capSq) === promoRank) {
          moves[idx++] = encodeMove(sq, capSq, MF_PROMO_CAP_Q, cap);
          moves[idx++] = encodeMove(sq, capSq, MF_PROMO_CAP_R, cap);
          moves[idx++] = encodeMove(sq, capSq, MF_PROMO_CAP_B, cap);
          moves[idx++] = encodeMove(sq, capSq, MF_PROMO_CAP_N, cap);
        } else {
          moves[idx++] = encodeMove(sq, capSq, MF_CAPTURE, cap);
        }
      }
    }
  }

  // Knights
  const knights = pieceList[us][KNIGHT];
  for (let pi = 0; pi < knights.length; pi++) {
    const sq = knights[pi];
    for (let i = 0; i < 8; i++) {
      const t = sq + KNIGHT_OFFSETS[i];
      if (!ON_BOARD(t)) continue;
      const target = board[t];
      if (target === EMPTY) moves[idx++] = encodeMove(sq, t, MF_QUIET, 0);
      else if ((target & 8) === themColor) moves[idx++] = encodeMove(sq, t, MF_CAPTURE, target);
    }
  }

  // Sliding pieces
  const slidePieces = [
    [BISHOP, BISHOP_DIRS],
    [ROOK, ROOK_DIRS],
    [QUEEN, QUEEN_DIRS],
  ];

  for (const [pt, dirs] of slidePieces) {
    const pieces = pieceList[us][pt];
    for (let pi = 0; pi < pieces.length; pi++) {
      const sq = pieces[pi];
      for (let d = 0; d < dirs.length; d++) {
        let t = sq + dirs[d];
        while (ON_BOARD(t)) {
          const target = board[t];
          if (target === EMPTY) {
            moves[idx++] = encodeMove(sq, t, MF_QUIET, 0);
          } else {
            if ((target & 8) === themColor) moves[idx++] = encodeMove(sq, t, MF_CAPTURE, target);
            break;
          }
          t += dirs[d];
        }
      }
    }
  }

  // King
  const kings = pieceList[us][KING];
  if (kings.length > 0) {
    const sq = kings[0];
    for (let i = 0; i < 8; i++) {
      const t = sq + KING_OFFSETS[i];
      if (!ON_BOARD(t)) continue;
      const target = board[t];
      if (target === EMPTY) moves[idx++] = encodeMove(sq, t, MF_QUIET, 0);
      else if ((target & 8) === themColor) moves[idx++] = encodeMove(sq, t, MF_CAPTURE, target);
    }

    // Castling
    if (us === 0) {
      if ((castling & C_WK) && board[SQ(7,5)] === EMPTY && board[SQ(7,6)] === EMPTY
          && !isInCheck(0) && !isSquareAttacked(SQ(7,5), 1) && !isSquareAttacked(SQ(7,6), 1)) {
        moves[idx++] = encodeMove(sq, SQ(7, 6), MF_CASTLE_K, 0);
      }
      if ((castling & C_WQ) && board[SQ(7,3)] === EMPTY && board[SQ(7,2)] === EMPTY && board[SQ(7,1)] === EMPTY
          && !isInCheck(0) && !isSquareAttacked(SQ(7,3), 1) && !isSquareAttacked(SQ(7,2), 1)) {
        moves[idx++] = encodeMove(sq, SQ(7, 2), MF_CASTLE_Q, 0);
      }
    } else {
      if ((castling & C_BK) && board[SQ(0,5)] === EMPTY && board[SQ(0,6)] === EMPTY
          && !isInCheck(1) && !isSquareAttacked(SQ(0,5), 0) && !isSquareAttacked(SQ(0,6), 0)) {
        moves[idx++] = encodeMove(sq, SQ(0, 6), MF_CASTLE_K, 0);
      }
      if ((castling & C_BQ) && board[SQ(0,3)] === EMPTY && board[SQ(0,2)] === EMPTY && board[SQ(0,1)] === EMPTY
          && !isInCheck(1) && !isSquareAttacked(SQ(0,3), 0) && !isSquareAttacked(SQ(0,2), 0)) {
        moves[idx++] = encodeMove(sq, SQ(0, 2), MF_CASTLE_Q, 0);
      }
    }
  }

  return idx;
}

const movePool = new Int32Array(256);

function legalMoves() {
  const end = generateMoves(movePool, 0);
  const legal = [];
  for (let i = 0; i < end; i++) {
    makeMove(movePool[i]);
    if (!isInCheck(side ^ 1)) {
      legal.push(movePool[i]);
    }
    unmakeMove();
  }
  return legal;
}

// ---- Piece-Square Tables ----
const sqTo64 = (sq) => RANK(sq) * 8 + FILE(sq);
const mirrorSq64 = (sq64) => (7 - (sq64 >> 3)) * 8 + (sq64 & 7);

const PST_MG = {
  [PAWN]: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  [KNIGHT]: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  [BISHOP]: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  [ROOK]: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  [QUEEN]: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  [KING]: [
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

const PST_EG = {
  [PAWN]: [
     0,  0,  0,  0,  0,  0,  0,  0,
    80, 80, 80, 80, 80, 80, 80, 80,
    50, 50, 50, 50, 50, 50, 50, 50,
    30, 30, 30, 30, 30, 30, 30, 30,
    20, 20, 20, 20, 20, 20, 20, 20,
    10, 10, 10, 10, 10, 10, 10, 10,
     0,  0,  0,  0,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  [KNIGHT]: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  [BISHOP]: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  [ROOK]: [
     0,  0,  0,  0,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  [QUEEN]: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
     -5,  0,  5,  5,  5,  5,  0, -5,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  [KING]: [
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50,
  ],
};

// ---- Evaluation ----
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];
const MAX_PHASE = 24;

function evaluate() {
  let mgScore = 0, egScore = 0;
  let phase = 0;

  for (let color = 0; color < 2; color++) {
    const sign = color === 0 ? 1 : -1;
    for (let pt = PAWN; pt <= KING; pt++) {
      const list = pieceList[color][pt];
      for (let i = 0; i < list.length; i++) {
        const sq64 = sqTo64(list[i]);
        const pstIdx = color === 0 ? sq64 : mirrorSq64(sq64);
        mgScore += sign * (PIECE_VAL[pt] + PST_MG[pt][pstIdx]);
        egScore += sign * (PIECE_VAL[pt] + PST_EG[pt][pstIdx]);
        phase += PHASE_WEIGHT[pt];
      }
    }
  }

  // Bishop pair
  if (pieceList[0][BISHOP].length >= 2) { mgScore += 30; egScore += 50; }
  if (pieceList[1][BISHOP].length >= 2) { mgScore -= 30; egScore -= 50; }

  // Pawn structure
  const pawnFiles = [[0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0]];
  for (let color = 0; color < 2; color++) {
    const pawns = pieceList[color][PAWN];
    for (let i = 0; i < pawns.length; i++) pawnFiles[color][FILE(pawns[i])]++;
  }

  for (let color = 0; color < 2; color++) {
    const sign = color === 0 ? 1 : -1;
    const pawns = pieceList[color][PAWN];
    for (let i = 0; i < pawns.length; i++) {
      const f = FILE(pawns[i]);
      const r = RANK(pawns[i]);
      // Doubled
      if (pawnFiles[color][f] > 1) { mgScore += sign * -15; egScore += sign * -15; }
      // Isolated
      const hasAdj = (f > 0 && pawnFiles[color][f-1] > 0) || (f < 7 && pawnFiles[color][f+1] > 0);
      if (!hasAdj) { mgScore += sign * -20; egScore += sign * -20; }
      // Passed
      let passed = true;
      const dir = color === 0 ? -1 : 1;
      for (let checkR = r + dir; checkR >= 0 && checkR < 8; checkR += dir) {
        for (let df = -1; df <= 1; df++) {
          const cf = f + df;
          if (cf < 0 || cf > 7) continue;
          if (board[SQ(checkR, cf)] === ((color ^ 1) << 3 | PAWN)) { passed = false; break; }
        }
        if (!passed) break;
      }
      if (passed) {
        const advRanks = color === 0 ? (7 - r) : r;
        const bonus = 20 + advRanks * 15;
        mgScore += sign * (bonus >> 1);
        egScore += sign * bonus;
      }
    }
  }

  // King safety - pawn shield
  for (let color = 0; color < 2; color++) {
    const sign = color === 0 ? 1 : -1;
    const kings = pieceList[color][KING];
    if (kings.length === 0) continue;
    const kf = FILE(kings[0]), kr = RANK(kings[0]);
    let shield = 0;
    const shieldDir = color === 0 ? -1 : 1;
    for (let df = -1; df <= 1; df++) {
      const nf = kf + df;
      if (nf < 0 || nf > 7) continue;
      const r1 = kr + shieldDir, r2 = kr + shieldDir * 2;
      if (r1 >= 0 && r1 < 8 && board[SQ(r1, nf)] === (color << 3 | PAWN)) shield += 10;
      if (r2 >= 0 && r2 < 8 && board[SQ(r2, nf)] === (color << 3 | PAWN)) shield += 5;
    }
    mgScore += sign * shield;
  }

  // Endgame: drive enemy king to edge
  if (pieceList[0][QUEEN].length + pieceList[0][ROOK].length > 0 && pieceList[1][PAWN].length === 0) {
    const ek = pieceList[1][KING];
    if (ek.length > 0) {
      const ekf = FILE(ek[0]), ekr = RANK(ek[0]);
      egScore += (Math.abs(ekf - 3.5) + Math.abs(ekr - 3.5)) * 10;
    }
  }
  if (pieceList[1][QUEEN].length + pieceList[1][ROOK].length > 0 && pieceList[0][PAWN].length === 0) {
    const ek = pieceList[0][KING];
    if (ek.length > 0) {
      const ekf = FILE(ek[0]), ekr = RANK(ek[0]);
      egScore -= (Math.abs(ekf - 3.5) + Math.abs(ekr - 3.5)) * 10;
    }
  }

  // Taper
  const p = Math.min(phase, MAX_PHASE);
  let score = (mgScore * p + egScore * (MAX_PHASE - p)) / MAX_PHASE;
  return side === 0 ? score : -score;
}

// ---- Transposition Table ----
const TT_EXACT = 0, TT_ALPHA = 1, TT_BETA = 2;
const TT_SIZE = 1 << 22;
const TT_MASK = TT_SIZE - 1;

const ttHash = new Uint32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttScore = new Int16Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);

function ttProbe(hash, depth, alpha, beta) {
  const idx = hash & TT_MASK;
  if (ttHash[idx] !== hash) return null;
  const entry = { move: ttMove[idx], score: ttScore[idx], depth: ttDepth[idx], flag: ttFlag[idx] };
  if (entry.depth >= depth) {
    if (entry.flag === TT_EXACT) return entry;
    if (entry.flag === TT_ALPHA && entry.score <= alpha) return entry;
    if (entry.flag === TT_BETA && entry.score >= beta) return entry;
  }
  return { move: entry.move, score: null };
}

function ttStore(hash, move, score, depth, flag) {
  const idx = hash & TT_MASK;
  ttHash[idx] = hash;
  ttMove[idx] = move;
  ttScore[idx] = score;
  ttDepth[idx] = depth;
  ttFlag[idx] = flag;
}

// ---- Move Ordering ----
const killers = new Array(64).fill(null).map(() => [0, 0]);
const historyTable = [new Int32Array(128 * 128), new Int32Array(128 * 128)];

function scoreMove(m, ply, ttMoveVal) {
  if (m === ttMoveVal) return 1000000;
  const flag = moveFlag(m);
  if (flag >= MF_PROMO_N) {
    if (flag === MF_PROMO_Q || flag === MF_PROMO_CAP_Q) return 900000;
    return 800000;
  }
  if (flag === MF_CAPTURE || flag === MF_EP_CAPTURE) {
    const victim = flag === MF_EP_CAPTURE ? PAWN : PIECE_TYPE(moveCaptured(m));
    const attacker = PIECE_TYPE(board[moveFrom(m)]);
    return 500000 + victim * 100 - attacker;
  }
  if (killers[ply][0] === m) return 400000;
  if (killers[ply][1] === m) return 399000;
  return historyTable[side][moveFrom(m) * 128 + moveTo(m)];
}

function orderMoves(moves, count, ply, ttMoveVal) {
  const scores = new Int32Array(count);
  for (let i = 0; i < count; i++) scores[i] = scoreMove(moves[i], ply, ttMoveVal);
  for (let i = 1; i < count; i++) {
    const m = moves[i], s = scores[i];
    let j = i - 1;
    while (j >= 0 && scores[j] < s) {
      moves[j + 1] = moves[j]; scores[j + 1] = scores[j]; j--;
    }
    moves[j + 1] = m; scores[j + 1] = s;
  }
}

// ---- Search ----
let nodes = 0;
let searchStart = 0;
let softLimit = 200;
let hardLimit = 900;
let searchAborted = false;

const searchMoves = new Array(64).fill(null).map(() => new Int32Array(256));
const qSearchMoves = new Array(32).fill(null).map(() => new Int32Array(256));
let qPly = 0;

const INF = 999999;
const MATE_SCORE = 100000;

// Contempt: penalize draws to encourage winning play
const CONTEMPT = 25;

function quiescence(alpha, beta) {
  nodes++;
  if ((nodes & 4095) === 0) {
    if (Date.now() - searchStart >= hardLimit) { searchAborted = true; return 0; }
  }

  const standPat = evaluate();
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  const curQPly = qPly++;
  if (curQPly >= 32) { qPly--; return alpha; } // depth limit
  const moves = qSearchMoves[curQPly];
  const end = generateMoves(moves, 0);
  let qCount = 0;
  for (let i = 0; i < end; i++) {
    const flag = moveFlag(moves[i]);
    if (flag === MF_CAPTURE || flag === MF_EP_CAPTURE || flag >= MF_PROMO_N) {
      moves[qCount++] = moves[i];
    }
  }

  orderMoves(moves, qCount, 0, 0);

  for (let i = 0; i < qCount; i++) {
    makeMove(moves[i]);
    if (isInCheck(side ^ 1)) { unmakeMove(); continue; }
    const score = -quiescence(-beta, -alpha);
    unmakeMove();
    if (searchAborted) { qPly--; return 0; }
    if (score >= beta) { qPly--; return beta; }
    if (score > alpha) alpha = score;
  }

  qPly--;
  return alpha;
}

function alphaBeta(depth, alpha, beta, ply, doNull) {
  if (searchAborted) return 0;
  nodes++;
  if ((nodes & 4095) === 0) {
    if (Date.now() - searchStart >= hardLimit) { searchAborted = true; return 0; }
  }

  if (halfmove >= 100) return -CONTEMPT;

  // Repetition detection: if current position has been seen before, it's a draw
  if (ply > 0) {
    const repCount = positionHistory.get(posHash) || 0;
    if (repCount >= 2) return -CONTEMPT; // Would be threefold
    // Even a single repetition should be penalized
    if (repCount >= 1 && halfmove >= 4) return -CONTEMPT;
  }

  if (depth <= 0) return quiescence(alpha, beta);

  const inCheck = isInCheck(side);
  if (inCheck) depth++;

  const isPV = beta - alpha > 1;

  const hash = posHash;
  let ttMoveVal = 0;
  const ttEntry = ttProbe(hash, depth, alpha, beta);
  if (ttEntry) {
    if (ttEntry.score !== null && !isPV) return ttEntry.score;
    ttMoveVal = ttEntry.move;
  }

  // Null-move pruning
  if (doNull && !inCheck && !isPV && depth >= 3) {
    const us = side;
    const hasNonPawn = pieceList[us][KNIGHT].length + pieceList[us][BISHOP].length +
                       pieceList[us][ROOK].length + pieceList[us][QUEEN].length > 0;
    if (hasNonPawn) {
      const oldEP = enPassant;
      const oldHash = posHash;
      enPassant = -1;
      side ^= 1;
      posHash ^= zobristSide;
      if (oldEP !== -1) posHash ^= zobristEP[FILE(oldEP)];

      const R = depth >= 6 ? 3 : 2;
      const score = -alphaBeta(depth - 1 - R, -beta, -beta + 1, ply + 1, false);

      side ^= 1;
      enPassant = oldEP;
      posHash = oldHash;

      if (searchAborted) return 0;
      if (score >= beta) return beta;
    }
  }

  const moves = searchMoves[ply];
  const end = generateMoves(moves, 0);
  orderMoves(moves, end, ply, ttMoveVal);

  let bestScore = -INF;
  let bestMoveFound = 0;
  let legalCount = 0;

  for (let i = 0; i < end; i++) {
    makeMove(moves[i]);
    if (isInCheck(side ^ 1)) { unmakeMove(); continue; }
    legalCount++;

    let score;
    const flag = moveFlag(moves[i]);
    const isCapture = flag === MF_CAPTURE || flag === MF_EP_CAPTURE || flag >= MF_PROMO_N;
    const givesCheck = isInCheck(side);

    if (legalCount > 4 && depth >= 3 && !isCapture && !inCheck && !givesCheck) {
      const reduction = 1 + ((Math.log(depth) * Math.log(legalCount) / 2.5) | 0);
      score = -alphaBeta(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
      if (score > alpha) {
        score = -alphaBeta(depth - 1, -beta, -alpha, ply + 1, true);
      }
    } else if (!isPV && legalCount > 1) {
      score = -alphaBeta(depth - 1, -alpha - 1, -alpha, ply + 1, true);
      if (score > alpha && score < beta) {
        score = -alphaBeta(depth - 1, -beta, -alpha, ply + 1, true);
      }
    } else {
      score = -alphaBeta(depth - 1, -beta, -alpha, ply + 1, true);
    }

    unmakeMove();
    if (searchAborted) return bestScore !== -INF ? bestScore : 0;

    if (score > bestScore) {
      bestScore = score;
      bestMoveFound = moves[i];
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (!isCapture) {
        if (killers[ply][0] !== moves[i]) {
          killers[ply][1] = killers[ply][0];
          killers[ply][0] = moves[i];
        }
        historyTable[side][moveFrom(moves[i]) * 128 + moveTo(moves[i])] += depth * depth;
      }
      ttStore(hash, bestMoveFound, beta, depth, TT_BETA);
      return beta;
    }
  }

  if (legalCount === 0) {
    return inCheck ? -MATE_SCORE + ply : 0;
  }

  const ttFlagStore = bestScore > alpha ? TT_EXACT : TT_ALPHA;
  ttStore(hash, bestMoveFound, bestScore, depth, ttFlagStore);
  return bestScore;
}

// ---- Opening Book ----
const BOOK = {};

function populateBook() {
  const lines = [
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 d2d3',
    'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6',
    'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3',
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3',
    'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4',
    'e2e4 c7c5 g1f3 d7d6 d2d4',
    'e2e4 c7c5 g1f3 b8c6 d2d4',
    'e2e4 c7c5 g1f3',
    'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 e4e5',
    'e2e4 e7e6 d2d4 d7d5 b1c3',
    'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5',
    'e2e4 e7e6 d2d4',
    'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 b8d7',
    'e2e4 c7c6 d2d4 d7d5 b1c3',
    'e2e4 c7c6 d2d4 d7d5 e4e5',
    'e2e4 c7c6 d2d4',
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5',
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6',
    'd2d4 d7d5 c2c4 e7e6 b1c3',
    'd2d4 d7d5 c2c4 e7e6',
    'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3',
    'd2d4 d7d5 c2c4 c7c6',
    'd2d4 d7d5 c2c4',
    'd2d4 d7d5 c1f4 g8f6 e2e3 e7e6 g1f3',
    'd2d4 d7d5 c1f4 g8f6 e2e3',
    'd2d4 d7d5 c1f4',
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3',
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4',
    'd2d4 g8f6 c2c4 e7e6 b1c3',
    'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3',
    'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6',
    'd2d4 g8f6 c2c4 e7e6 g1f3',
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6',
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7',
    'd2d4 g8f6 c2c4 g7g6 b1c3',
    'd2d4 g8f6 c2c4 g7g6',
    'c2c4 e7e5 b1c3 g8f6 g1f3',
    'c2c4 e7e5 b1c3',
    'e2e4',
    'd2d4',
    'c2c4',
    'g1f3',
  ];

  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  for (const line of lines) {
    parseFen(startFen);
    const uciMoves = line.split(' ');
    for (let i = 0; i < uciMoves.length; i++) {
      const hash = posHash;
      const uci = uciMoves[i];
      if (BOOK[hash] === undefined) BOOK[hash] = [];
      if (!BOOK[hash].includes(uci)) BOOK[hash].push(uci);
      const legal = legalMoves();
      const m = legal.find((mv) => moveToUci(mv) === uci);
      if (!m && m !== 0) break;
      makeMove(m);
    }
  }
}

// ---- Best Move (iterative deepening with aspiration windows) ----
function bestMove() {
  // Check opening book
  if (BOOK[posHash] !== undefined) {
    const candidates = BOOK[posHash];
    const uci = candidates[Math.floor(Math.random() * candidates.length)];
    const legal = legalMoves();
    const bookMove = legal.find((m) => moveToUci(m) === uci);
    if (bookMove !== undefined) return bookMove;
  }

  const legal = legalMoves();
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  // Time management
  let totalPhase = 0;
  for (let color = 0; color < 2; color++) {
    for (let pt = KNIGHT; pt <= QUEEN; pt++) {
      totalPhase += pieceList[color][pt].length * PHASE_WEIGHT[pt];
    }
  }

  // Adaptive time management based on game phase and move count
  // With 30s game budget and ~300ms overhead per process spawn,
  // we need to be conservative. Target ~60 moves per side.
  // fullmove tells us how deep into the game we are.
  const movesPlayed = fullmove;
  const estimatedMovesLeft = Math.max(10, 50 - movesPlayed);
  const budgetPerMove = Math.min(250, 25000 / estimatedMovesLeft);

  if (totalPhase >= 16) {
    // Opening/middlegame: slightly more time
    softLimit = Math.min(250, budgetPerMove * 1.2) | 0;
  } else if (totalPhase >= 6) {
    // Late middlegame
    softLimit = Math.min(200, budgetPerMove) | 0;
  } else {
    // Endgame: less time, simpler positions
    softLimit = Math.min(150, budgetPerMove * 0.8) | 0;
  }
  hardLimit = Math.min(900, softLimit * 3) | 0;

  searchStart = Date.now();
  searchAborted = false;
  nodes = 0;

  historyTable[0].fill(0);
  historyTable[1].fill(0);
  for (let i = 0; i < 64; i++) { killers[i][0] = 0; killers[i][1] = 0; }

  let bestMoveResult = legal[0];
  let prevScore = 0;

  for (let depth = 1; depth <= 64; depth++) {
    let score;

    if (depth >= 4) {
      let delta = 50;
      let a = prevScore - delta;
      let b = prevScore + delta;
      while (true) {
        score = alphaBeta(depth, a, b, 0, true);
        if (searchAborted) break;
        if (score <= a) { a -= delta; delta *= 2; }
        else if (score >= b) { b += delta; delta *= 2; }
        else break;
      }
    } else {
      score = alphaBeta(depth, -INF, INF, 0, true);
    }

    if (searchAborted) break;
    prevScore = score;

    const idx = posHash & TT_MASK;
    if (ttHash[idx] === posHash && ttMove[idx] !== 0) {
      bestMoveResult = ttMove[idx];
    }

    if (Date.now() - searchStart >= softLimit) break;
  }

  return bestMoveResult;
}

// ---- Main ----
parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
populateBook();

const fenInput = readFileSync(0, 'utf8').trim();
parseFen(fenInput);
// Record the initial position in history so we can detect repetitions from the FEN
positionHistory.set(posHash, (positionHistory.get(posHash) || 0) + 1);
const move = bestMove();
process.stdout.write((move ? moveToUci(move) : '0000') + '\n');
