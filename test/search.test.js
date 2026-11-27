import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSearchMap, emptyHall, openNeighbors, COST, WALL } from '../src/ai/grid.js';
import { runSearch, frontierAt, ALGO_KEYS, manhattan } from '../src/ai/search.js';
import { rng, randInt } from '../src/ai/rng.js';

const pick = (g, rnd) => { const open = [...g.cells.keys()].filter(i => g.cells[i] !== WALL); return open[randInt(rnd, open.length)]; };

test('map 2026 is the same labyrinth every time', () => {
  const a = makeSearchMap(2026), b = makeSearchMap(2026);
  assert.deepEqual(a.g.cells, b.g.cells);
  assert.notDeepEqual(a.g.cells, makeSearchMap(7).g.cells);
});

test('every algorithm finds a valid path, and the optimal ones agree', () => {
  const rnd = rng(99);
  for (let k = 0; k < 40; k++) {
    const { g } = makeSearchMap(1 + k);
    const s = pick(g, rnd); let t; do t = pick(g, rnd); while (t === s);
    const runs = Object.fromEntries(ALGO_KEYS.map(a => [a, runSearch(g, s, t, a)]));
    for (const a of ALGO_KEYS) {
      const r = runs[a];
      assert.ok(r.found, `${a} found no path on a connected map`);
      assert.equal(r.path[0], s); assert.equal(r.path.at(-1), t);
      let cost = 0;
      for (let j = 1; j < r.path.length; j++) {
        assert.ok(openNeighbors(g, r.path[j - 1]).includes(r.path[j]), `${a} path jumps`);
        cost += COST[g.cells[r.path[j]]];
      }
      assert.equal(cost, r.cost, `${a} reported cost ${r.cost}, walked ${cost}`);
      assert.ok(r.cost >= runs.ucs.cost, `${a} beat the optimal UCS cost`);
      assert.ok(runs.bfs.path.length <= r.path.length, `${a} took fewer steps than BFS`);
    }
    assert.equal(runs.astar.cost, runs.ucs.cost, 'A* with w = 1 is not optimal');
    assert.ok(runs.astar.steps <= runs.ucs.steps + 2, 'A* opened clearly more cells than UCS');
    const w2 = runSearch(g, s, t, 'astar', { weight: 2 });
    assert.ok(w2.found && w2.cost >= runs.ucs.cost, 'weighted A* returned an impossible cost');
  }
});

test('an empty hall: BFS and A* both walk the Manhattan distance', () => {
  const g = emptyHall(15, 11), s = 15 + 1, t = 15 * 10 - 2;
  for (const a of ['bfs', 'astar', 'ucs']) assert.equal(runSearch(g, s, t, a).path.length - 1, manhattan(15, s, t));
});

test('a walled-off door: nobody finds a way, nothing crashes', () => {
  const g = emptyHall(9, 9), t = 9 * 7 + 7;
  for (const n of openNeighbors(g, t)) g.cells[n] = WALL;
  for (const a of ALGO_KEYS) { const r = runSearch(g, 10, t, a); assert.equal(r.found, false); assert.equal(r.cost, Infinity); }
});

test('the frontier view matches the search', () => {
  const { g, start, goal } = makeSearchMap(2026);
  for (const a of ALGO_KEYS) {
    const r = runSearch(g, start, goal, a);
    assert.deepEqual(frontierAt(r, 0).next.map(x => x.i), [start]);
    for (const T of [1, 10, Math.floor(r.steps / 2)]) {
      const f = frontierAt(r, T, 50);
      assert.ok(f.size > 0, `${a} has an empty frontier at ${T}`);
      for (const x of f.next) assert.ok(!(r.expanded[x.i] >= 0 && r.expanded[x.i] < T), `${a} lists an opened cell`);
      // a priority queue pops its smallest key next: the next cell opened is the first one listed
      if (a === 'ucs' || a === 'astar' || a === 'greedy') {
        const key = x => a === 'ucs' ? x.g : a === 'greedy' ? x.h : x.f;
        for (let j = 1; j < f.next.length; j++) assert.ok(key(f.next[j - 1]) <= key(f.next[j]) + 1e-9, `${a} frontier out of order`);
        const opened = [...r.expanded].indexOf(T);
        assert.equal(key(f.next[0]), key(f.next.find(x => x.i === opened)), `${a} would not open ${opened} next`);
      }
    }
  }
});
