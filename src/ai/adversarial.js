import { newGrid, carveMaze, WALL } from './grid.js';
import { rng, shuffle } from './rng.js';

export const MOVES = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
export const ARROWS = ['↑', '→', '↓', '←', '·'];
export const BRAINS = {
  minimax: { name: 'Minimax', line: 'Each shade expects your best reply and searches with alpha-beta pruning.' },
  expectimax: { name: 'Expectimax', line: 'Each shade expects a random reply and plays for the average. Nothing can be pruned.' },
  chase: { name: 'Chase', line: 'No look-ahead: each shade takes the next step of its shortest path to you.' },
};
const EMPTY = [];

export const popcount = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

// A hunt: the labyrinth, its move lists, the maze distance between every pair of cells, and where everyone stands.
export function makeHunt({ seed = 1, shades = 2, embers = 6, cols = 21, rows = 15 } = {}) {
  const rnd = rng(seed), g = newGrid(cols, rows, WALL);
  carveMaze(g, .3, rnd);
  const N = g.cells.length, adj = new Array(N);
  for (let i = 0; i < N; i++) {
    if (g.cells[i] === WALL) continue;
    const c = i % cols, r = (i - c) / cols;
    adj[i] = [];
    MOVES.forEach(([dx, dy], d) => {
      const nc = c + dx, nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) return;
      const j = nr * cols + nc;
      if (g.cells[j] !== WALL) adj[i].push({ to: j, d });
    });
  }
  const dist = new Int16Array(N * N).fill(999); // BFS from every open cell
  for (let s = 0; s < N; s++) {
    if (!adj[s]) continue;
    const q = [s]; dist[s * N + s] = 0;
    for (let h = 0; h < q.length; h++) for (const { to } of adj[q[h]]) if (dist[s * N + to] === 999) { dist[s * N + to] = dist[s * N + q[h]] + 1; q.push(to); }
  }
  const player = cols + 1, shadeCells = [N - cols - 2, 2 * cols - 2].slice(0, shades), list = [];
  for (const i of shuffle([...Array(N).keys()].filter(i => adj[i]), rnd)) {
    if (list.length === embers) break;
    if (dist[player * N + i] < 5 || shadeCells.some(s => dist[s * N + i] < 4) || list.some(e => dist[e * N + i] < 5)) continue;
    list.push(i);
  }
  const emberAt = new Int8Array(N).fill(-1);
  list.forEach((e, k) => { emberAt[e] = k; });
  return { seed, g, N, adj, dist, player, shades: shadeCells, embers: list, emberAt, mask: 0, full: (1 << list.length) - 1, turn: 0, over: null };
}

// The score of a position for the lantern: the lantern (max) wants it high, the shades (min) want it low.
export function evaluate(game, p, sh, mask, left) {
  if (sh.includes(p)) return -1000 - left; // caught: sooner is worse
  if (mask === game.full) return 1000 + left;
  const { N, dist: D, embers } = game;
  let near = 99;
  for (let k = 0; k < embers.length; k++) if (!(mask >> k & 1)) near = Math.min(near, D[p * N + embers[k]]);
  let v = 100 * popcount(mask) - 3 * near;
  for (const s of sh) v -= 60 / (D[p * N + s] + 1);
  if (new Set(sh).size < sh.length) v += 15; // two shades on one cell guard half the ground, so they learn to split up
  return v;
}

// Best-first by the score one step ahead: alpha-beta cuts sooner when the best move is tried first.
function orderedMoves(game, p, sh, mask, agent) {
  const moves = game.adj[agent === 0 ? p : sh[agent - 1]];
  return moves.map(m => {
    let s;
    if (agent === 0) { const e = game.emberAt[m.to]; s = -evaluate(game, m.to, sh, e >= 0 ? mask | 1 << e : mask, 0); }
    else { const ns = sh.slice(); ns[agent - 1] = m.to; s = evaluate(game, p, ns, mask, 0); }
    return { m, s };
  }).sort((a, b) => a.s - b.s).map(x => x.m);
}

// Depth-limited search over the agents [lantern, shade A, shade B]. ctx: { brain, prune, order, nodes, pv }.
// brain 'expectimax' turns the lantern's nodes into chance nodes (the average of its replies).
// rec, for the top two plies only, records each branch's value and how many positions each run searched.
export function search(game, ctx, p, sh, mask, agent, depth, alpha, beta, rec, ply) {
  ctx.nodes++;
  ctx.pv[ply] = EMPTY;
  if (depth === 0 || sh.includes(p) || mask === game.full) return evaluate(game, p, sh, mask, depth);
  const max = agent === 0, next = (agent + 1) % (sh.length + 1);
  const moves = ctx.order ? orderedMoves(game, p, sh, mask, agent) : game.adj[max ? p : sh[agent - 1]];
  const chance = max && ctx.brain === 'expectimax' && ply > 0;
  let best = max ? -Infinity : Infinity, sum = 0;
  for (let k = 0; k < moves.length; k++) {
    const to = moves[k].to;
    let np = p, ns = sh, nm = mask;
    if (max) { np = to; const e = game.emberAt[to]; if (e >= 0) nm = mask | 1 << e; }
    else { ns = sh.slice(); ns[agent - 1] = to; }
    let child = null;
    if (rec && ply < 2) child = rec.children[k] || (rec.children[k] = { d: moves[k].d, to, agent: next, children: [], value: 0, plain: 0, ab: 0 });
    const n0 = ctx.nodes;
    const v = search(game, ctx, np, ns, nm, next, depth - 1, alpha, beta, child, ply + 1);
    if (child) { if (ctx.prune) child.ab = ctx.nodes - n0; else { child.value = v; child.plain = ctx.nodes - n0; } }
    if (chance) { sum += v; continue; }
    if (max ? v > best : v < best) { best = v; ctx.pv[ply] = [to, ...ctx.pv[ply + 1]]; }
    if (ctx.prune) {
      if (max) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
      if (alpha >= beta) break; // the opponent already has a better option elsewhere: skip the remaining moves
    }
  }
  if (chance) { ctx.pv[ply] = EMPTY; return sum / moves.length; } // no single line through a chance node
  return best;
}

const fillAb = rec => { rec.ab = rec.plain; rec.children.forEach(fillAb); };

// One agent's move. The lantern always plays minimax for itself; the shades use the brain.
export function decide(game, agent, { depth = 4, brain = 'minimax', order = true, withTree = false } = {}) {
  const p = game.player, sh = game.shades, mask = game.mask;
  if (agent > 0 && brain === 'chase') {
    const from = sh[agent - 1];
    let move = from, bd = Infinity;
    for (const m of game.adj[from]) { const d = game.dist[m.to * game.N + p]; if (d < bd) { bd = d; move = m.to; } }
    return { move, pv: [move], tree: null, value: null, nodes: game.adj[from].length, plain: game.adj[from].length };
  }
  const own = agent === 0 ? 'minimax' : brain, expect = own === 'expectimax';
  let tree = null, plain = 0;
  if (withTree || expect) {
    tree = withTree ? { agent, children: [], value: 0, plain: 0, ab: 0 } : null;
    const c = { brain: own, prune: false, order, nodes: 0, pv: [] };
    const value = search(game, c, p, sh, mask, agent, depth, -Infinity, Infinity, tree, 0);
    plain = c.nodes;
    if (tree) { tree.value = value; tree.plain = plain; }
    if (expect) {
      if (tree) fillAb(tree);
      const pv = c.pv[0].slice();
      return { move: pv[0] ?? sh[agent - 1], pv, tree, value, nodes: plain, plain };
    }
  }
  const c = { brain: own, prune: true, order, nodes: 0, pv: [] };
  const value = search(game, c, p, sh, mask, agent, depth, -Infinity, Infinity, tree, 0);
  if (tree) {
    tree.ab = c.nodes;
    if (value !== tree.value) throw new Error(`alpha-beta ${value} disagrees with minimax ${tree.value}`);
  }
  const pv = c.pv[0].slice();
  return { move: pv.length ? pv[0] : agent ? sh[agent - 1] : p, pv, tree, value, nodes: c.nodes, plain };
}

export function checkEnd(game, maxTurns = 300) {
  if (game.shades.includes(game.player)) game.over = 'caught';
  else if (game.mask === game.full) game.over = 'won';
  else if (game.turn >= maxTurns) game.over = 'draw';
  return game.over;
}

export const legalMove = (game, d) => game.adj[game.player].find(m => m.d === d)?.to;

export function movePlayer(game, to) {
  game.player = to;
  const e = game.emberAt[to];
  if (e >= 0) game.mask |= 1 << e;
  return checkEnd(game);
}

// Replays a planned line from a position, for the dotted trails of what the shade expects everyone to do.
export function replayLine(p, sh, rootAgent, pv) {
  const pos = [p, ...sh], trails = pos.map(c => [c]);
  let a = rootAgent;
  for (const to of pv) { pos[a] = to; trails[a].push(to); a = (a + 1) % pos.length; }
  return trails;
}

// Every shade moves once, in order. Returns what the first shade thought, for the mind panel.
export function shadesTurn(game, opts) {
  const before = { p: game.player, sh: game.shades.slice() };
  let nodes = 0, plain = 0, first = null;
  for (let k = 0; k < game.shades.length; k++) {
    const res = decide(game, k + 1, { ...opts, withTree: k === 0 && opts.brain !== 'chase' });
    first = first || res; nodes += res.nodes; plain += res.plain;
    game.shades[k] = res.move;
    if (game.shades.includes(game.player)) break;
  }
  game.turn++;
  checkEnd(game);
  return { ...first, nodes, plain, from: before, trails: replayLine(before.p, before.sh, 1, first.pv), brain: opts.brain, depth: opts.depth };
}
