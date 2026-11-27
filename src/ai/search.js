import { COST, openNeighbors } from './grid.js';

export class Heap { // binary min-heap of [key, value]
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) {
    const a = this.a; a.push([k, v]);
    for (let i = a.length - 1; i > 0;) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
}

export const ALGOS = {
  bfs: { short: 'BFS', name: 'Breadth-first search', frontier: 'queue, first in first out', promise: 'fewest steps', text: 'Opens the labyrinth in rings, one step farther each time. Fewest steps, but it wades through water like stone.' },
  dfs: { short: 'DFS', name: 'Depth-first search', frontier: 'stack, last in first out', promise: 'none', text: 'Follows one corridor as deep as it goes and backs up only at dead ends. Rarely a good path.' },
  ucs: { short: 'UCS', name: 'Uniform-cost search', frontier: 'priority by g(n)', promise: 'cheapest path', text: 'Always extends the cheapest route so far. Water costs 5, so the light flows around it, in every direction.' },
  greedy: { short: 'Greedy', name: 'Greedy best-first search', frontier: 'priority by h(n)', promise: 'none', text: 'Rushes at the door by h(n), the Manhattan distance. Few cells opened, but dead ends and water fool it.' },
  astar: { short: 'A*', name: 'A* search', frontier: 'priority by g(n) + w·h(n)', promise: 'cheapest path at w = 1', text: 'Adds the cost so far, g, to a guess of what is left, h. The cheapest path, with far fewer cells than UCS.' },
};
export const ALGO_KEYS = Object.keys(ALGOS);

export const manhattan = (cols, a, b) => {
  const ac = a % cols, bc = b % cols;
  return Math.abs(ac - bc) + Math.abs((a - ac) / cols - (b - bc) / cols);
};

// Runs a whole search at once and records when each cell was discovered and expanded, and every push with its
// cost, so the animation can replay it and the frontier can be shown as it stood at any step.
export function runSearch(g, start, goal, algo, { weight = 1 } = {}) {
  const N = g.cells.length, cols = g.cols;
  const discovered = new Int32Array(N).fill(-1), expanded = new Int32Array(N).fill(-1);
  const parent = new Int32Array(N).fill(-1), gCost = new Float64Array(N).fill(Infinity);
  const h = i => manhattan(cols, i, goal);
  const evNode = [], evG = [], evStep = [];
  let push, pop, size, seq = 0, step = 0;
  if (algo === 'bfs') { const q = []; let head = 0; push = i => q.push(i); pop = () => q[head++]; size = () => q.length - head; }
  else if (algo === 'dfs') { const s = []; push = i => s.push(i); pop = () => s.pop(); size = () => s.length; }
  else {
    const heap = new Heap();
    const key = algo === 'ucs' ? (i, c) => c
      : algo === 'greedy' ? i => h(i)
      : (i, c) => c + weight * h(i) + h(i) * 1e-3; // A* breaks ties toward the smaller guess
    push = (i, c) => heap.push(key(i, c) + (seq++) * 1e-7, i); pop = () => heap.pop(); size = () => heap.size;
  }
  const record = (i, c) => { evNode.push(i); evG.push(c); evStep.push(step); };
  gCost[start] = 0; discovered[start] = 0; push(start, 0); record(start, 0);
  while (size()) {
    const cur = pop();
    if (expanded[cur] >= 0) continue; // a stale entry: this cell was already opened by a cheaper route
    expanded[cur] = step++;
    if (cur === goal) break;
    for (const n of openNeighbors(g, cur)) {
      if (expanded[n] >= 0) continue;
      const ng = gCost[cur] + COST[g.cells[n]];
      if (algo === 'bfs' || algo === 'greedy') { if (discovered[n] >= 0) continue; }
      else if (algo !== 'dfs' && ng >= gCost[n]) continue; // dfs always pushes again: the newest entry is popped first
      if (discovered[n] < 0) discovered[n] = step;
      gCost[n] = ng; parent[n] = cur; push(n, ng); record(n, ng);
    }
  }
  const found = expanded[goal] >= 0, path = [];
  if (found) for (let i = goal; i >= 0; i = parent[i]) path.unshift(i);
  return {
    algo, weight, start, goal, cols, discovered, expanded, gCost, steps: step, found, path,
    cost: found ? gCost[goal] : Infinity,
    ev: { node: Int32Array.from(evNode), g: Float64Array.from(evG), step: Int32Array.from(evStep) },
  };
}

// The frontier as it stood after T expansions, in the order the algorithm will open it.
export function frontierAt(run, T, limit = 5) {
  const { ev, expanded, algo, weight, goal, cols } = run, latest = new Map();
  for (let k = 0; k < ev.node.length && ev.step[k] <= T; k++) {
    const n = ev.node[k];
    if (expanded[n] >= 0 && expanded[n] < T) continue;
    latest.set(n, { i: n, g: ev.g[k], order: k });
  }
  const items = [...latest.values()].map(x => { const h = manhattan(cols, x.i, goal); return { ...x, h, f: x.g + weight * h }; });
  const by = {
    bfs: (a, b) => a.order - b.order,
    dfs: (a, b) => b.order - a.order,
    ucs: (a, b) => a.g - b.g || a.order - b.order,
    greedy: (a, b) => a.h - b.h || a.order - b.order,
    astar: (a, b) => a.f - b.f || a.h - b.h || a.order - b.order,
  }[algo];
  items.sort(by);
  return { size: items.length, next: items.slice(0, limit) };
}
