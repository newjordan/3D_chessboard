import { readFileSync } from 'node:fs';

const PIECES = {
  EMPTY: 0,
  W_PAWN: 1, W_KNIGHT: 2, W_BISHOP: 3, W_ROOK: 4, W_QUEEN: 5, W_KING: 6,
  B_PAWN: 7, B_KNIGHT: 8, B_BISHOP: 9, B_ROOK: 10, B_QUEEN: 11, B_KING: 12
};

const PIECE_VALUES = [0, 100, 320, 330, 500, 900, 20000, -100, -320, -330, -500, -900, -20000];

const PAWN_PST = [
    0,  0,  0,  0,  0,  0,  0,  0,
   50, 50, 50, 50, 50, 50, 50, 50,
   10, 10, 20, 30, 30, 20, 10, 10,
    5,  5, 10, 25, 25, 10,  5,  5,
    0,  0,  0, 20, 20,  0,  0,  0,
    5, -5,-10,  0,  0,-10, -5,  5,
    5, 10, 10,-20,-20, 10, 10,  5,
    0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_PST = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];

const KING_MID_PST = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 20,  0,  0, 20, 30, 20
];

const KING_END_PST = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50
];

const PSTS = [
  null, PAWN_PST, KNIGHT_PST, KNIGHT_PST, KNIGHT_PST, KNIGHT_PST, KING_MID_PST,
  PAWN_PST, KNIGHT_PST, KNIGHT_PST, KNIGHT_PST, KNIGHT_PST, KING_MID_PST
];

const FILES = 'abcdefgh';
function indexToSquare(i) { return `${FILES[i & 7]}${8 - (i >> 3)}`; }
function squareToIndex(s) { return (8 - parseInt(s[1])) * 8 + FILES.indexOf(s[0]); }

// --- Zobrist hashing ---
const ZOBRIST = { pieces: Array.from({length: 13}, () => new BigUint64Array(64)), turn: 0n, castling: new BigUint64Array(16), ep: new BigUint64Array(8) };
let seed = 12345n;
function nextRand() { seed = (seed * 6364136223846793005n + 1n); return seed; }
for (let i = 0; i < 13; i++) for (let j = 0; j < 64; j++) ZOBRIST.pieces[i][j] = nextRand();
ZOBRIST.turn = nextRand();
for (let i = 0; i < 16; i++) ZOBRIST.castling[i] = nextRand();
for (let i = 0; i < 8; i++) ZOBRIST.ep[i] = nextRand();

function getHash(pos) {
  let h = 0n;
  for (let i = 0; i < 64; i++) { if (pos.board[i] !== 0) h ^= ZOBRIST.pieces[pos.board[i]][i]; }
  if (pos.turn === 1) h ^= ZOBRIST.turn;
  h ^= ZOBRIST.castling[pos.castling];
  if (pos.epSquare !== -1) h ^= ZOBRIST.ep[pos.epSquare & 7];
  return h;
}

// --- Position ---
function parseFen(fen) {
  const parts = fen.trim().split(/\s+/);
  const board = new Int8Array(64);
  let idx = 0;
  for (const row of parts[0].split('/')) {
    for (const char of row) {
      if (/\d/.test(char)) idx += parseInt(char);
      else {
        const isW = char === char.toUpperCase(), u = char.toUpperCase();
        const t = u === 'P' ? 'PAWN' : u === 'N' ? 'KNIGHT' : u === 'B' ? 'BISHOP' : u === 'R' ? 'ROOK' : u === 'Q' ? 'QUEEN' : 'KING';
        board[idx++] = PIECES[(isW ? 'W_' : 'B_') + t];
      }
    }
  }
  const p = { board, turn: parts[1] === 'b' ? 1 : 0, 
    castling: (parts[2].includes('K') ? 1 : 0) | (parts[2].includes('Q') ? 2 : 0) | (parts[2].includes('k') ? 4 : 0) | (parts[2].includes('q') ? 8 : 0),
    epSquare: parts[3] === '-' ? -1 : squareToIndex(parts[3]), halfmove: parseInt(parts[4] || '0'), fullmove: parseInt(parts[5] || '1') };
  p.hash = getHash(p);
  return p;
}

// --- Moves ---
function isSquareAttacked(board, sq, attackerColor) {
  const r = sq >> 3, c = sq & 7, isW = attackerColor === 0;
  const pDir = isW ? 1 : -1, pawn = isW ? 1 : 7;
  for (const dc of [-1, 1]) {
    const nc = c + dc, nr = r + pDir;
    if (nc >= 0 && nc < 8 && nr >= 0 && nr < 8 && board[(nr << 3) + nc] === pawn) return true;
  }
  const knight = isW ? 2 : 8;
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[(nr << 3) + nc] === knight) return true;
  }
  const b = isW ? 3 : 9, rk = isW ? 4 : 10, q = isW ? 5 : 11;
  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  for (let i = 0; i < 8; i++) {
    const [dr, dc] = dirs[i];
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const tar = board[(nr << 3) + nc];
      if (tar !== 0) { if (i < 4 ? (tar === rk || tar === q) : (tar === b || tar === q)) return true; break; }
      nr += dr; nc += dc;
    }
  }
  const king = isW ? 6 : 12;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[(nr << 3) + nc] === king) return true;
  }
  return false;
}

function generateMoves(p, onlyC = false) {
  const moves = [], turn = p.turn, board = p.board;
  for (let i = 0; i < 64; i++) {
    const pc = board[i]; if (pc === 0 || (turn === 0 ? pc > 6 : pc <= 6)) continue;
    const r = i >> 3, c = i & 7, isW = pc <= 6, type = isW ? pc : pc - 6;
    if (type === 1) {
      const dir = isW ? -1 : 1, start = isW ? 6 : 1, promo = isW ? 0 : 7;
      if (!onlyC) {
        const nr = r + dir;
        if (board[(nr << 3) + c] === 0) {
          if (nr === promo) ['q','r','b','n'].forEach(pr => moves.push({from: i, to: (nr << 3) + c, promotion: pr}));
          else { moves.push({from: i, to: (nr << 3) + c}); if (r === start && board[((r + 2*dir) << 3) + c] === 0) moves.push({from: i, to: ((r + 2*dir) << 3) + c}); }
        }
      }
      for (const dc of [-1, 1]) {
        const nc = c + dc, nr = r + dir;
        if (nc >= 0 && nc < 8 && nr >= 0 && nr < 8) {
          const tar = (nr << 3) + nc, tp = board[tar];
          if (tp !== 0 && (isW ? tp > 6 : tp <= 6)) { if (nr === promo) ['q','r','b','n'].forEach(pr => moves.push({from: i, to: tar, promotion: pr})); else moves.push({from: i, to: tar}); }
          else if (tar === p.epSquare) moves.push({from: i, to: tar});
        }
      }
    } else if (type === 2 || type === 6) {
      const ds = type === 2 ? [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] : [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
      for (const [dr, dc] of ds) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const tar = (nr << 3) + nc, tp = board[tar];
          if (tp === 0) { if (!onlyC) moves.push({from: i, to: tar}); }
          else if (isW ? tp > 6 : tp <= 6) moves.push({from: i, to: tar});
        }
      }
      if (type === 6 && !onlyC) {
        if (isW) {
          if ((p.castling & 1) && board[61] === 0 && board[62] === 0 && !isSquareAttacked(board, 60, 1) && !isSquareAttacked(board, 61, 1) && !isSquareAttacked(board, 62, 1)) moves.push({from: 60, to: 62});
          if ((p.castling & 2) && board[59] === 0 && board[58] === 0 && board[57] === 0 && !isSquareAttacked(board, 60, 1) && !isSquareAttacked(board, 59, 1) && !isSquareAttacked(board, 58, 1)) moves.push({from: 60, to: 58});
        } else {
          if ((p.castling & 4) && board[5] === 0 && board[6] === 0 && !isSquareAttacked(board, 4, 0) && !isSquareAttacked(board, 5, 0) && !isSquareAttacked(board, 6, 0)) moves.push({from: 4, to: 6});
          if ((p.castling & 8) && board[3] === 0 && board[2] === 0 && board[1] === 0 && !isSquareAttacked(board, 4, 0) && !isSquareAttacked(board, 3, 0) && !isSquareAttacked(board, 2, 0)) moves.push({from: 4, to: 2});
        }
      }
    } else {
      const ds = type === 3 ? [[-1,-1],[-1,1],[1,-1],[1,1]] : type === 4 ? [[-1,0],[1,0],[0,-1],[0,1]] : [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
      for (const [dr, dc] of ds) {
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const tar = (nr << 3) + nc, tp = board[tar];
          if (tp === 0) { if (!onlyC) moves.push({from: i, to: tar}); }
          else { if (isW ? tp > 6 : tp <= 6) moves.push({from: i, to: tar}); break; }
          nr += dr; nc += dc;
        }
      }
    }
  }
  return moves.filter(m => { const s = makeMove(p, m); const c = isKingInCheck(p, turn); unmakeMove(p, m, s); return !c; });
}

function isKingInCheck(p, side) {
  const king = side === 0 ? 6 : 12, sq = p.board.indexOf(king);
  return sq === -1 ? true : isSquareAttacked(p.board, sq, 1 - side);
}

function makeMove(p, m) {
  const b = p.board, f = m.from, t = m.to, pc = b[f], tar = b[t];
  const s = { tar, castling: p.castling, epSquare: p.epSquare, halfmove: p.halfmove, hash: p.hash };
  p.hash ^= ZOBRIST.pieces[pc][f] ^ ZOBRIST.pieces[tar][t] ^ ZOBRIST.castling[p.castling] ^ (p.epSquare === -1 ? 0n : ZOBRIST.ep[p.epSquare & 7]);
  b[t] = m.promotion ? (p.turn === 0 ? PIECES[{q:'W_QUEEN', r:'W_ROOK', b:'W_BISHOP', n:'W_KNIGHT'}[m.promotion]] : PIECES[{q:'B_QUEEN', r:'B_ROOK', b:'B_BISHOP', n:'B_KNIGHT'}[m.promotion]]) : pc;
  b[f] = 0; p.hash ^= ZOBRIST.pieces[b[t]][t];
  if ((pc === 1 || pc === 7) && t === p.epSquare) { const cs = t + (p.turn === 0 ? 8 : -8); s.epCaptured = b[cs]; p.hash ^= ZOBRIST.pieces[s.epCaptured][cs]; b[cs] = 0; }
  if (pc === 6 && Math.abs(t - f) === 2) { 
    if (t === 62) { b[61] = 4; b[63] = 0; p.hash ^= ZOBRIST.pieces[4][61] ^ ZOBRIST.pieces[4][63]; }
    else if (t === 58) { b[59] = 4; b[56] = 0; p.hash ^= ZOBRIST.pieces[4][59] ^ ZOBRIST.pieces[4][56]; }
  } else if (pc === 12 && Math.abs(t - f) === 2) {
    if (t === 6) { b[5] = 10; b[7] = 0; p.hash ^= ZOBRIST.pieces[10][5] ^ ZOBRIST.pieces[10][7]; }
    else if (t === 2) { b[3] = 10; b[0] = 0; p.hash ^= ZOBRIST.pieces[10][3] ^ ZOBRIST.pieces[10][0]; }
  }
  p.castling &= (f === 60 || t === 60) ? ~3 : 255; p.castling &= (f === 63 || t === 63) ? ~1 : 255; p.castling &= (f === 56 || t === 56) ? ~2 : 255;
  p.castling &= (f === 4 || t === 4) ? ~12 : 255; p.castling &= (f === 7 || t === 7) ? ~4 : 255; p.castling &= (f === 0 || t === 0) ? ~8 : 255;
  p.hash ^= ZOBRIST.castling[p.castling];
  p.epSquare = ((pc === 1 || pc === 7) && Math.abs(t - f) === 16) ? (f + t) >> 1 : -1;
  if (p.epSquare !== -1) p.hash ^= ZOBRIST.ep[p.epSquare & 7];
  p.halfmove = (pc === 1 || pc === 7 || tar !== 0) ? 0 : p.halfmove + 1;
  p.turn = 1 - p.turn; p.hash ^= ZOBRIST.turn;
  return s;
}

function unmakeMove(p, m, s) {
  const b = p.board;
  if ((b[m.to] === 1 || b[m.to] === 7) && m.to === s.epSquare) b[m.to + (p.turn === 1 ? 8 : -8)] = s.epCaptured;
  if (b[m.to] === 6 && Math.abs(m.to - m.from) === 2) { if (m.to === 62) { b[61] = 0; b[63] = 4; } else if (m.to === 58) { b[59] = 0; b[56] = 4; } }
  else if (b[m.to] === 12 && Math.abs(m.to - m.from) === 2) { if (m.to === 6) { b[5] = 0; b[7] = 10; } else if (m.to === 2) { b[3] = 0; b[0] = 10; } }
  b[m.from] = m.promotion ? (p.turn === 1 ? 1 : 7) : b[m.to]; b[m.to] = s.tar;
  p.castling = s.castling; p.epSquare = s.epSquare; p.halfmove = s.halfmove; p.turn = 1 - p.turn; p.hash = s.hash;
}

// --- Evaluation ---
function evaluate(p) {
  let score = 0, phase = 0;
  for (let i = 0; i < 64; i++) {
    const pc = p.board[i]; if (pc === 0) continue;
    score += PIECE_VALUES[pc];
    const isW = pc <= 6, type = isW ? pc : pc - 6;
    if (type !== 1 && type !== 6) phase += [0,1,1,2,4][type-1] || 0;
    const r = i >> 3, c = i & 7, pstIdx = isW ? i : ((7-r) << 3) + c;
    let pst = PSTS[pc] || PAWN_PST; if (type === 6) pst = phase < 6 ? KING_END_PST : KING_MID_PST;
    score += (isW ? pst[pstIdx] : -pst[pstIdx]);
  }
  return (p.turn === 0 ? score : -score);
}

// --- Search ---
const TT = new Map(), TT_SIZE = 1000000;
let nodes = 0, startTime = 0, limit = 200, killers = Array.from({length: 100}, () => []);

function quiesce(p, alpha, beta) {
  nodes++; let sp = evaluate(p); if (sp >= beta) return beta; if (alpha < sp) alpha = sp;
  const ms = generateMoves(p, true).sort((a,b) => PIECE_VALUES[p.board[b.to]] - PIECE_VALUES[p.board[a.to]]);
  for (const m of ms) {
    const s = makeMove(p, m); const sc = -quiesce(p, -beta, -alpha); unmakeMove(p, m, s);
    if (sc >= beta) return beta; if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function alphaBeta(p, d, a, b, ply) {
  if ((nodes & 2047) === 0 && Date.now() - startTime > limit) return 0;
  nodes++; if (p.halfmove >= 100) return 0;
  const tt = TT.get(p.hash);
  if (tt && tt.d >= d) {
    if (tt.t === 0) return tt.s;
    if (tt.t === 1 && tt.s <= a) return a;
    if (tt.t === 2 && tt.s >= b) return b;
  }
  if (d <= 0) return quiesce(p, a, b);
  const ms = generateMoves(p);
  if (ms.length === 0) return isKingInCheck(p, p.turn) ? -30000 + ply : 0;

  ms.sort((mvA, mvB) => {
    const isTTA = tt && tt.m && tt.m.f === mvA.from && tt.m.t === mvA.to;
    const isTTB = tt && tt.m && tt.m.f === mvB.from && tt.m.t === mvB.to;
    if (isTTA) return -1; if (isTTB) return 1;
    const valA = (p.board[mvA.to] !== 0 ? 10000 + Math.abs(PIECE_VALUES[p.board[mvA.to]]) : 0) + (killers[ply]?.some(k => k.f === mvA.from && k.t === mvA.to) ? 5000 : 0);
    const valB = (p.board[mvB.to] !== 0 ? 10000 + Math.abs(PIECE_VALUES[p.board[mvB.to]]) : 0) + (killers[ply]?.some(k => k.f === mvB.from && k.t === mvB.to) ? 5000 : 0);
    return valB - valA;
  });

  let bestM = null, bestS = -40000, oldA = a;
  for (const m of ms) {
    const s = makeMove(p, m); const sc = -alphaBeta(p, d-1, -b, -a, ply+1); unmakeMove(p, m, s);
    if (sc > bestS) { bestS = sc; bestM = m; }
    a = Math.max(a, sc);
    if (a >= b) { if (s.tar === 0) { killers[ply] = [{f: m.from, t: m.to}, ...(killers[ply] || [])].slice(0, 2); } break; }
  }
  TT.set(p.hash, { d, s: bestS, t: bestS <= oldA ? 1 : bestS >= b ? 2 : 0, m: bestM ? {f: bestM.from, t: bestM.to} : null });
  return bestS;
}

function solve(p) {
  startTime = Date.now(); nodes = 0; let best = null, legal = generateMoves(p);
  if (legal.length === 0) return null;
  for (let d = 1; d <= 12; d++) {
    let a = -40000, b = 40000, curB = null, curS = -40000;
    legal.sort((mvA, mvB) => {
      const tt = TT.get(p.hash);
      const isTTA = tt && tt.m && tt.m.f === mvA.from && tt.m.t === mvA.to;
      const isTTB = tt && tt.m && tt.m.f === mvB.from && tt.m.t === mvB.to;
      if (isTTA) return -1; if (isTTB) return 1;
      return (p.board[mvB.to] !== 0 ? 1000 : 0) - (p.board[mvA.to] !== 0 ? 1000 : 0);
    });
    for (const m of legal) {
      const s = makeMove(p, m); const sc = -alphaBeta(p, d-1, -b, -a, 1); unmakeMove(p, m, s);
      if (sc > curS) { curS = sc; curB = m; }
      a = Math.max(a, sc); if (Date.now() - startTime > limit) break;
    }
    if (Date.now() - startTime <= limit) best = curB; else break;
  }
  return best || legal[0];
}

const data = readFileSync(0, 'utf8').trim();
if (data) {
  const p = parseFen(data); const m = solve(p);
  if (m) process.stdout.write(`${indexToSquare(m.from)}${indexToSquare(m.to)}${m.promotion||''}\n`);
  else process.stdout.write("0000\n");
}
