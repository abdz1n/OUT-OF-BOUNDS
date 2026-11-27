import { rng, randInt } from './rng.js';

export const FLOOR = 0, WALL = 1, WATER = 2;
export const COST = [1, Infinity, 5]; // stone, wall, water

export const newGrid = (cols, rows, fill = WALL) => ({ cols, rows, cells: new Uint8Array(cols * rows).fill(fill) });
export const openCount = g => g.cells.reduce((n, c) => n + (c !== WALL), 0);

// the open cells next to i, always in the order up, right, down, left
export function openNeighbors(g, i) {
  const { cols, rows, cells } = g, c = i % cols, r = (i - c) / cols, out = [];
  if (r > 0 && cells[i - cols] !== WALL) out.push(i - cols);
  if (c < cols - 1 && cells[i + 1] !== WALL) out.push(i + 1);
  if (r < rows - 1 && cells[i + cols] !== WALL) out.push(i + cols);
  if (c > 0 && cells[i - 1] !== WALL) out.push(i - 1);
  return out;
}

// recursive backtracker on the odd cells, then some walls knocked out
export function carveMaze(g, loopRate, rnd) {
  const { cols, rows, cells } = g;
  cells.fill(WALL);
  const first = cols + 1, stack = [first];
  cells[first] = FLOOR;
  while (stack.length) {
    const cur = stack[stack.length - 1], c = cur % cols, r = (cur - c) / cols, opts = [];
    if (r > 2 && cells[cur - 2 * cols] === WALL) opts.push(-cols);
    if (c < cols - 3 && cells[cur + 2] === WALL) opts.push(1);
    if (r < rows - 3 && cells[cur + 2 * cols] === WALL) opts.push(cols);
    if (c > 2 && cells[cur - 2] === WALL) opts.push(-1);
    if (!opts.length) { stack.pop(); continue; }
    const d = opts[randInt(rnd, opts.length)];
    cells[cur + d] = FLOOR; cells[cur + 2 * d] = FLOOR; stack.push(cur + 2 * d);
  }
  // a perfect maze has exactly one route, so every algorithm would find the same one; loops make them differ
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    const i = r * cols + c;
    if (cells[i] !== WALL) continue;
    const h = cells[i - 1] !== WALL && cells[i + 1] !== WALL && cells[i - cols] === WALL && cells[i + cols] === WALL;
    const v = cells[i - cols] !== WALL && cells[i + cols] !== WALL && cells[i - 1] === WALL && cells[i + 1] === WALL;
    if ((h || v) && rnd() < loopRate) cells[i] = FLOOR;
  }
}

export function carveRooms(g, n, rnd) {
  for (let k = 0; k < n; k++) {
    const w = 3 + 2 * randInt(rnd, 3), h = 3 + 2 * randInt(rnd, 2);
    const c0 = 1 + 2 * randInt(rnd, Math.floor((g.cols - w) / 2)), r0 = 1 + 2 * randInt(rnd, Math.floor((g.rows - h) / 2));
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) g.cells[r * g.cols + c] = FLOOR;
  }
}

export function addWater(g, pools, keep, rnd) {
  for (let k = 0; k < pools; k++) {
    let seed; do seed = randInt(rnd, g.cells.length); while (g.cells[seed] !== FLOOR);
    const size = 5 + randInt(rnd, 12), q = [seed];
    for (let n = 0; q.length && n < size;) {
      const i = q.splice(randInt(rnd, q.length), 1)[0];
      if (g.cells[i] !== FLOOR || keep.includes(i)) continue;
      g.cells[i] = WATER; n++;
      for (const j of openNeighbors(g, i)) if (g.cells[j] === FLOOR) q.push(j);
    }
  }
}

export const DEFAULT_SEED = 2026;

// the lantern starts top left, the door is bottom right
export function makeSearchMap(seed = DEFAULT_SEED, cols = 41, rows = 25) {
  const rnd = rng(seed), g = newGrid(cols, rows, WALL);
  carveMaze(g, .28, rnd);
  carveRooms(g, Math.max(2, Math.round(cols * rows / 205)), rnd);
  const start = cols + 1, goal = cols * (rows - 1) - 2;
  addWater(g, Math.max(2, Math.round(cols * rows / 146)), [start, goal], rnd);
  return { g, start, goal, seed };
}

export function emptyHall(cols, rows) {
  const g = newGrid(cols, rows, FLOOR);
  for (let i = 0; i < g.cells.length; i++) {
    const c = i % cols, r = (i - c) / cols;
    if (!r || !c || r === rows - 1 || c === cols - 1) g.cells[i] = WALL;
  }
  return g;
}
