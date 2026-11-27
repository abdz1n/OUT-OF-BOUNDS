// Canvas drawing for the labyrinth, the hunt and the shades' game tree. Pure functions: state in, pixels out.
import { WALL, WATER } from '../ai/grid.js';
import { ARROWS } from '../ai/adversarial.js';

// The game world's own palette: cool slate stone, lantern amber, sky-blue shades.
export const WORLD = {
  night: '#080b11', stone: '#111722', stone2: '#141b27', wall: '#232b3a', wallTop: '#37445b',
  ember: '#ffb347', glow: '#ffe6ad', water: '#123b46', waterHi: '#3b8b95', shade: '#8fd0ff',
  ink: '#efe9dc', muted: '#9aa3b5', line: '#2a3344', panel: '#181512',
};
export const MONO = '"Martian Mono", ui-monospace, Consolas, monospace';
export const TAU = 24; // how many expansions the fresh glow takes to cool

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const rgba = (hex, a) => { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16},${v >> 8 & 255},${v & 255},${a})`; };
export const center = (i, cols, cs) => [(i % cols + .5) * cs, (Math.floor(i / cols) + .5) * cs];

// Sizes a canvas to its parent's width at the screen's pixel ratio; returns null while hidden.
export function fit(cv, cols, rows) {
  const w = cv.parentElement.clientWidth;
  if (!w) return null;
  const h = Math.round(w * rows / cols), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; cv.style.height = h + 'px'; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export function cellAt(cv, g, e) {
  const r = cv.getBoundingClientRect();
  const c = Math.floor((e.clientX - r.left) / r.width * g.cols), rr = Math.floor((e.clientY - r.top) / r.height * g.rows);
  return c < 0 || rr < 0 || c >= g.cols || rr >= g.rows ? -1 : rr * g.cols + c;
}

function tiles(ctx, g, cs, x0f = 0) {
  const { cols, rows, cells } = g;
  for (let r = 0; r < rows; r++) {
    const y0 = Math.round(r * cs), y1 = Math.round((r + 1) * cs);
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c, x0 = Math.round(c * cs) + x0f, x1 = Math.round((c + 1) * cs) + x0f, cell = cells[i];
      if (cell === WALL) {
        ctx.fillStyle = WORLD.wall; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        if (r > 0 && cells[i - cols] !== WALL) { ctx.fillStyle = WORLD.wallTop; ctx.fillRect(x0, y0, x1 - x0, Math.max(1, Math.round(cs * .16))); }
        continue;
      }
      ctx.fillStyle = cell === WATER ? WORLD.water : (r + c) & 1 ? WORLD.stone2 : WORLD.stone;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      if (cell === WATER && cs >= 9) {
        const yy = y0 + (y1 - y0) * .55;
        ctx.strokeStyle = WORLD.waterHi; ctx.globalAlpha = .55; ctx.lineWidth = Math.max(1, cs * .07);
        ctx.beginPath(); ctx.moveTo(x0 + cs * .2, yy);
        ctx.quadraticCurveTo(x0 + cs * .35, yy - cs * .16, x0 + cs * .5, yy);
        ctx.quadraticCurveTo(x0 + cs * .65, yy + cs * .16, x0 + cs * .8, yy);
        ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
  }
}

export function drawLantern(ctx, x, y, cs, now) {
  const R = cs * (1.5 + (reducedMotion() ? 0 : .1 * Math.sin(now / 240)));
  const gr = ctx.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, rgba(WORLD.ember, .55)); gr.addColorStop(1, rgba(WORLD.ember, 0));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
  ctx.fillStyle = WORLD.glow; ctx.beginPath(); ctx.arc(x, y, Math.max(2, cs * .26), 0, 7); ctx.fill();
  ctx.strokeStyle = WORLD.ember; ctx.lineWidth = Math.max(1, cs * .07); ctx.stroke();
}

export function drawDoor(ctx, x, y, cs) {
  const w = cs * .62, h = cs * .8, top = y - h / 2 + w / 2;
  ctx.beginPath(); ctx.moveTo(x - w / 2, y + h / 2); ctx.lineTo(x - w / 2, top); ctx.arc(x, top, w / 2, Math.PI, 0); ctx.lineTo(x + w / 2, y + h / 2); ctx.closePath();
  ctx.fillStyle = WORLD.night; ctx.fill();
  ctx.strokeStyle = WORLD.glow; ctx.lineWidth = Math.max(1.2, cs * .1); ctx.stroke();
}

export function drawPath(ctx, path, cols, cs, p) {
  if (path.length < 2 || p <= 0) return;
  const seg = Math.min(1, p) * (path.length - 1), n = Math.floor(seg), f = seg - n;
  ctx.beginPath();
  let [x, y] = center(path[0], cols, cs); ctx.moveTo(x, y);
  for (let i = 1; i <= n; i++) { [x, y] = center(path[i], cols, cs); ctx.lineTo(x, y); }
  if (n < path.length - 1) { const [x2, y2] = center(path[n + 1], cols, cs); ctx.lineTo(x + (x2 - x) * f, y + (y2 - y) * f); }
  ctx.lineJoin = ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2, cs * .26);
  ctx.strokeStyle = WORLD.glow; ctx.shadowColor = WORLD.ember; ctx.shadowBlur = cs * .9; ctx.stroke(); ctx.shadowBlur = 0;
}

// The labyrinth with a search replayed to t expansions: opened cells glow and cool, the frontier flickers,
// the path draws in. opts: { start, goal, now, pathP, hover, next }.
export function drawSearch(ctx, w, g, run, t, opts) {
  const { start, goal, now = 0, pathP = 0, hover = -1, next = -1 } = opts;
  const { cols, rows, cells } = g, cs = w / cols, T = run ? Math.min(Math.floor(t), run.steps) : -1;
  const searching = run && T < run.steps, still = reducedMotion();
  ctx.fillStyle = WORLD.night; ctx.fillRect(0, 0, w, rows * cs);
  tiles(ctx, g, cs);
  if (run) {
    for (let r = 0; r < rows; r++) {
      const y0 = Math.round(r * cs), y1 = Math.round((r + 1) * cs);
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (cells[i] === WALL) continue;
        const x0 = Math.round(c * cs), x1 = Math.round((c + 1) * cs), e = run.expanded[i];
        if (e >= 0 && e < T) {
          ctx.globalAlpha = cells[i] === WATER ? .2 : .26; ctx.fillStyle = WORLD.ember; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          const fresh = Math.exp(-(t - e) / TAU);
          if (fresh > .02) { ctx.globalAlpha = fresh * .8; ctx.fillStyle = WORLD.glow; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
          ctx.globalAlpha = 1;
        } else if (searching && run.discovered[i] >= 0 && run.discovered[i] <= T) {
          const fr = cs * (.2 + (still ? 0 : .06 * Math.sin(now / 110 + i * 1.7)));
          ctx.fillStyle = WORLD.glow; ctx.beginPath(); ctx.arc((x0 + x1) / 2, (y0 + y1) / 2, Math.max(1.2, fr), 0, 7); ctx.fill();
        }
      }
    }
    if (run.found) drawPath(ctx, run.path, cols, cs, pathP);
  }
  if (next >= 0 && searching) { // the cell the algorithm opens next
    const [x, y] = center(next, cols, cs);
    ctx.strokeStyle = WORLD.glow; ctx.lineWidth = Math.max(1.5, cs * .1);
    ctx.beginPath(); ctx.arc(x, y, cs * .62, 0, 7); ctx.stroke();
  }
  if (hover >= 0) {
    const x0 = Math.round((hover % cols) * cs), y0 = Math.round(Math.floor(hover / cols) * cs);
    ctx.strokeStyle = WORLD.ink; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + .75, y0 + .75, Math.round(cs) - 1.5, Math.round(cs) - 1.5);
  }
  drawDoor(ctx, ...center(goal, cols, cs), cs);
  drawLantern(ctx, ...center(start, cols, cs), cs, now);
}

// A small in-engine readout in a corner of the reel: the algorithm and how many cells it has opened.
export function drawHud(ctx, w, label, value) {
  const pad = Math.round(w * .018), size = Math.max(11, Math.round(w * .0125));
  ctx.font = `500 ${size}px ${MONO}`;
  const text = `${label}  ${value}`, tw = ctx.measureText(text).width;
  const bw = tw + size * 1.6, bh = size * 2.3, x = w - pad - bw, y = pad;
  ctx.fillStyle = rgba(WORLD.night, .82); ctx.beginPath(); ctx.roundRect(x, y, bw, bh, bh / 2); ctx.fill();
  ctx.strokeStyle = rgba(WORLD.glow, .35); ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = WORLD.glow; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(text, x + size * .8, y + bh / 2 + .5);
}

// The hunt: the labyrinth, the lantern's light, the embers, the shades and the line the shade expects.
// pos: { player: [x, y], shades: [[x, y]...] } in pixels, already eased by the caller.
export function drawHunt(ctx, w, game, pos, opts) {
  const { now = 0, trails = null, hint = null, hintAlpha = 0 } = opts;
  const g = game.g, cols = g.cols, cs = w / cols, still = reducedMotion();
  const [px, py] = pos.player;
  ctx.fillStyle = WORLD.night; ctx.fillRect(0, 0, w, g.rows * cs);
  tiles(ctx, g, cs);
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < cols; c++) { // the lantern only lights what is near
    const d = Math.hypot((c + .5) * cs - px, (r + .5) * cs - py) / cs, dark = Math.min(.55, Math.max(0, (d - 2.4) / 5));
    if (dark <= 0) continue;
    ctx.globalAlpha = dark; ctx.fillStyle = WORLD.night;
    ctx.fillRect(Math.round(c * cs), Math.round(r * cs), Math.round((c + 1) * cs) - Math.round(c * cs), Math.round((r + 1) * cs) - Math.round(r * cs));
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(px, py, 0, px, py, cs * 4);
  halo.addColorStop(0, rgba(WORLD.ember, .24)); halo.addColorStop(1, rgba(WORLD.ember, 0));
  ctx.fillStyle = halo; ctx.fillRect(px - cs * 4, py - cs * 4, cs * 8, cs * 8);
  ctx.globalCompositeOperation = 'source-over';

  if (trails && !game.over) {
    ctx.setLineDash([1, cs * .22]); ctx.lineCap = 'round'; ctx.lineWidth = cs * .09;
    trails.forEach((tr, a) => {
      if (tr.length < 2) return;
      ctx.strokeStyle = rgba(a === 0 ? WORLD.ember : WORLD.shade, .75);
      ctx.beginPath(); tr.forEach((cell, j) => { const [x, y] = center(cell, cols, cs); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  game.embers.forEach((e, j) => {
    if (game.mask >> j & 1) return;
    const [x, y] = center(e, cols, cs), s = cs * .17 * (1 + (still ? 0 : .12 * Math.sin(now / 250 + j)));
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.shadowColor = WORLD.ember; ctx.shadowBlur = cs * .6; ctx.fillStyle = WORLD.ember; ctx.fillRect(-s, -s, 2 * s, 2 * s);
    ctx.restore();
  });

  if (hint != null && hintAlpha > 0) { // minimax's suggestion for the lantern
    const [hx, hy] = center(hint, cols, cs);
    ctx.globalAlpha = hintAlpha; ctx.strokeStyle = WORLD.glow; ctx.lineWidth = cs * .1;
    ctx.beginPath(); ctx.arc(hx, hy, cs * .38, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(hx, hy); ctx.stroke(); ctx.globalAlpha = 1;
  }

  ctx.shadowColor = WORLD.ember; ctx.shadowBlur = cs * .8;
  ctx.fillStyle = WORLD.glow; ctx.beginPath(); ctx.arc(px, py, cs * .24, 0, 7); ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = WORLD.ember; ctx.lineWidth = cs * .06; ctx.stroke();

  pos.shades.forEach(([sx, sy0], j) => {
    const sy = sy0 + (still ? 0 : Math.sin(now / 300 + j * 2) * cs * .05);
    const body = ctx.createRadialGradient(sx, sy, 0, sx, sy, cs * .62);
    body.addColorStop(0, rgba(WORLD.shade, .95)); body.addColorStop(.45, rgba(WORLD.shade, .45)); body.addColorStop(1, rgba(WORLD.shade, 0));
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(sx, sy, cs * .62, 0, 7); ctx.fill();
    const ang = Math.atan2(py - sy, px - sx), ex = Math.cos(ang) * cs * .1, ey = Math.sin(ang) * cs * .1, qx = -Math.sin(ang) * cs * .1, qy = Math.cos(ang) * cs * .1;
    ctx.fillStyle = WORLD.night;
    for (const sgn of [1, -1]) { ctx.beginPath(); ctx.arc(sx + ex + sgn * qx, sy + ey + sgn * qy, cs * .06, 0, 7); ctx.fill(); }
    if (pos.shades.length > 1) {
      ctx.font = `500 ${Math.round(cs * .26)}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = WORLD.ink; ctx.fillText('AB'[j], sx + cs * .38, sy - cs * .38);
    }
  });
}

function tri(ctx, x, y, r, up) {
  ctx.beginPath();
  if (up) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * .72); ctx.lineTo(x - r, y + r * .72); }
  else { ctx.moveTo(x, y + r); ctx.lineTo(x + r, y - r * .72); ctx.lineTo(x - r, y - r * .72); }
  ctx.closePath();
}

export const fmtV = v => v <= -900 ? 'caught' : v >= 900 ? 'win' : String(Math.round(v));

// The top two plies of Shade A's last decision. reveal 0..1 grows the tree from the root (GSAP drives it).
// Fill = the share of the branch alpha-beta still searched; dashed = pruned, never searched.
export function drawTree(ctx, w, h, mind, { reveal = 1, colors }) {
  const C = colors;
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const t = mind && mind.tree;
  if (!t) {
    ctx.fillStyle = C.muted; ctx.font = `13px ${MONO}`;
    ctx.fillText(mind && mind.brain === 'chase' ? 'Chase shades build no tree' : 'No decision yet', w / 2, h / 2);
    return;
  }
  const expect = mind.brain === 'expectimax', pv = mind.pv;
  const Y = [18, h * .47, h * .84], kids = t.children, slot = w / kids.length;
  const colorOf = agent => agent === 0 ? C.ember : C.shade;
  const level1 = Math.min(1, reveal * 2), level2 = Math.max(0, reveal * 2 - 1);
  const edge = (x1, y1, x2, y2, hot, color, pruned, k) => {
    if (k <= 0) return;
    ctx.setLineDash(pruned ? [3, 4] : []); ctx.strokeStyle = hot ? color : C.line; ctx.lineWidth = hot ? 2.5 : 1.2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k); ctx.stroke(); ctx.setLineDash([]);
  };
  const node = (x, y, r, n, hot) => {
    const pruned = n.ab === 0, color = colorOf(n.agent);
    if (n.agent === 0 && expect) { ctx.beginPath(); ctx.arc(x, y, r * .85, 0, 7); }
    else tri(ctx, x, y, r, n.agent === 0);
    if (!pruned) { ctx.globalAlpha = .25 + .75 * Math.min(1, n.ab / Math.max(1, n.plain)); ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.setLineDash(pruned ? [2, 3] : []); ctx.strokeStyle = pruned ? C.muted : hot ? C.ink : color; ctx.lineWidth = hot ? 2 : 1.2; ctx.stroke(); ctx.setLineDash([]);
  };
  const label = (txt, x, y, color, size) => {
    ctx.font = `${size}px ${MONO}`; ctx.lineWidth = 3; ctx.strokeStyle = C.panel; ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y);
  };
  kids.forEach((c, k) => {
    const x1 = slot * (k + .5), hot = c.to === pv[0];
    edge(w / 2, Y[0], x1, Y[1], hot, colorOf(t.agent), c.ab === 0, level1);
    c.children.forEach((gc, j) => {
      const x2 = slot * k + slot * (j + .5) / c.children.length;
      edge(x1, Y[1], x2, Y[2], hot && gc.to === pv[1], colorOf(c.agent), gc.ab === 0, level2);
    });
  });
  kids.forEach((c, k) => {
    const x1 = slot * (k + .5), hot = c.to === pv[0], sub = slot / Math.max(1, c.children.length);
    if (level1 >= 1) label(ARROWS[c.d], (w / 2 + x1) / 2, (Y[0] + Y[1]) / 2, hot ? C.ink : C.muted, 12);
    if (level2 > 0) c.children.forEach((gc, j) => {
      const x2 = slot * k + sub * (j + .5);
      ctx.globalAlpha = level2; node(x2, Y[2], 6, gc, hot && gc.to === pv[1]); ctx.globalAlpha = 1;
      if (level2 >= 1 && sub >= 26) label(gc.ab === 0 ? '✂' : fmtV(gc.value).replace('caught', '✕').replace('win', '★'), x2, Y[2] + 16, gc.ab === 0 ? C.muted : C.ink, 10);
    });
    if (level1 > 0) {
      ctx.globalAlpha = level1; node(x1, Y[1], 10, c, hot); ctx.globalAlpha = 1;
      if (level1 >= 1) label(fmtV(c.value), x1, Y[1] + 21, hot ? C.ink : C.muted, 11);
    }
  });
  node(w / 2, Y[0] + 2, 11, { agent: t.agent, ab: 1, plain: 1 }, true);
  ctx.textAlign = 'left'; label('Shade A', 4, Y[0] + 2, C.muted, 10);
}
