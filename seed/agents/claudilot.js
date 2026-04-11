import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const FILES = 'abcdefgh';
const PROMOTIONS = ['q', 'r', 'b', 'n'];
const CENTER_BONUS = [
  -3, -2, -1, 0, 0, -1, -2, -3,
  -2, 0, 1, 2, 2, 1, 0, -2,
  -1, 1, 2, 3, 3, 2, 1, -1,
  0, 2, 3, 4, 4, 3, 2, 0,
  0, 2, 3, 4, 4, 3, 2, 0,
  -1, 1, 2, 3, 3, 2, 1, -1,
  -2, 0, 1, 2, 2, 1, 0, -2,
  -3, -2, -1, 0, 0, -1, -2, -3,
];
const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE_SCORE = 1_000_000;
const INF = 1_000_000_000;
/** Target ~250 ms soft stop; hard stays under 1000 ms judge limit. */
const SOFT_TIME_LIMIT_MS = 180;
const HARD_TIME_LIMIT_MS = 700;
const NODE_TIME_CHECK_MASK = 255;
const QSEARCH_MAX_PLY = 5;
/** Safety cap; iterative deepening stops earlier on time or mate. */
const MAX_ITERATIVE_DEPTH = 48;
/** Default off for strict determinism; set `AGENT_TIME_CONTROL=1` to enable time cuts. */
const USE_TIME_CONTROL = process.env.AGENT_TIME_CONTROL === '1';

const tt = new Map();

function hashPosition(pos) {
  let h = 2166136261 >>> 0;
  const b = pos.board;
  for (let i = 0; i < 64; i++) {
    const ch = b[i];
    if (ch !== '.') {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  h ^= pos.side === 'w' ? 0x12345678 : 0x9e3779b9;
  h = Math.imul(h, 16777619) >>> 0;
  const c = pos.castling;
  for (let i = 0; i < c.length; i++) {
    h ^= c.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const ep = pos.enPassant;
  if (ep !== '-') {
    h ^= ep.charCodeAt(0) * 31 + ep.charCodeAt(1);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function getTTMove(hash) {
  const e = tt.get(hash);
  return e ? e.mv : null;
}

function setTTMove(hash, depth, move) {
  if (!move) return;
  const uci = moveToUci(move);
  const old = tt.get(hash);
  if (!old || old.d <= depth) tt.set(hash, { d: depth, mv: uci });
  if (tt.size > 120_000) tt.clear();
}

/** FIDE-style trivial draws (no pawns / heavy pieces). */
function isMaterialDraw(pos) {
  const b = pos.board;
  const pieces = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (p === '.' || p.toLowerCase() === 'k') continue;
    pieces.push({ i, p });
  }
  if (pieces.length === 0) return true;
  if (pieces.length === 1) {
    const t = pieces[0].p.toLowerCase();
    return t === 'n' || t === 'b';
  }
  if (pieces.length === 2 && pieces[0].p.toLowerCase() === 'b' && pieces[1].p.toLowerCase() === 'b') {
    const sq = (idx) => (Math.floor(idx / 8) + (idx % 8)) % 2;
    return sq(pieces[0].i) === sq(pieces[1].i);
  }
  return false;
}

const SQUARES = Array.from({ length: 64 }, (_, idx) => {
  const rank = Math.floor(idx / 8);
  const file = idx % 8;
  return `${FILES[file]}${8 - rank}`;
});
const SQUARE_TO_INDEX = Object.fromEntries(SQUARES.map((sq, idx) => [sq, idx]));

function squareToIndex(square) {
  return SQUARE_TO_INDEX[square];
}

function indexToSquare(index) {
  return SQUARES[index];
}

function createMove(from, to, promotion = '') {
  return { from, to, promotion, uci: `${from}${to}${promotion}` };
}

function colorOf(piece) {
  if (!piece || piece === '.') return null;
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

function opposite(side) {
  return side === 'w' ? 'b' : 'w';
}

function isCapturableTarget(targetPiece, side) {
  return Boolean(targetPiece) && targetPiece !== '.' && colorOf(targetPiece) !== side && targetPiece.toLowerCase() !== 'k';
}

function cloneBoard(board) {
  return board.slice();
}

function parseFen(fen) {
  const [placement, side, castling, ep, halfmove, fullmove] = fen.trim().split(/\s+/);
  const board = [];
  for (const row of placement.split('/')) {
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') board.push(...'.'.repeat(Number(ch)));
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

  for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
    const r = tr + dr;
    const c = tc + dc;
    if (!inBounds(r, c)) continue;
    const p = pos.board[r * 8 + c];
    if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'n') return true;
  }

  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    let r = tr + dr;
    let c = tc + dc;
    while (inBounds(r, c)) {
      const p = pos.board[r * 8 + c];
      if (p !== '.') {
        if (colorOf(p) === by && (p.toLowerCase() === 'b' || p.toLowerCase() === 'q')) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    let r = tr + dr;
    let c = tc + dc;
    while (inBounds(r, c)) {
      const p = pos.board[r * 8 + c];
      if (p !== '.') {
        if (colorOf(p) === by && (p.toLowerCase() === 'r' || p.toLowerCase() === 'q')) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = tr + dr;
      const c = tc + dc;
      if (!inBounds(r, c)) continue;
      const p = pos.board[r * 8 + c];
      if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'k') return true;
    }
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

  if (isValidEnPassantCapture(pos, from, to)) {
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

function pseudoLegalMoves(pos) {
  const moves = [];
  const side = pos.side;

  for (let i = 0; i < 64; i++) {
    const piece = pos.board[i];
    if (piece === '.' || colorOf(piece) !== side) continue;

    const fromSq = indexToSquare(i);
    const r = Math.floor(i / 8);
    const c = i % 8;
    const lower = piece.toLowerCase();

    if (lower === 'p') {
      const dir = side === 'w' ? -1 : 1;
      const startRank = side === 'w' ? 6 : 1;
      const promoRank = side === 'w' ? 0 : 7;

      const oneR = r + dir;
      if (inBounds(oneR, c) && pos.board[oneR * 8 + c] === '.') {
        const to = oneR * 8 + c;
        const toSq = indexToSquare(to);
        if (oneR === promoRank) {
          for (const p of PROMOTIONS) moves.push(createMove(fromSq, toSq, p));
        } else {
          moves.push(createMove(fromSq, toSq));
        }
        const twoR = r + dir * 2;
        if (r === startRank && inBounds(twoR, c) && pos.board[twoR * 8 + c] === '.') {
          moves.push(createMove(fromSq, indexToSquare(twoR * 8 + c)));
        }
      }

      for (const dc of [-1, 1]) {
        const nr = r + dir;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const to = nr * 8 + nc;
        const target = pos.board[to];
        const toSq = indexToSquare(to);
        if (isValidEnPassantCapture(pos, i, to) || isCapturableTarget(target, side)) {
          if (nr === promoRank) {
            for (const p of PROMOTIONS) moves.push(createMove(fromSq, toSq, p));
          } else {
            moves.push(createMove(fromSq, toSq));
          }
        }
      }
      continue;
    }

    const addSlides = (dirs) => {
      for (const [dr, dc] of dirs) {
        let nr = r + dr;
        let nc = c + dc;
        while (inBounds(nr, nc)) {
          const target = pos.board[nr * 8 + nc];
          const toSq = indexToSquare(nr * 8 + nc);
          if (target === '.') {
            moves.push(createMove(fromSq, toSq));
          } else {
            if (isCapturableTarget(target, side)) moves.push(createMove(fromSq, toSq));
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    };

    if (lower === 'n') {
      for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const target = pos.board[nr * 8 + nc];
        if (target === '.' || isCapturableTarget(target, side)) {
          moves.push(createMove(fromSq, indexToSquare(nr * 8 + nc)));
        }
      }
    } else if (lower === 'b') {
      addSlides([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
    } else if (lower === 'r') {
      addSlides([[-1, 0], [1, 0], [0, -1], [0, 1]]);
    } else if (lower === 'q') {
      addSlides([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]);
    } else if (lower === 'k') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          const target = pos.board[nr * 8 + nc];
          if (target === '.' || isCapturableTarget(target, side)) {
            moves.push(createMove(fromSq, indexToSquare(nr * 8 + nc)));
          }
        }
      }
      if (canCastle(pos, side, 'king')) moves.push(createMove(fromSq, side === 'w' ? 'g1' : 'g8'));
      if (canCastle(pos, side, 'queen')) moves.push(createMove(fromSq, side === 'w' ? 'c1' : 'c8'));
    }
  }

  return moves;
}

function legalMoves(pos) {
  return pseudoLegalMoves(pos).filter((m) => !isKingInCheck(applyMove(pos, m), pos.side));
}

function moveToUci(move) {
  return move.uci || `${move.from}${move.to}${move.promotion || ''}`;
}

function evaluate(pos) {
  let score = 0;
  let nonPawnMaterial = 0;

  for (let i = 0; i < 64; i++) {
    const piece = pos.board[i];
    if (piece === '.') continue;
    const lower = piece.toLowerCase();
    if (lower !== 'p' && lower !== 'k') nonPawnMaterial += PIECE_VALUE[lower];
  }

  const endgame = nonPawnMaterial <= 2600;

  for (let i = 0; i < 64; i++) {
    const piece = pos.board[i];
    if (piece === '.') continue;
    const side = colorOf(piece);
    const sign = side === 'w' ? 1 : -1;
    const lower = piece.toLowerCase();
    const r = Math.floor(i / 8);
    const c = i % 8;

    let value = PIECE_VALUE[lower];
    const center = CENTER_BONUS[i];

    if (lower === 'p') {
      const adv = side === 'w' ? (6 - r) : (r - 1);
      value += adv * 7 + center * 2;
    } else if (lower === 'n') {
      value += center * 12;
    } else if (lower === 'b') {
      value += center * 8;
    } else if (lower === 'r') {
      value += center * 3;
    } else if (lower === 'q') {
      value += center * 2;
    } else if (lower === 'k') {
      value += endgame ? center * 10 : -center * 8;

      if (!endgame) {
        const fwd = side === 'w' ? r - 1 : r + 1;
        let shield = 0;
        for (const dc of [-1, 0, 1]) {
          const fc = c + dc;
          if (!inBounds(fwd, fc)) continue;
          const p = pos.board[fwd * 8 + fc];
          if (p !== '.' && colorOf(p) === side && p.toLowerCase() === 'p') shield += 6;
        }
        value += shield;
      }
    }

    score += sign * value;
  }

  if (pos.castling.includes('K') || pos.castling.includes('Q')) score += 18;
  if (pos.castling.includes('k') || pos.castling.includes('q')) score -= 18;

  let whiteBishops = 0;
  let blackBishops = 0;
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (p === 'B') whiteBishops++;
    if (p === 'b') blackBishops++;
  }
  if (whiteBishops >= 2) score += 25;
  if (blackBishops >= 2) score -= 25;

  return pos.side === 'w' ? score : -score;
}

function sameMove(a, b) {
  if (!a || !b) return false;
  return a.from === b.from && a.to === b.to && (a.promotion || '') === (b.promotion || '');
}

function moveOrderingScore(pos, move, pvMove, ttMoveUci) {
  const uci = moveToUci(move);
  if (pvMove && sameMove(move, pvMove)) return 1_000_000_000;
  if (ttMoveUci && uci === ttMoveUci) return 500_000_000;

  const from = squareToIndex(move.from);
  const to = squareToIndex(move.to);
  const piece = pos.board[from].toLowerCase();
  let target = pos.board[to];
  let score = 0;

  if (piece === 'p' && isValidEnPassantCapture(pos, from, to)) {
    target = pos.side === 'w' ? 'p' : 'P';
  }

  if (target !== '.') {
    score += 10_000 + PIECE_VALUE[target.toLowerCase()] - PIECE_VALUE[piece];
  }
  if (move.promotion) {
    score += 9_000 + PIECE_VALUE[move.promotion];
  }
  if (piece === 'k' && Math.abs(to - from) === 2) {
    score += 400;
  }

  return score;
}

function orderMoves(pos, moves, pvMove, ttMoveUci) {
  return moves
    .map((move) => ({
      move,
      score: moveOrderingScore(pos, move, pvMove, ttMoveUci),
      uci: moveToUci(move),
    }))
    .sort((a, b) => b.score - a.score || (a.uci < b.uci ? -1 : (a.uci > b.uci ? 1 : 0)))
    .map((x) => x.move);
}

function createSearchContext(useTimeControl = true) {
  const start = performance.now();
  const softBudget = Math.min(SOFT_TIME_LIMIT_MS, HARD_TIME_LIMIT_MS - 5);
  return {
    useTimeControl,
    nodes: 0,
    abort: false,
    softExpired: false,
    hardExpired: false,
    softDeadline: start + softBudget,
    hardDeadline: start + HARD_TIME_LIMIT_MS,
  };
}

function shouldAbort(ctx, force = false) {
  if (!ctx.useTimeControl) return false;
  if (ctx.abort) return true;
  if (force && ctx.softExpired) return true;
  const now = performance.now();
  if (now >= ctx.hardDeadline) {
    ctx.hardExpired = true;
    ctx.abort = true;
    return true;
  }
  if (!force && (ctx.nodes & NODE_TIME_CHECK_MASK) !== 0) return false;
  if (now >= ctx.softDeadline) {
    ctx.softExpired = true;
    return false;
  }
  return false;
}

function isValidEnPassantCapture(pos, from, to) {
  const piece = pos.board[from];
  if (piece === '.' || piece.toLowerCase() !== 'p') return false;
  if (indexToSquare(to) !== pos.enPassant) return false;
  if (pos.board[to] !== '.') return false;
  const captureIdx = to + (pos.side === 'w' ? 8 : -8);
  if (captureIdx < 0 || captureIdx >= 64) return false;
  const captured = pos.board[captureIdx];
  return captured !== '.' && colorOf(captured) !== pos.side && captured.toLowerCase() === 'p';
}

function isEnPassantCapture(pos, move) {
  const from = squareToIndex(move.from);
  const to = squareToIndex(move.to);
  return isValidEnPassantCapture(pos, from, to);
}

function isCaptureMove(pos, move) {
  const to = squareToIndex(move.to);
  return pos.board[to] !== '.' || isEnPassantCapture(pos, move);
}

function isTacticalMove(pos, move) {
  return Boolean(move.promotion) || isCaptureMove(pos, move);
}

function qsearch(pos, alpha, beta, ply, qply, ctx) {
  if (pos.halfmove >= 100) return 0;

  ctx.nodes++;
  if (shouldAbort(ctx)) return 0;

  const inCheck = isKingInCheck(pos, pos.side);
  const qHash = hashPosition(pos);
  const qTt = getTTMove(qHash);

  if (qply >= QSEARCH_MAX_PLY) {
    if (!inCheck) return evaluate(pos);

    const evasions = legalMoves(pos);
    if (!evasions.length) return -MATE_SCORE + ply;
    const ordered = orderMoves(pos, evasions, null, qTt);

    let best = -INF;
    for (const move of ordered) {
      const score = -evaluate(applyMove(pos, move));
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  if (!inCheck) {
    const standPat = evaluate(pos);
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;

    const allMoves = legalMoves(pos);
    let moves = allMoves.filter((move) => isTacticalMove(pos, move));
    if (!moves.length) {
      if (!allMoves.length) return 0;
      return alpha;
    }

    moves = orderMoves(pos, moves, null, qTt);
    for (const move of moves) {
      const next = applyMove(pos, move);
      const score = -qsearch(next, -beta, -alpha, ply + 1, qply + 1, ctx);
      if (ctx.abort) return 0;
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  let moves = legalMoves(pos);
  if (!moves.length) return -MATE_SCORE + ply;
  moves = orderMoves(pos, moves, null, qTt);

  let best = -INF;
  for (const move of moves) {
    const next = applyMove(pos, move);
    const score = -qsearch(next, -beta, -alpha, ply + 1, qply + 1, ctx);
    if (ctx.abort) return 0;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  return best;
}

function negamax(pos, depth, alpha, beta, ply, ctx) {
  if (pos.halfmove >= 100) return 0;

  const hash = hashPosition(pos);
  const ttMoveUci = getTTMove(hash);

  ctx.nodes++;
  if (shouldAbort(ctx)) return 0;

  if (depth <= 0) {
    return qsearch(pos, alpha, beta, ply, 0, ctx);
  }

  let moves = legalMoves(pos);
  if (!moves.length) {
    return isKingInCheck(pos, pos.side) ? -MATE_SCORE + ply : 0;
  }

  moves = orderMoves(pos, moves, null, ttMoveUci);

  let best = -INF;
  let bestMove = moves[0];
  for (const move of moves) {
    const next = applyMove(pos, move);
    const score = -negamax(next, depth - 1, -beta, -alpha, ply + 1, ctx);
    if (ctx.abort) return 0;
    if (score > best) {
      best = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  if (!ctx.abort && depth >= 1) setTTMove(hash, depth, bestMove);
  return best;
}

function searchRoot(pos, depth, pvMove, ctx) {
  if (shouldAbort(ctx, true)) {
    return { move: null, score: 0, completed: false };
  }

  let moves = legalMoves(pos);
  if (!moves.length) {
    return {
      move: null,
      score: isKingInCheck(pos, pos.side) ? -MATE_SCORE : 0,
      completed: true,
    };
  }

  const rootHash = hashPosition(pos);
  const ttMoveUci = getTTMove(rootHash);
  moves = orderMoves(pos, moves, pvMove, ttMoveUci);

  let bestMove = moves[0];
  let bestScore = -INF;
  let alpha = -INF;
  const beta = INF;

  for (const move of moves) {
    if (shouldAbort(ctx, true)) {
      return { move: bestMove, score: bestScore, completed: false };
    }
    const next = applyMove(pos, move);
    const score = -negamax(next, depth - 1, -beta, -alpha, 1, ctx);
    if (ctx.abort) {
      return { move: bestMove, score: bestScore, completed: false };
    }
    if (score > bestScore || (score === bestScore && moveToUci(move) < moveToUci(bestMove))) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
  }

  if (!ctx.abort) setTTMove(rootHash, depth, bestMove);
  return { move: bestMove, score: bestScore, completed: true };
}

function chooseDepthForFixedSearch(pos, legalCount) {
  let pieces = 0;
  for (const p of pos.board) if (p !== '.') pieces++;
  if (pieces <= 7 && legalCount <= 10) return 4;
  if (pieces <= 11 && legalCount <= 16) return 3;
  return 2;
}

function pickMove(pos) {
  const legal = legalMoves(pos);
  if (!legal.length) return null;
  if (legal.length === 1) return legal[0];

  let best = legal
    .slice()
    .sort((a, b) => (moveToUci(a) < moveToUci(b) ? -1 : (moveToUci(a) > moveToUci(b) ? 1 : 0)))[0];
  let pvMove = best;
  tt.clear();
  const ctx = createSearchContext(USE_TIME_CONTROL);
  const maxDepth = USE_TIME_CONTROL ? MAX_ITERATIVE_DEPTH : chooseDepthForFixedSearch(pos, legal.length);

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (shouldAbort(ctx, true)) break;
    const { move, score, completed } = searchRoot(pos, depth, pvMove, ctx);
    if (!completed) break;
    if (move) {
      best = move;
      pvMove = move;
    }
    if (Math.abs(score) >= MATE_SCORE - 1000) break;
  }

  return best;
}

const fen = readFileSync(0, 'utf8').trim();
const pos = parseFen(fen);
const move = pickMove(pos);
process.stdout.write(`${move ? moveToUci(move) : '0000'}\n`);
