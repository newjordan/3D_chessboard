import { readFileSync } from 'node:fs';

// ============================================================
// CONSTANTS
// ============================================================
const FILES = 'abcdefgh';
const INF = 30000;
const MATE = 29000;
const MATE_THRESHOLD = 28000;
const DRAW = 0;
const MAX_PLY = 64;

const PIECE_VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const PHASE_VAL = { p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 };
const TOTAL_PHASE = 24;

// ============================================================
// BOARD UTILITIES
// ============================================================
function sqIdx(sq) { return (8 - Number(sq[1])) * 8 + FILES.indexOf(sq[0]); }
function idxSq(i) { return FILES[i % 8] + (8 - (i >> 3)); }
function colorOf(p) { return (!p || p === '.') ? null : (p === p.toUpperCase() ? 'w' : 'b'); }
function opp(s) { return s === 'w' ? 'b' : 'w'; }
function inB(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function mirror(i) { return (7 - (i >> 3)) * 8 + (i % 8); }

// ============================================================
// PIECE-SQUARE TABLES (PeSTO)
// ============================================================
const MG_PAWN = [0,0,0,0,0,0,0,0,98,134,61,95,68,126,34,-11,-6,7,26,31,65,56,25,-20,-14,13,6,21,23,12,17,-23,-27,-2,-5,12,17,6,10,-25,-26,-4,-4,-10,3,3,33,-12,-35,-1,-20,-23,-15,24,38,-22,0,0,0,0,0,0,0,0];
const EG_PAWN = [0,0,0,0,0,0,0,0,178,173,158,134,147,132,165,187,94,100,85,67,56,53,82,84,32,24,13,5,-2,4,17,17,13,9,-3,-7,-7,-8,3,-1,4,7,-6,1,0,-5,-1,-8,13,8,8,10,13,0,2,-7,0,0,0,0,0,0,0,0];
const MG_KNIGHT = [-167,-89,-34,-49,61,-97,4,-107,-73,-41,72,36,23,62,7,-17,-47,60,37,65,84,129,73,44,-9,17,19,53,37,69,18,22,-13,4,16,13,28,19,21,-8,-23,-9,12,10,19,17,25,-16,-29,-53,-12,-3,-1,18,-14,-19,-105,-21,-58,-33,-17,-28,-19,-23];
const EG_KNIGHT = [-58,-38,-13,-28,-31,-27,-63,-99,-25,-8,-25,-2,-9,-25,-24,-52,-24,-20,10,9,-1,-9,-19,-41,-17,3,22,22,22,11,8,-18,-18,-6,16,25,16,17,4,-18,-23,-3,-1,15,10,-3,-20,-22,-42,-20,-10,-5,-2,-20,-23,-44,-29,-51,-23,-15,-22,-18,-50,-64];
const MG_BISHOP = [-29,4,-82,-37,-25,-42,7,-8,-26,16,-18,-13,30,59,18,-47,-16,37,43,40,35,50,37,-2,-4,5,19,50,37,37,7,-2,-6,13,13,26,34,12,10,4,0,15,15,15,14,27,18,10,4,15,16,0,7,21,33,1,-33,-3,-14,-21,-13,-12,-39,-21];
const EG_BISHOP = [-14,-21,-11,-8,-7,-9,-17,-24,-8,-4,7,-12,-3,-13,-4,-14,2,-8,0,-1,-2,6,0,4,-3,9,12,9,14,10,3,2,-6,3,13,19,7,10,-3,-9,-12,-3,8,10,13,3,-7,-15,-14,-18,-7,-1,4,-9,-15,-27,-23,-9,-23,-5,-9,-16,-5,-17];
const MG_ROOK = [32,42,32,51,63,9,31,43,27,32,58,62,80,67,26,44,-5,19,26,36,17,45,61,16,-24,-11,7,26,24,35,-8,-20,-36,-26,-12,-1,9,-7,6,-23,-45,-25,-16,-17,3,0,-5,-33,-44,-16,-20,-9,-1,11,-6,-71,-19,-13,1,17,16,7,-37,-26];
const EG_ROOK = [13,10,18,15,12,12,8,5,11,13,13,11,-3,7,7,8,7,7,7,5,4,-3,-5,3,4,3,13,1,2,1,-1,2,3,5,8,4,-5,-6,-8,-11,-4,0,-5,-1,-7,-12,-8,-16,-6,-6,0,2,-9,-9,-11,-3,-9,2,3,-1,-5,-13,4,-20];
const MG_QUEEN = [-28,0,29,12,59,44,43,45,-24,-39,-5,1,-16,57,28,54,-13,-17,7,8,29,56,47,57,-27,-27,-16,-16,-1,17,-2,1,-9,-26,-9,-10,-2,-4,3,-3,-14,-2,-11,-2,-5,2,14,5,-35,-8,11,2,8,15,-3,1,-1,-18,-9,10,-15,-25,-31,-50];
const EG_QUEEN = [-9,22,22,27,27,19,10,20,-17,20,32,41,58,25,30,0,-20,6,9,49,47,35,19,9,3,22,24,45,57,40,57,36,-18,28,19,47,31,34,39,23,-16,-27,15,6,9,17,10,5,-22,-23,-30,-16,-16,-23,-36,-32,-33,-28,-22,-43,-5,-32,-20,-41];
const MG_KING = [-65,23,16,-15,-56,-34,2,13,29,-1,-20,-7,-8,-4,-38,-29,-9,24,2,-16,-20,6,22,-22,-17,-20,-12,-27,-30,-25,-14,-36,-49,-1,-27,-39,-46,-44,-33,-51,-14,-14,-22,-46,-44,-30,-15,-27,1,7,-8,-64,-43,-16,9,8,-15,36,12,-54,8,-28,24,14];
const EG_KING = [-74,-35,-18,-18,-11,15,4,-17,-12,17,14,17,17,38,23,11,10,17,23,15,20,45,44,13,-8,22,24,27,26,33,26,3,-18,-4,21,24,27,23,9,-11,-19,-3,11,21,23,16,7,-9,-27,-11,4,13,14,4,-5,-17,-53,-34,-21,-11,-28,-14,-24,-43];

const MG_PST = { p: MG_PAWN, n: MG_KNIGHT, b: MG_BISHOP, r: MG_ROOK, q: MG_QUEEN, k: MG_KING };
const EG_PST = { p: EG_PAWN, n: EG_KNIGHT, b: EG_BISHOP, r: EG_ROOK, q: EG_QUEEN, k: EG_KING };

// ============================================================
// ZOBRIST HASHING (deterministic PRNG)
// ============================================================
let _seed = 1070372;
function xorshift() { _seed ^= _seed << 13; _seed ^= _seed >>> 17; _seed ^= _seed << 5; return _seed >>> 0; }

const PIECE_CHARS = 'PNBRQKpnbrqk';
const zobPiece = Array.from({ length: 12 }, () => Array.from({ length: 64 }, () => xorshift()));
const zobCastle = Array.from({ length: 16 }, () => xorshift());
const zobEpFile = Array.from({ length: 8 }, () => xorshift());
const zobSide = xorshift();

function pieceIdx(p) { return PIECE_CHARS.indexOf(p); }

function castleBits(c) {
    let b = 0;
    if (c.includes('K')) b |= 1;
    if (c.includes('Q')) b |= 2;
    if (c.includes('k')) b |= 4;
    if (c.includes('q')) b |= 8;
    return b;
}

function computeHash(pos) {
    let h = 0;
    for (let i = 0; i < 64; i++) {
        const p = pos.board[i];
        if (p !== '.') h ^= zobPiece[pieceIdx(p)][i];
    }
    h ^= zobCastle[castleBits(pos.castling)];
    if (pos.enPassant !== '-') h ^= zobEpFile[FILES.indexOf(pos.enPassant[0])];
    if (pos.side === 'b') h ^= zobSide;
    return h >>> 0;
}

// #50 Precomputed Attack Tables
const KNIGHT_ATTACKS = new Array(64);
const KING_ATTACKS = new Array(64);
for (let i = 0; i < 64; i++) {
    const r = i >> 3, c = i & 7;
    KNIGHT_ATTACKS[i] = [];
    for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) { const nr=r+dr,nc=c+dc; if(inB(nr,nc)) KNIGHT_ATTACKS[i].push(nr*8+nc); }
    KING_ATTACKS[i] = [];
    for (let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) { if(!dr&&!dc)continue; const nr=r+dr,nc=c+dc; if(inB(nr,nc)) KING_ATTACKS[i].push(nr*8+nc); }
}

// ============================================================
// TRANSPOSITION TABLE (typed arrays)
// ============================================================
const TT_SIZE = 1 << 20;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;
const ttHash = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);
const ttScore = new Int16Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
// Initialize with impossible hash
ttHash.fill(-1);

function encodeMove(m) {
    if (!m) return 0;
    const f = sqIdx(m.from), t = sqIdx(m.to);
    let pr = 0;
    if (m.promotion) pr = 'qrbn'.indexOf(m.promotion) + 1;
    return (f << 9) | (t << 3) | pr;
}

function decodeMove(enc) {
    if (!enc) return null;
    const f = (enc >> 9) & 63, t = (enc >> 3) & 63, pr = enc & 7;
    return { from: idxSq(f), to: idxSq(t), promotion: pr ? 'qrbn'[pr - 1] : undefined };
}

function ttProbe(hash, depth, alpha, beta, ply) {
    const idx = hash & TT_MASK;
    if (ttHash[idx] !== hash) return null;
    const s = adjustScoreFromTT(ttScore[idx], ply);
    const m = decodeMove(ttMove[idx]);
    if (ttDepth[idx] >= depth) {
        const f = ttFlag[idx];
        if (f === TT_EXACT) return { score: s, move: m, hit: true };
        if (f === TT_LOWER && s >= beta) return { score: s, move: m, hit: true };
        if (f === TT_UPPER && s <= alpha) return { score: s, move: m, hit: true };
    }
    return { score: null, move: m, hit: false };
}

function ttStore(hash, depth, flag, score, move, ply) {
    const idx = hash & TT_MASK;
    if (ttDepth[idx] > depth + 2 && ttHash[idx] !== hash) return;
    ttHash[idx] = hash;
    ttDepth[idx] = depth;
    ttFlag[idx] = flag;
    ttScore[idx] = adjustScoreToTT(score, ply);
    ttMove[idx] = encodeMove(move);
}

function adjustScoreToTT(s, ply) {
    if (s > MATE_THRESHOLD) return s + ply;
    if (s < -MATE_THRESHOLD) return s - ply;
    return s;
}
function adjustScoreFromTT(s, ply) {
    if (s > MATE_THRESHOLD) return s - ply;
    if (s < -MATE_THRESHOLD) return s + ply;
    return s;
}

// ============================================================
// FEN PARSER
// ============================================================
function parseFen(fen) {
    const [placement, side, castling, ep, hm, fm] = fen.trim().split(/\s+/);
    const board = [];
    for (const row of placement.split('/'))
        for (const ch of row)
            if (/\d/.test(ch)) { for (let i = 0; i < Number(ch); i++) board.push('.'); }
            else board.push(ch);
    // #25 Cache hash on position
    const pos = { board, side: side || 'w', castling: (castling && castling !== '-') ? castling : '-', enPassant: ep || '-', halfmove: Number(hm || 0), fullmove: Number(fm || 1) };
    pos.hash = computeHash(pos);
    return pos;
}

function stripCastling(c) { return c.replace(/-/g, ''); }
function normCastling(c) { const o = stripCastling(c); return o || '-'; }

// ============================================================
// ATTACK DETECTION
// ============================================================
function isAttacked(board, sq, by) {
    const tr = sq >> 3, tc = sq & 7;
    // Pawns
    const pr = by === 'w' ? tr + 1 : tr - 1;
    for (const dc of [-1, 1]) { const c = tc + dc; if (inB(pr, c)) { const p = board[pr * 8 + c]; if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'p') return true; } }
    // Knights (using precomputed table #50)
    for (const nsq of KNIGHT_ATTACKS[sq]) { const p = board[nsq]; if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'n') return true; }
    // Bishop/Queen diags
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) { let r=tr+dr,c=tc+dc; while(inB(r,c)){const p=board[r*8+c];if(p!=='.'){if(colorOf(p)===by&&(p.toLowerCase()==='b'||p.toLowerCase()==='q'))return true;break;}r+=dr;c+=dc;} }
    // Rook/Queen straights
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) { let r=tr+dr,c=tc+dc; while(inB(r,c)){const p=board[r*8+c];if(p!=='.'){if(colorOf(p)===by&&(p.toLowerCase()==='r'||p.toLowerCase()==='q'))return true;break;}r+=dr;c+=dc;} }
    // King (using precomputed table #50)
    for (const ksq of KING_ATTACKS[sq]) { const p = board[ksq]; if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'k') return true; }
    return false;
}

function kingInCheck(board, side) {
    const ki = board.findIndex(p => p !== '.' && colorOf(p) === side && p.toLowerCase() === 'k');
    if (ki < 0) return true;
    return isAttacked(board, ki, opp(side));
}

// ============================================================
// MOVE APPLICATION
// ============================================================
function applyMove(pos, move) {
    const b = pos.board.slice();
    const next = { board: b, side: opp(pos.side), castling: stripCastling(pos.castling), enPassant: '-', halfmove: pos.halfmove + 1, fullmove: pos.fullmove + (pos.side === 'b' ? 1 : 0) };
    const from = sqIdx(move.from), to = sqIdx(move.to);
    const piece = b[from], target = b[to], lower = piece.toLowerCase();
    b[from] = '.';
    if (lower === 'p' && move.to === pos.enPassant && target === '.') b[to + (pos.side === 'w' ? 8 : -8)] = '.';
    if (lower === 'k' && Math.abs(to - from) === 2) {
        if (move.to === 'g1') { b[sqIdx('f1')] = b[sqIdx('h1')]; b[sqIdx('h1')] = '.'; }
        else if (move.to === 'c1') { b[sqIdx('d1')] = b[sqIdx('a1')]; b[sqIdx('a1')] = '.'; }
        else if (move.to === 'g8') { b[sqIdx('f8')] = b[sqIdx('h8')]; b[sqIdx('h8')] = '.'; }
        else if (move.to === 'c8') { b[sqIdx('d8')] = b[sqIdx('a8')]; b[sqIdx('a8')] = '.'; }
    }
    b[to] = move.promotion ? (pos.side === 'w' ? move.promotion.toUpperCase() : move.promotion.toLowerCase()) : piece;
    if (lower === 'p' || target !== '.') next.halfmove = 0;
    if (lower === 'p' && Math.abs(to - from) === 16) next.enPassant = idxSq((from + to) / 2);
    if (lower === 'k') next.castling = next.castling.replace(pos.side === 'w' ? /[KQ]/g : /[kq]/g, '');
    if (lower === 'r') { if (from===sqIdx('a1'))next.castling=next.castling.replace('Q','');if(from===sqIdx('h1'))next.castling=next.castling.replace('K','');if(from===sqIdx('a8'))next.castling=next.castling.replace('q','');if(from===sqIdx('h8'))next.castling=next.castling.replace('k',''); }
    if (target.toLowerCase()==='r') { if(to===sqIdx('a1'))next.castling=next.castling.replace('Q','');if(to===sqIdx('h1'))next.castling=next.castling.replace('K','');if(to===sqIdx('a8'))next.castling=next.castling.replace('q','');if(to===sqIdx('h8'))next.castling=next.castling.replace('k',''); }
    next.castling = normCastling(next.castling);
    return next;
}

// ============================================================
// MOVE GENERATION
// ============================================================
function genMoves(pos, capturesOnly = false) {
    const moves = [], side = pos.side, b = pos.board;
    for (let i = 0; i < 64; i++) {
        const piece = b[i]; if (piece === '.' || colorOf(piece) !== side) continue;
        const r = i >> 3, c = i & 7, lower = piece.toLowerCase();
        if (lower === 'p') {
            const dir = side === 'w' ? -1 : 1, startR = side === 'w' ? 6 : 1, promoR = side === 'w' ? 0 : 7;
            const oneR = r + dir;
            if (inB(oneR, c) && b[oneR * 8 + c] === '.') {
                if (!capturesOnly || oneR === promoR) {
                    const to = oneR * 8 + c;
                    if (oneR === promoR) for (const p of ['q','r','b','n']) moves.push({from:idxSq(i),to:idxSq(to),promotion:p});
                    else if (!capturesOnly) { moves.push({from:idxSq(i),to:idxSq(to)}); const twoR=r+dir*2; if(r===startR&&inB(twoR,c)&&b[twoR*8+c]==='.')moves.push({from:idxSq(i),to:idxSq(twoR*8+c)}); }
                }
            }
            for (const dc of [-1, 1]) {
                const nr = r + dir, nc = c + dc; if (!inB(nr, nc)) continue;
                const to = nr * 8 + nc, tgt = b[to], tSq = idxSq(to);
                if (tSq === pos.enPassant || (tgt !== '.' && colorOf(tgt) !== side)) {
                    if (nr === promoR) for (const p of ['q','r','b','n']) moves.push({from:idxSq(i),to:tSq,promotion:p});
                    else moves.push({from:idxSq(i),to:tSq});
                }
            }
            continue;
        }
        const addSlides = (dirs) => { for (const [dr, dc] of dirs) { let nr=r+dr,nc=c+dc; while(inB(nr,nc)){const tgt=b[nr*8+nc];if(tgt==='.'){if(!capturesOnly)moves.push({from:idxSq(i),to:idxSq(nr*8+nc)});}else{if(colorOf(tgt)!==side)moves.push({from:idxSq(i),to:idxSq(nr*8+nc)});break;}nr+=dr;nc+=dc;} } };
        if (lower === 'n') { for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){const nr=r+dr,nc=c+dc;if(!inB(nr,nc))continue;const tgt=b[nr*8+nc];if(tgt==='.'&&!capturesOnly||tgt!=='.'&&colorOf(tgt)!==side)moves.push({from:idxSq(i),to:idxSq(nr*8+nc)});} }
        else if (lower === 'b') addSlides([[-1,-1],[-1,1],[1,-1],[1,1]]);
        else if (lower === 'r') addSlides([[-1,0],[1,0],[0,-1],[0,1]]);
        else if (lower === 'q') addSlides([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
        else if (lower === 'k') {
            for (let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(!inB(nr,nc))continue;const tgt=b[nr*8+nc];if(tgt==='.'&&!capturesOnly||tgt!=='.'&&colorOf(tgt)!==side)moves.push({from:idxSq(i),to:idxSq(nr*8+nc)});}
            if (!capturesOnly) {
                const rights = stripCastling(pos.castling);
                const kingSq = side==='w'?'e1':'e8';
                if (idxSq(i)===kingSq) {
                    if (canCastle(pos,side,'king')) moves.push({from:idxSq(i),to:side==='w'?'g1':'g8'});
                    if (canCastle(pos,side,'queen')) moves.push({from:idxSq(i),to:side==='w'?'c1':'c8'});
                }
            }
        }
    }
    return moves;
}

function canCastle(pos, side, kind) {
    const rights = stripCastling(pos.castling);
    const right = side==='w'?(kind==='king'?'K':'Q'):(kind==='king'?'k':'q');
    if (!rights.includes(right)) return false;
    const kingSq = side==='w'?'e1':'e8', rookSq = side==='w'?(kind==='king'?'h1':'a1'):(kind==='king'?'h8':'a8');
    const kingP = side==='w'?'K':'k', rookP = side==='w'?'R':'r';
    if (pos.board[sqIdx(kingSq)]!==kingP||pos.board[sqIdx(rookSq)]!==rookP) return false;
    if (kingInCheck(pos.board, side)) return false;
    const between = side==='w'?(kind==='king'?['f1','g1']:['d1','c1','b1']):(kind==='king'?['f8','g8']:['d8','c8','b8']);
    const pass = side==='w'?(kind==='king'?['f1','g1']:['d1','c1']):(kind==='king'?['f8','g8']:['d8','c8']);
    for (const sq of between) if (pos.board[sqIdx(sq)]!=='.') return false;
    for (const sq of pass) if (isAttacked(pos.board,sqIdx(sq),opp(side))) return false;
    return true;
}

function moveToUci(m) { return `${m.from}${m.to}${m.promotion||''}`; }

// ============================================================
// STATIC EXCHANGE EVALUATION (SEE) #14 #21
// ============================================================
const SEE_VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

function seeCapture(pos, move) {
    const toSq = sqIdx(move.to);
    const fromSq = sqIdx(move.from);
    const b = pos.board;
    const target = b[toSq];
    if (target === '.' && !(b[fromSq].toLowerCase() === 'p' && move.to === pos.enPassant)) return 0;
    const captured = target !== '.' ? (SEE_VAL[target.toLowerCase()] || 0) : 100;
    const attacker = SEE_VAL[b[fromSq].toLowerCase()] || 0;

    // Simple SEE: if captured piece >= attacker, always good
    if (captured >= attacker) return captured - attacker;

    // Approximate: check if the square is defended
    const side = colorOf(b[fromSq]);
    const oppSide = opp(side);
    // Make the capture, check if opponent can recapture
    const tempBoard = b.slice();
    tempBoard[fromSq] = '.';
    tempBoard[toSq] = b[fromSq];
    if (isAttacked(tempBoard, toSq, oppSide)) return captured - attacker;
    return captured;
}

// ============================================================
// EVALUATION
// ============================================================
function evaluate(pos) {
    const b = pos.board;
    let mgW = 0, egW = 0, mgB = 0, egB = 0, phaseVal = 0;
    let wBishops = 0, bBishops = 0;
    let wPawnFiles = 0, bPawnFiles = 0;
    let wPawns = new Uint8Array(8), bPawns = new Uint8Array(8);
    let wKingSq = -1, bKingSq = -1;
    let wRookSqs = [], bRookSqs = [], wKnightSqs = [], bKnightSqs = [];
    let hasWQ = false, hasBQ = false;

    for (let i = 0; i < 64; i++) {
        const p = b[i]; if (p === '.') continue;
        const lower = p.toLowerCase(), col = colorOf(p), pv = PIECE_VAL[lower] || 0;
        phaseVal += PHASE_VAL[lower] || 0;
        if (col === 'w') {
            mgW += pv + MG_PST[lower][i]; egW += pv + EG_PST[lower][i];
            if (lower === 'b') wBishops++;
            if (lower === 'p') { wPawns[i & 7]++; wPawnFiles |= (1 << (i & 7)); }
            if (lower === 'k') wKingSq = i;
            if (lower === 'r') wRookSqs.push(i);
            if (lower === 'n') wKnightSqs.push(i);
            if (lower === 'q') hasWQ = true;
        } else {
            mgB += pv + MG_PST[lower][mirror(i)]; egB += pv + EG_PST[lower][mirror(i)];
            if (lower === 'b') bBishops++;
            if (lower === 'p') { bPawns[i & 7]++; bPawnFiles |= (1 << (i & 7)); }
            if (lower === 'k') bKingSq = i;
            if (lower === 'r') bRookSqs.push(i);
            if (lower === 'n') bKnightSqs.push(i);
            if (lower === 'q') hasBQ = true;
        }
    }

    // #29 Bishop pair
    if (wBishops >= 2) { mgW += 30; egW += 50; }
    if (bBishops >= 2) { mgB += 30; egB += 50; }

    // #32 Pawn structure
    for (let f = 0; f < 8; f++) {
        if (wPawns[f] > 1) { mgW -= 10 * (wPawns[f]-1); egW -= 20 * (wPawns[f]-1); }
        if (bPawns[f] > 1) { mgB -= 10 * (bPawns[f]-1); egB -= 20 * (bPawns[f]-1); }
        if (wPawns[f] && !((f>0&&(wPawnFiles&(1<<(f-1))))||(f<7&&(wPawnFiles&(1<<(f+1)))))) { mgW -= 15; egW -= 20; }
        if (bPawns[f] && !((f>0&&(bPawnFiles&(1<<(f-1))))||(f<7&&(bPawnFiles&(1<<(f+1)))))) { mgB -= 15; egB -= 20; }
    }

    // #30 Rook on open/semi-open file
    for (const ri of wRookSqs) { const f=ri&7; if(!wPawns[f]){mgW+=bPawns[f]?12:25;egW+=bPawns[f]?15:30;} }
    for (const ri of bRookSqs) { const f=ri&7; if(!bPawns[f]){mgB+=wPawns[f]?12:25;egB+=wPawns[f]?15:30;} }

    // #36 Connected Rooks
    for (const [sqs, mg, eg] of [[wRookSqs,'w'],[bRookSqs,'b']]) {
        if (sqs.length === 2) {
            const [a, a2] = sqs;
            let conn = false;
            if ((a>>3)===(a2>>3)) { conn=true; const mn=Math.min(a&7,a2&7),mx=Math.max(a&7,a2&7); for(let c=mn+1;c<mx;c++) if(b[(a>>3)*8+c]!=='.'){conn=false;break;} }
            else if ((a&7)===(a2&7)) { conn=true; const mn=Math.min(a>>3,a2>>3),mx=Math.max(a>>3,a2>>3); for(let r=mn+1;r<mx;r++) if(b[r*8+(a&7)]!=='.'){conn=false;break;} }
            if (conn) { if(mg==='w'){mgW+=10;egW+=15;}else{mgB+=10;egB+=15;} }
        }
    }

    // #31+#43 Passed pawn with endgame push bonus
    for (let i = 0; i < 64; i++) {
        const p = b[i]; if (p !== 'P' && p !== 'p') continue;
        const f = i & 7, r = i >> 3;
        if (p === 'P') {
            let passed = true;
            for (let rr = r-1; rr >= 0 && passed; rr--) for (let ff=Math.max(0,f-1); ff<=Math.min(7,f+1); ff++) if(b[rr*8+ff]==='p'){passed=false;break;}
            if (passed) { const rk=7-r; const bonus=[0,5,10,20,35,60,100,0][rk]; mgW+=bonus; egW+=Math.round(bonus*1.5); if(phaseVal<=8) egW+=[0,0,5,15,30,60,120,0][rk]; }
        } else {
            let passed = true;
            for (let rr = r+1; rr < 8 && passed; rr++) for (let ff=Math.max(0,f-1); ff<=Math.min(7,f+1); ff++) if(b[rr*8+ff]==='P'){passed=false;break;}
            if (passed) { const rk=r; const bonus=[0,100,60,35,20,10,5,0][rk]; mgB+=bonus; egB+=Math.round(bonus*1.5); if(phaseVal<=8) egB+=[0,120,60,30,15,5,0,0][rk]; }
        }
    }

    // #37 Knight Outpost
    for (const ni of wKnightSqs) {
        const nr=ni>>3, nc=ni&7;
        if (nr>=2 && nr<=4) { let safe=true; for(let rr=0;rr<nr&&safe;rr++){if(nc>0&&b[rr*8+nc-1]==='p')safe=false;if(nc<7&&b[rr*8+nc+1]==='p')safe=false;} if(safe){mgW+=20;egW+=15;} }
    }
    for (const ni of bKnightSqs) {
        const nr=ni>>3, nc=ni&7;
        if (nr>=3 && nr<=5) { let safe=true; for(let rr=nr+1;rr<8&&safe;rr++){if(nc>0&&b[rr*8+nc-1]==='P')safe=false;if(nc<7&&b[rr*8+nc+1]==='P')safe=false;} if(safe){mgB+=20;egB+=15;} }
    }

    // #33 King Safety - Pawn Shield
    if (wKingSq >= 0 && hasBQ) {
        const kr=wKingSq>>3, kc=wKingSq&7; let pen=0;
        if (kr>=6) { for(let dc=-1;dc<=1;dc++){const fc=kc+dc;if(fc<0||fc>7)continue;if(b[(kr-1)*8+fc]==='P'){}else if(kr>=2&&b[(kr-2)*8+fc]==='P')pen+=10;else pen+=20;} }
        mgW -= pen;
    }
    if (bKingSq >= 0 && hasWQ) {
        const kr=bKingSq>>3, kc=bKingSq&7; let pen=0;
        if (kr<=1) { for(let dc=-1;dc<=1;dc++){const fc=kc+dc;if(fc<0||fc>7)continue;if(b[(kr+1)*8+fc]==='p'){}else if(kr<=5&&b[(kr+2)*8+fc]==='p')pen+=10;else pen+=20;} }
        mgB -= pen;
    }

    // #35 King Tropism - pieces near enemy king
    if (wKingSq >= 0 && bKingSq >= 0) {
        const bkr=bKingSq>>3,bkc=bKingSq&7,wkr=wKingSq>>3,wkc=wKingSq&7;
        for (let i=0;i<64;i++) { const p=b[i]; if(p==='.'||p.toLowerCase()==='k'||p.toLowerCase()==='p')continue; const pr=i>>3,pc=i&7;
            if(colorOf(p)==='w'){mgW+=Math.max(0,(7-Math.max(Math.abs(pr-bkr),Math.abs(pc-bkc)))*2);}
            else{mgB+=Math.max(0,(7-Math.max(Math.abs(pr-wkr),Math.abs(pc-wkc)))*2);}
        }
    }

    // #34 Mobility - sliding piece move count
    for (let i=0;i<64;i++) {
        const p=b[i]; if(p==='.')continue; const lower=p.toLowerCase();
        if(lower!=='b'&&lower!=='r'&&lower!=='q')continue;
        const r=i>>3,c=i&7,dirs=lower==='b'?[[-1,-1],[-1,1],[1,-1],[1,1]]:lower==='r'?[[-1,0],[1,0],[0,-1],[0,1]]:[[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
        let mob=0; for(const[dr,dc]of dirs){let nr=r+dr,nc=c+dc;while(inB(nr,nc)){mob++;if(b[nr*8+nc]!=='.')break;nr+=dr;nc+=dc;}}
        const bns=lower==='b'?3:lower==='r'?2:1;
        if(colorOf(p)==='w'){mgW+=mob*bns;egW+=mob*bns;}else{mgB+=mob*bns;egB+=mob*bns;}
    }

    // #38 Space Advantage
    let wSp=0,bSp=0;
    for(let i=0;i<64;i++){if(b[i]==='P'&&(i>>3)<=4)wSp++;if(b[i]==='p'&&(i>>3)>=3)bSp++;}
    mgW+=wSp*5; mgB+=bSp*5;

    // #45 Opening Principles Heuristic
    if (phaseVal >= 20) {
        // Penalty for undeveloped minor pieces on starting squares
        if(b[sqIdx('b1')]==='N') mgW-=15; if(b[sqIdx('g1')]==='N') mgW-=15;
        if(b[sqIdx('c1')]==='B') mgW-=15; if(b[sqIdx('f1')]==='B') mgW-=15;
        if(b[sqIdx('b8')]==='n') mgB-=15; if(b[sqIdx('g8')]==='n') mgB-=15;
        if(b[sqIdx('c8')]==='b') mgB-=15; if(b[sqIdx('f8')]==='b') mgB-=15;
        // Penalty for early queen development
        if(b[sqIdx('d1')]!=='Q'&&hasWQ) mgW-=10;
        if(b[sqIdx('d8')]!=='q'&&hasBQ) mgB-=10;
    }

    // #28 Tapered eval
    let phase = Math.min(phaseVal, TOTAL_PHASE);
    const mgScore = mgW - mgB, egScore = egW - egB;
    let score = Math.round((mgScore * phase + egScore * (TOTAL_PHASE - phase)) / TOTAL_PHASE);

    // #39 Tempo bonus
    score += pos.side === 'w' ? 15 : -15;

    // #41 Insufficient material
    const pieces = b.filter(p => p !== '.');
    if (pieces.length === 2) return DRAW;
    if (pieces.length === 3) { const extra = pieces.find(p => p.toLowerCase() !== 'k'); if (extra && (extra.toLowerCase() === 'n' || extra.toLowerCase() === 'b')) return DRAW; }

    // #40+#42 Mop-up eval + King centralization in endgame
    if (phase <= 4 && wKingSq >= 0 && bKingSq >= 0) {
        if (score > 200) {
            const er=bKingSq>>3,ec=bKingSq&7,cd=Math.abs(3.5-er)+Math.abs(3.5-ec),kd=Math.abs((wKingSq>>3)-(bKingSq>>3))+Math.abs((wKingSq&7)-(bKingSq&7));
            score += Math.round(cd * 10 + (14 - kd) * 5);
        } else if (score < -200) {
            const er=wKingSq>>3,ec=wKingSq&7,cd=Math.abs(3.5-er)+Math.abs(3.5-ec),kd=Math.abs((wKingSq>>3)-(bKingSq>>3))+Math.abs((wKingSq&7)-(bKingSq&7));
            score -= Math.round(cd * 10 + (14 - kd) * 5);
        }
    }

    return pos.side === 'w' ? score : -score;
}

// ============================================================
// MOVE ORDERING
// ============================================================
const killers = Array.from({ length: MAX_PLY }, () => [null, null]);
const history = Array.from({ length: 12 }, () => new Int32Array(64));
const countermove = Array.from({ length: 12 }, () => new Array(64).fill(null));

function scoreMove(pos, move, ttMove, ply, prevMove) {
    const uci = moveToUci(move);
    if (ttMove && moveToUci(ttMove) === uci) return 1000000;

    const from = sqIdx(move.from), to = sqIdx(move.to);
    const target = pos.board[to];
    const piece = pos.board[from];

    // Captures: MVV-LVA
    if (target !== '.' || (piece.toLowerCase() === 'p' && move.to === pos.enPassant)) {
        const victimVal = target !== '.' ? (PIECE_VAL[target.toLowerCase()] || 0) : 100;
        const attackerVal = PIECE_VAL[piece.toLowerCase()] || 0;
        return 500000 + victimVal * 10 - attackerVal;
    }

    // Promotions
    if (move.promotion) return 400000 + (move.promotion === 'q' ? 900 : 0);

    // Killers
    if (killers[ply]) {
        if (killers[ply][0] && moveToUci(killers[ply][0]) === uci) return 300000;
        if (killers[ply][1] && moveToUci(killers[ply][1]) === uci) return 290000;
    }

    // Countermove
    if (prevMove) {
        const pi = pieceIdx(pos.board[sqIdx(prevMove.to)]);
        if (pi >= 0) {
            const cm = countermove[pi][sqIdx(prevMove.to)];
            if (cm && moveToUci(cm) === uci) return 280000;
        }
    }

    // History
    const pi = pieceIdx(piece);
    if (pi >= 0) return history[pi][to];
    return 0;
}

function orderMoves(pos, moves, ttMove, ply, prevMove) {
    const scored = moves.map(m => ({ move: m, score: scoreMove(pos, m, ttMove, ply, prevMove) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.move);
}

function updateKillers(ply, move) {
    if (killers[ply][0] && moveToUci(killers[ply][0]) === moveToUci(move)) return;
    killers[ply][1] = killers[ply][0];
    killers[ply][0] = move;
}

function updateHistory(piece, to, depth) {
    const pi = pieceIdx(piece);
    if (pi >= 0) history[pi][to] += depth * depth;
    if (history[pi][to] > 100000) { for (let i = 0; i < 12; i++) for (let j = 0; j < 64; j++) history[i][j] >>= 1; }
}

// ============================================================
// SEARCH STATE
// ============================================================
let searchStart = 0, softLimit = 200, hardLimit = 900, nodes = 0, timeUp = false, totalGameTime = 0;
const hashStack = [];

function checkTime() { if (nodes & 2047) return; if (Date.now() - searchStart > hardLimit) timeUp = true; }

// ============================================================
// QUIESCENCE SEARCH
// ============================================================
function quiesce(pos, alpha, beta, ply) {
    nodes++;
    if (timeUp) return 0;
    checkTime();
    if (timeUp) return 0;

    const inCheck = kingInCheck(pos.board, pos.side);
    let standPat = evaluate(pos);

    if (inCheck) {
        // Search all moves when in check
        const moves = genMoves(pos, false);
        let legal = 0, bestScore = -INF;
        for (const m of moves) {
            const np = applyMove(pos, m);
            if (kingInCheck(np.board, pos.side)) continue;
            legal++;
            const score = -quiesce(np, -beta, -alpha, ply + 1);
            if (timeUp) return 0;
            if (score > bestScore) bestScore = score;
            if (score > alpha) alpha = score;
            if (alpha >= beta) break;
        }
        if (legal === 0) return -MATE + ply;
        return bestScore;
    }

    if (standPat >= beta) return beta;
    // Delta pruning
    if (standPat + 1000 < alpha) return alpha;
    if (standPat > alpha) alpha = standPat;

    const captures = genMoves(pos, true);
    const ordered = captures.map(m => {
        return { move: m, score: seeCapture(pos, m) };
    }).sort((a, b) => b.score - a.score);

    for (const { move, score: seeVal } of ordered) {
        // #14 SEE pruning: skip losing captures
        if (seeVal < -50) continue;
        const np = applyMove(pos, move);
        if (kingInCheck(np.board, pos.side)) continue;
        // Delta pruning per capture
        const capturedVal = pos.board[sqIdx(move.to)] !== '.' ? PIECE_VAL[pos.board[sqIdx(move.to)].toLowerCase()] || 0 : 100;
        if (standPat + capturedVal + 200 < alpha && !move.promotion) continue;

        const score = -quiesce(np, -beta, -alpha, ply + 1);
        if (timeUp) return 0;
        if (score > alpha) { alpha = score; if (alpha >= beta) return beta; }
    }
    return alpha;
}

// ============================================================
// NEGAMAX SEARCH (PVS + NMP + LMR + Futility)
// ============================================================
function negamax(pos, depth, alpha, beta, ply, nullAllowed, prevMove) {
    nodes++;
    if (timeUp) return 0;
    checkTime();
    if (timeUp) return 0;

    // Draw by repetition in search
    const hash = computeHash(pos);
    if (ply > 0) {
        for (let i = hashStack.length - 1; i >= 0; i--) { if (hashStack[i] === hash) return DRAW; }
    }

    // 50-move rule
    if (pos.halfmove >= 100) return DRAW;

    const inCheck = kingInCheck(pos.board, pos.side);

    // Check extension
    if (inCheck) depth++;

    if (depth <= 0) return quiesce(pos, alpha, beta, ply);

    const isPV = beta - alpha > 1;

    // TT probe
    let ttMove = null;
    const ttEntry = ttProbe(hash, depth, alpha, beta, ply);
    if (ttEntry) {
        ttMove = ttEntry.move;
        if (ttEntry.hit && !isPV) return ttEntry.score;
    }

    // #5 Internal Iterative Deepening
    if (!ttMove && isPV && depth >= 4) {
        negamax(pos, depth - 2, alpha, beta, ply, true, prevMove);
        const iidEntry = ttProbe(hash, 0, -INF, INF, ply);
        if (iidEntry && iidEntry.move) ttMove = iidEntry.move;
    }

    const staticEval = evaluate(pos);

    // Reverse futility pruning
    if (!isPV && !inCheck && depth <= 3 && staticEval - 120 * depth >= beta) return staticEval;

    // Razoring
    if (!isPV && !inCheck && depth <= 2 && staticEval + 300 * depth <= alpha) {
        const qs = quiesce(pos, alpha, beta, ply);
        if (qs <= alpha) return qs;
    }

    // Null move pruning
    if (nullAllowed && !isPV && !inCheck && depth >= 3 && staticEval >= beta) {
        const R = 3 + (depth > 6 ? 1 : 0);
        const nullPos = { board: pos.board.slice(), side: opp(pos.side), castling: pos.castling, enPassant: '-', halfmove: pos.halfmove, fullmove: pos.fullmove };
        hashStack.push(hash);
        const nullScore = -negamax(nullPos, depth - R, -beta, -beta + 1, ply + 1, false, null);
        hashStack.pop();
        if (timeUp) return 0;
        if (nullScore >= beta) return beta;
    }

    // Generate and order moves
    const pseudoMoves = genMoves(pos, false);
    const moves = orderMoves(pos, pseudoMoves, ttMove, ply, prevMove);

    // #13 Multi-Cut Pruning: at high depths, if many moves cause cutoff, prune
    if (!isPV && !inCheck && depth >= 6 && moves.length > 6) {
        let cutoffs = 0, tried = 0;
        for (let mi = 0; mi < Math.min(6, moves.length) && !timeUp; mi++) {
            const m = moves[mi];
            const np = applyMove(pos, m);
            if (kingInCheck(np.board, pos.side)) continue;
            tried++;
            hashStack.push(hash);
            const s = -negamax(np, depth - 4, -beta, -beta + 1, ply + 1, false, m);
            hashStack.pop();
            if (s >= beta) cutoffs++;
            if (cutoffs >= 3) return beta;
        }
    }

    let bestScore = -INF, bestMove = null, legal = 0, searchedMoves = 0;

    // #15 Singular Extension flag
    const singularCandidate = ttMove && ttEntry && ttEntry.hit && !inCheck && depth >= 6;

    for (const move of moves) {
        const np = applyMove(pos, move);
        if (kingInCheck(np.board, pos.side)) continue;
        legal++;

        const from = sqIdx(move.from), to = sqIdx(move.to);
        const isCapture = pos.board[to] !== '.' || (pos.board[from].toLowerCase() === 'p' && move.to === pos.enPassant);
        const givesCheck = kingInCheck(np.board, np.side);

        // Futility pruning
        if (!isPV && !inCheck && !givesCheck && !isCapture && !move.promotion && depth <= 2 && staticEval + 150 * depth < alpha && legal > 1) {
            continue;
        }

        // Late move pruning
        if (!isPV && !inCheck && !isCapture && !move.promotion && !givesCheck && depth <= 2 && searchedMoves >= 6 + depth * 3) {
            continue;
        }

        let score;
        let extension = 0;

        // #15 Singular Extension: if TT move is clearly best, extend its search
        if (singularCandidate && searchedMoves === 0 && ttMove && moveToUci(move) === moveToUci(ttMove)) {
            extension = 1;
        }

        hashStack.push(hash);

        if (searchedMoves === 0) {
            // PVS: full window for first move (with possible singular extension)
            score = -negamax(np, depth - 1 + extension, -beta, -alpha, ply + 1, true, move);
        } else {
            // LMR: reduce depth for late quiet moves
            let reduction = 0;
            if (depth >= 3 && searchedMoves >= 4 && !isCapture && !move.promotion && !inCheck && !givesCheck) {
                reduction = 1 + Math.floor(Math.log(depth) * Math.log(searchedMoves) / 2.5);
                if (isPV) reduction = Math.max(0, reduction - 1);
                reduction = Math.min(reduction, depth - 2);
            }

            // PVS: zero window search
            score = -negamax(np, depth - 1 - reduction, -(alpha + 1), -alpha, ply + 1, true, move);

            // Re-search if LMR reduced and score looks promising
            if (reduction > 0 && score > alpha) {
                score = -negamax(np, depth - 1, -(alpha + 1), -alpha, ply + 1, true, move);
            }
            // Re-search with full window if needed
            if (score > alpha && score < beta) {
                score = -negamax(np, depth - 1, -beta, -alpha, ply + 1, true, move);
            }
        }

        hashStack.pop();
        if (timeUp) return 0;
        searchedMoves++;

        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
            if (score > alpha) {
                alpha = score;
                if (score >= beta) {
                    // Beta cutoff
                    if (!isCapture && !move.promotion) {
                        updateKillers(ply, move);
                        updateHistory(pos.board[from], to, depth);
                        if (prevMove) {
                            const ppi = pieceIdx(pos.board[sqIdx(prevMove.to)]);
                            if (ppi >= 0) countermove[ppi][sqIdx(prevMove.to)] = move;
                        }
                    }
                    ttStore(hash, depth, TT_LOWER, score, bestMove, ply);
                    return score;
                }
            }
        }
    }

    if (legal === 0) {
        if (inCheck) return -MATE + ply;
        return DRAW;
    }

    const flag = bestScore > alpha ? TT_EXACT : TT_UPPER;
    ttStore(hash, depth, flag, bestScore, bestMove, ply);
    return bestScore;
}

// ============================================================
// ITERATIVE DEEPENING WITH ASPIRATION WINDOWS
// ============================================================
function iterativeDeepening(pos) {
    let bestMove = null, bestScore = -INF;
    const hash = computeHash(pos);
    hashStack.length = 0;

    // Reset killers and check time
    for (let i = 0; i < MAX_PLY; i++) { killers[i][0] = null; killers[i][1] = null; }

    for (let depth = 1; depth <= 50; depth++) {
        nodes = 0;
        timeUp = false;
        let alpha = -INF, beta = INF;

        // Aspiration windows for depth > 4
        if (depth > 4 && bestScore > -MATE_THRESHOLD && bestScore < MATE_THRESHOLD) {
            alpha = bestScore - 50;
            beta = bestScore + 50;
        }

        let score;
        while (true) {
            score = negamax(pos, depth, alpha, beta, 0, true, null);
            if (timeUp) break;
            if (score <= alpha) { alpha = Math.max(-INF, alpha - 200); continue; }
            if (score >= beta) { beta = Math.min(INF, beta + 200); continue; }
            break;
        }

        if (timeUp && depth > 1) break;

        // Extract best move from TT
        const ttEntry = ttProbe(hash, 0, -INF, INF, 0);
        if (ttEntry && ttEntry.move) {
            bestMove = ttEntry.move;
            bestScore = score;
        }

        // Easy move: only one legal move
        const legal = genMoves(pos, false).filter(m => { const np = applyMove(pos, m); return !kingInCheck(np.board, pos.side); });
        if (legal.length === 1) { bestMove = legal[0]; break; }

        // #48 Time Banking: if we've used >40% of soft limit, stop
        if (Date.now() - searchStart > softLimit * 0.4) break;
    }

    return bestMove;
}

// ============================================================
// OPENING BOOK
// ============================================================
const BOOK = new Map([
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 'e2e4'],
    ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3', 'e7e5'],
    ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'e7e5'],
    ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6', 'g1f3'],
    ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'g1f3'],
    ['rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -', 'b8c6'],
    ['r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -', 'f1b5'],
    ['r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -', 'a7a6'],
    ['rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3', 'd7d5'],
    ['rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -', 'd7d5'],
    ['rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6', 'c2c4'],
    ['rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', 'c2c4'],
    ['rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3', 'e7e6'],
    ['rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -', 'e7e6'],
    ['rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6', 'g1f3'],
    ['rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'g1f3'],
    ['rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'd2d4'],
    ['rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', 'c2c4'],
    ['rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -', 'e7e5'],
    ['rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -', 'd7d5'],
]);

function bookLookup(fen) {
    const parts = fen.trim().split(/\s+/);
    const key = `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
    return BOOK.get(key) || null;
}

// ============================================================
// MAIN
// ============================================================
const fen = readFileSync(0, 'utf8').trim();
const pos = parseFen(fen);

// Try opening book first
const bookMove = bookLookup(fen);
if (bookMove) {
    process.stdout.write(bookMove + '\n');
} else {
    searchStart = Date.now();
    const move = iterativeDeepening(pos);
    if (move) {
        process.stdout.write(moveToUci(move) + '\n');
    } else {
        // Fallback: pick first legal move
        const legal = genMoves(pos, false).filter(m => { const np = applyMove(pos, m); return !kingInCheck(np.board, pos.side); });
        process.stdout.write(legal.length ? moveToUci(legal[0]) + '\n' : '0000\n');
    }
}
