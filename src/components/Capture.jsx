import { useEffect, useRef } from 'react';
import { makeSearchMap, WALL } from '../ai/grid.js';
import { runSearch, manhattan } from '../ai/search.js';
import { makeHunt, decide, evaluate } from '../ai/adversarial.js';
import { drawSearch, drawTree, drawPath, drawDoor, drawLantern, center, WORLD, rgba } from '../game/draw.js';

// Still in-engine shots for the "where the intelligence is" cards, drawn once from real searches,
// on a labyrinth cut to the panel's shape so the grid fills it.
let aspect = 1.4;
const small = () => { const rows = 15, cols = Math.max(13, Math.round(rows * aspect) | 1); return makeSearchMap(31, cols, rows); };
const TREE_COLORS = { ...WORLD, panel: '#181512' };

const SHOTS = {
  frontier(ctx, w, h) { // BFS halfway: the opened cells and the ring of frontier cells waiting
    const m = small(), run = runSearch(m.g, m.start, m.goal, 'bfs');
    drawSearch(ctx, w, m.g, run, Math.floor(run.steps * .45), { start: m.start, goal: m.goal });
  },
  guess(ctx, w, h) { // h(n): every open cell tinted by its Manhattan distance to the door, A*'s path over it
    const m = small(), run = runSearch(m.g, m.start, m.goal, 'astar'), { g } = m, cs = w / g.cols;
    drawSearch(ctx, w, g, null, 0, { start: m.start, goal: m.goal });
    const far = manhattan(g.cols, m.start, m.goal);
    for (let i = 0; i < g.cells.length; i++) {
      if (g.cells[i] === WALL) continue;
      const c = i % g.cols, r = (i - c) / g.cols;
      ctx.fillStyle = rgba(WORLD.ember, .08 + .5 * (1 - manhattan(g.cols, i, m.goal) / far));
      ctx.fillRect(Math.round(c * cs), Math.round(r * cs), Math.round((c + 1) * cs) - Math.round(c * cs), Math.round((r + 1) * cs) - Math.round(r * cs));
    }
    drawPath(ctx, run.path, g.cols, cs, 1);
    drawDoor(ctx, ...center(m.goal, g.cols, cs), cs);
    drawLantern(ctx, ...center(m.start, g.cols, cs), cs, 0);
  },
  plan(ctx, w, h) { tree(ctx, w, h, { seed: 9, shades: 2, depth: 3, order: true }); },
  prune(ctx, w, h) { tree(ctx, w, h, { seed: 9, shades: 1, depth: 4, order: false }); },
  score(ctx, w, h) { // the evaluation function as a map: how good each cell would be for the lantern, shades fixed
    const game = makeHunt({ seed: 4242, shades: 2 }), { g } = game;
    const cs = Math.min(w / g.cols, h / g.rows), ox = (w - g.cols * cs) / 2, oy = (h - g.rows * cs) / 2;
    const vals = new Map();
    for (let i = 0; i < g.cells.length; i++) if (g.cells[i] !== WALL && !game.shades.includes(i)) vals.set(i, evaluate(game, i, game.shades, 0, 0));
    const lo = Math.min(...vals.values()), hi = Math.max(...vals.values());
    for (let i = 0; i < g.cells.length; i++) {
      const c = i % g.cols, r = (i - c) / g.cols, x = ox + c * cs, y = oy + r * cs;
      if (g.cells[i] === WALL) { ctx.fillStyle = WORLD.wall; ctx.fillRect(x, y, cs + .5, cs + .5); continue; }
      const k = vals.has(i) ? (vals.get(i) - lo) / Math.max(1, hi - lo) : 0;
      ctx.fillStyle = WORLD.stone; ctx.fillRect(x, y, cs + .5, cs + .5);
      ctx.fillStyle = k > .5 ? rgba(WORLD.ember, (k - .5) * 1.5) : rgba(WORLD.shade, (.5 - k) * 1.3);
      ctx.fillRect(x, y, cs + .5, cs + .5);
    }
    for (const e of game.embers) { const [x, y] = center(e, g.cols, cs); ctx.save(); ctx.translate(ox + x, oy + y); ctx.rotate(Math.PI / 4); ctx.fillStyle = WORLD.glow; ctx.fillRect(-cs * .22, -cs * .22, cs * .44, cs * .44); ctx.restore(); }
    for (const s of game.shades) { const [x, y] = center(s, g.cols, cs); ctx.fillStyle = WORLD.shade; ctx.beginPath(); ctx.arc(ox + x, oy + y, cs * .34, 0, 7); ctx.fill(); }
  },
};
const OWN = new Set(['plan', 'prune', 'score']); // these lay themselves out; the two labyrinths are centred below

function tree(ctx, w, h, { seed, shades, depth, order }) {
  const game = makeHunt({ seed, shades });
  const res = decide(game, 1, { depth, order, withTree: true });
  ctx.fillStyle = TREE_COLORS.panel; ctx.fillRect(0, 0, w, h);
  drawTree(ctx, w, h, { ...res, brain: 'minimax' }, { colors: TREE_COLORS });
}

export default function Capture({ kind }) {
  const cv = useRef(null);
  useEffect(() => {
    const el = cv.current, paint = () => {
      const w = el.parentElement.clientWidth, h = el.parentElement.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (!w || !h) return;
      el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
      const ctx = el.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = WORLD.night; ctx.fillRect(0, 0, w, h);
      aspect = w / h;
      if (OWN.has(kind)) SHOTS[kind](ctx, w, h);
      else { const m = small(), cs = w / m.g.cols; ctx.save(); ctx.translate(0, Math.round((h - m.g.rows * cs) / 2)); SHOTS[kind](ctx, w, h); ctx.restore(); }
    };
    paint();
    const ro = new ResizeObserver(paint); ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [kind]);
  return <canvas ref={cv} aria-hidden="true" />;
}
