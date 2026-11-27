import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHunt, search, decide, evaluate, shadesTurn, movePlayer, legalMove } from '../src/ai/adversarial.js';
import { rng, randInt } from '../src/ai/rng.js';

const run = (game, brain, prune, order, agent, depth) => {
  const ctx = { brain, prune, order, nodes: 0, pv: [] };
  return { v: search(game, ctx, game.player, game.shades, game.mask, agent, depth, -Infinity, Infinity, null, 0), nodes: ctx.nodes };
};

function randomState(k) {
  const rnd = rng(500 + k), game = makeHunt({ seed: 1 + k, shades: 1 + k % 2 });
  const open = [...game.g.cells.keys()].filter(i => game.adj[i]);
  game.player = open[randInt(rnd, open.length)];
  game.shades = game.shades.map(() => open[randInt(rnd, open.length)]);
  game.mask = randInt(rnd, game.full + 1);
  return { game, rnd };
}

test('alpha-beta returns exactly the minimax value, with and without move ordering', () => {
  for (let k = 0; k < 40; k++) {
    const { game, rnd } = randomState(k);
    const depth = 1 + randInt(rnd, 6), agent = randInt(rnd, game.shades.length + 1);
    const plain = run(game, 'minimax', false, false, agent, depth);
    for (const order of [false, true]) {
      const ab = run(game, 'minimax', true, order, agent, depth);
      assert.equal(ab.v, plain.v, `alpha-beta ${ab.v} vs minimax ${plain.v} at depth ${depth}`);
      assert.ok(ab.nodes <= plain.nodes, 'alpha-beta searched more than minimax');
    }
  }
});

test('expectimax never scores a shade position above minimax', () => {
  // the lantern's nodes become averages, and an average is never above the best reply
  for (let k = 0; k < 30; k++) {
    const { game, rnd } = randomState(k);
    const depth = 2 + randInt(rnd, 4);
    assert.ok(run(game, 'expectimax', false, true, 1, depth).v <= run(game, 'minimax', false, true, 1, depth).v + 1e-9);
  }
});

test('decide: the tree agrees with the search, and chase walks closer', () => {
  for (let k = 0; k < 15; k++) {
    const { game } = randomState(k);
    for (const brain of ['minimax', 'expectimax']) {
      const res = decide(game, 1, { depth: 4, brain, withTree: true });
      assert.ok(game.adj[game.shades[0]].some(m => m.to === res.move), `${brain} chose an illegal move`);
      assert.ok(res.tree.children.length > 0 && res.nodes <= res.plain);
    }
    const before = game.dist[game.shades[0] * game.N + game.player];
    const chase = decide(game, 1, { brain: 'chase' });
    assert.ok(game.dist[chase.move * game.N + game.player] <= Math.max(0, before - 1) || before === 0);
  }
});

test('evaluation: caught is worst, every ember is best', () => {
  const game = makeHunt({ seed: 3 });
  assert.ok(evaluate(game, game.shades[0], game.shades, 0, 0) <= -1000);
  assert.ok(evaluate(game, game.player, game.shades, game.full, 0) >= 1000);
});

test('a whole autopilot game ends and keeps its rules', () => {
  for (const brain of ['minimax', 'expectimax', 'chase']) {
    const game = makeHunt({ seed: 11, shades: 2 });
    while (!game.over) {
      const me = decide(game, 0, { depth: 3 });
      assert.ok(game.adj[game.player].some(m => m.to === me.move));
      if (movePlayer(game, me.move)) break;
      shadesTurn(game, { depth: 3, brain, order: true });
    }
    assert.ok(['won', 'caught', 'draw'].includes(game.over), `${brain} game did not end`);
    assert.equal(legalMove(game, 4), game.player, 'waiting is always legal');
  }
});
