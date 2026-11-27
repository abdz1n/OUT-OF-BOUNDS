import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import ClickSpark from './reactbits/ClickSpark.jsx';
import CountUp from './reactbits/CountUp.jsx';
import { makeHunt, decide, shadesTurn, movePlayer, legalMove, replayLine, popcount, ARROWS, BRAINS } from '../ai/adversarial.js';
import { newSeed } from '../ai/rng.js';
import { drawHunt, drawTree, fit, cellAt, fmtV, WORLD, reducedMotion } from '../game/draw.js';
import { useTicker, fmt } from '../ui/store.js';

const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3, Space: 4, Period: 4 };
const TREE_COLORS = { ...WORLD, panel: '#181512' };
const cellXY = (i, cols) => ({ x: i % cols + .5, y: Math.floor(i / cols) + .5 });
const arrowBetween = (game, a, b) => { const m = game.adj[a].find(m => m.to === b); return m ? ARROWS[m.d] : '?'; };
const store = { get(k) { try { return JSON.parse(localStorage.getItem('lantern-best') || '{}')[k]; } catch { return undefined; } },
  set(k, v) { try { const all = JSON.parse(localStorage.getItem('lantern-best') || '{}'); all[k] = v; localStorage.setItem('lantern-best', JSON.stringify(all)); } catch { /* private window: no record kept */ } } };

export default function ShadowHunt() {
  const [opts, setOpts] = useState({ shades: 2, depth: 4, brain: 'minimax', order: true, auto: false });
  const [, redraw] = useState(0);
  const G = useRef(null), pos = useRef(null), mind = useRef(null), fx = useRef({ hint: null, hintA: 0, reveal: 1 });
  const busy = useRef(false), timer = useRef(0), optsRef = useRef(opts);
  optsRef.current = opts;
  const box = useRef(null), cv = useRef(null), tree = useRef(null), over = useRef(null), hud = useRef([]), inView = useRef(false);

  const place = () => {
    const g = G.current, cols = g.g.cols;
    pos.current = { player: cellXY(g.player, cols), shades: g.shades.map(s => cellXY(s, cols)) };
  };
  const glide = () => { // GSAP eases every piece to its new cell
    const g = G.current, cols = g.g.cols, d = reducedMotion() ? 0 : .16;
    gsap.to(pos.current.player, { ...cellXY(g.player, cols), duration: d, ease: 'power2.out', overwrite: true });
    pos.current.shades.forEach((p, k) => gsap.to(p, { ...cellXY(g.shades[k], cols), duration: d, ease: 'power2.out', overwrite: true }));
  };

  const paintTree = useCallback(() => {
    const el = tree.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight || 200, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!w) return;
    if (el.width !== Math.round(w * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
    const ctx = el.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTree(ctx, w, h, mind.current, { reveal: fx.current.reveal, colors: TREE_COLORS });
  }, []);

  // before the first move the panel already shows what Shade A plans from the start
  const preview = (o = optsRef.current) => {
    const g = G.current;
    if (o.brain === 'chase') { mind.current = null; return; }
    const res = decide(g, 1, { depth: o.depth, brain: o.brain, order: o.order, withTree: true });
    mind.current = { ...res, from: { p: g.player, sh: g.shades.slice() }, trails: replayLine(g.player, g.shades, 1, res.pv), brain: o.brain, depth: o.depth, preview: true };
  };
  const newGame = useCallback((o = optsRef.current) => {
    clearTimeout(timer.current); busy.current = false;
    G.current = makeHunt({ seed: newSeed(), shades: o.shades });
    place(); preview(o);
    if (over.current) over.current.hidden = true;
    redraw(n => n + 1); requestAnimationFrame(paintTree);
    if (o.auto) timer.current = setTimeout(autoStep, 500);
  }, []);
  if (!G.current) { G.current = makeHunt({ seed: 4242, shades: opts.shades }); place(); preview(opts); }

  const end = () => {
    const g = G.current, o = optsRef.current, key = `${o.shades}-${o.brain}-${o.depth}`;
    if (g.over === 'won' && !o.auto && !(store.get(key) <= g.turn)) store.set(key, g.turn);
    clearTimeout(timer.current); busy.current = false; redraw(n => n + 1);
    timer.current = setTimeout(() => { // let the last move play out first
      const el = over.current; if (!el) return;
      el.hidden = false;
      gsap.fromTo(el.firstElementChild, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: reducedMotion() ? 0 : .45, ease: 'power3.out' });
    }, 380);
  };

  const shadesThink = () => {
    const g = G.current, o = optsRef.current;
    mind.current = shadesTurn(g, { depth: o.depth, brain: o.brain, order: o.order });
    glide(); busy.current = false;
    fx.current.reveal = 0;
    gsap.to(fx.current, { reveal: 1, duration: reducedMotion() ? 0 : .5, ease: 'power2.out', onUpdate: paintTree, onComplete: paintTree });
    if (g.over) return end();
    redraw(n => n + 1);
    if (o.auto) timer.current = setTimeout(autoStep, 260);
  };

  const step = to => {
    const g = G.current;
    if (g.over || busy.current) return;
    const before = g.mask;
    movePlayer(g, to); glide();
    if (g.mask !== before) { // an ember picked up: its mark in the bar answers
      const k = Math.log2(g.mask ^ before), el = hud.current[k];
      if (el) gsap.fromTo(el, { scale: 1.8 }, { scale: 1, duration: .45, ease: 'power3.out' });
    }
    fx.current.hintA = 0;
    if (g.over) return end();
    busy.current = true; redraw(n => n + 1);
    timer.current = setTimeout(shadesThink, 170);
  };
  const autoStep = () => {
    const g = G.current, o = optsRef.current;
    if (!g.over && !busy.current && o.auto) step(decide(g, 0, { depth: o.depth, order: o.order }).move);
  };
  const tryDir = d => { const to = legalMove(G.current, d); if (to != null) step(to); };
  const hint = () => {
    const g = G.current, o = optsRef.current;
    if (g.over || busy.current) return;
    fx.current.hint = decide(g, 0, { depth: o.depth, order: o.order }).move;
    gsap.fromTo(fx.current, { hintA: 1 }, { hintA: 0, duration: 1.2, delay: 1, ease: 'power1.in' });
  };

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { inView.current = e.intersectionRatio > .5; }, { threshold: [0, .5, 1] });
    if (box.current) io.observe(box.current);
    const onKey = e => {
      if (!inView.current || e.ctrlKey || e.metaKey || e.altKey || e.target.matches?.('input, select, textarea')) return;
      const d = KEYS[e.code];
      if (d === undefined) return;
      e.preventDefault(); // also keeps the page and Space from scrolling while you play
      if (!e.repeat) tryDir(d);
    };
    addEventListener('keydown', onKey);
    const onResize = () => paintTree();
    addEventListener('resize', onResize);
    paintTree();
    return () => { io.disconnect(); removeEventListener('keydown', onKey); removeEventListener('resize', onResize); clearTimeout(timer.current); };
  }, []);

  useTicker(box, now => {
    const g = G.current, el = cv.current;
    if (!el) return;
    const f = fit(el, g.g.cols, g.g.rows);
    if (!f) return;
    const cs = f.w / g.g.cols, P = pos.current;
    drawHunt(f.ctx, f.w, g, { player: [P.player.x * cs, P.player.y * cs], shades: P.shades.map(s => [s.x * cs, s.y * cs]) },
      { now, trails: mind.current?.trails, hint: fx.current.hint, hintAlpha: fx.current.hintA });
  });

  const set = patch => {
    const o = { ...optsRef.current, ...patch };
    setOpts(o); optsRef.current = o;
    if ('shades' in patch) newGame(o);
    else if (G.current.turn === 0 && !G.current.over) { preview(o); requestAnimationFrame(paintTree); }
    if (patch.auto) setTimeout(autoStep, 0);
  };

  const onBoard = e => {
    const g = G.current, i = cellAt(cv.current, g.g, e);
    if (i < 0) return;
    const cols = g.g.cols, dx = i % cols - g.player % cols, dy = Math.floor(i / cols) - Math.floor(g.player / cols);
    tryDir(!dx && !dy ? 4 : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  };

  const g = G.current, m = mind.current, got = popcount(g.mask), recordTurns = store.get(`${opts.shades}-${opts.brain}-${opts.depth}`);
  const status = g.over ? '' : busy.current ? 'The shades are thinking' : opts.auto ? 'Autopilot is playing' : 'Your move';
  const saved = m && m.plain ? Math.round(100 * (1 - m.nodes / m.plain)) : 0;
  const ends = {
    caught: ['Caught in the maze', `A shade reached you on turn ${g.turn}, with ${got} of ${g.embers.length} embers.`],
    won: ['Six embers, game won', `All ${g.embers.length} embers in ${g.turn} turns against ${opts.brain} shades thinking ${opts.depth} plies ahead.`],
    draw: ['Dawn ends the game', 'Three hundred turns passed. The hunt ends in a draw.'],
  }[g.over] || ['', ''];
  let note = BRAINS.chase.line;
  if (m && m.tree) {
    const aMove = arrowBetween(g, m.from.sh[0], m.trails[1][1] ?? m.from.sh[0]);
    const you = m.trails[0].length > 1 ? arrowBetween(g, m.trails[0][0], m.trails[0][1]) : null;
    note = `Shade A ${m.preview ? 'plans to move' : 'moved'} ${aMove} and scores the position ${fmtV(m.value)} for you. ` + (you ? `It expects you to answer ${you}: the dotted trails show its line.` : m.brain === 'expectimax' ? 'It plans for the average of your replies.' : 'It did not look far enough ahead to predict your reply.');
  }

  return (
    <>
      <div className="hunt__panel span-6">
        <div className="mind">
          <p className="t-label">Inside Shade A's head · {opts.brain === 'chase' ? BRAINS.chase.name : `${BRAINS[opts.brain].name}, ${opts.depth} ${opts.depth === 1 ? 'ply' : 'plies'}`}</p>
          {m && m.brain === 'minimax' && m.plain > 0 && (
            <div className="mind__bars">
              <span>Alpha-beta checked <b className="mono"><CountUp to={m.nodes} separator="," duration={.6} trigger="load" /></b> of <b className="mono"><CountUp to={m.plain} separator="," duration={.6} trigger="load" /></b> positions, {saved}% skipped</span>
              <i className="bar" style={{ transform: `scaleX(${Math.max(.01, m.nodes / m.plain).toFixed(3)})` }} />
            </div>
          )}
          {m && m.brain === 'expectimax' && <p className="t-small">Expectimax checked <b className="mono">{fmt(m.nodes)}</b> positions: averages cannot be pruned.</p>}
          <p className="t-small">{note}</p>
          <canvas ref={tree} className="mind__tree" role="img" aria-label="The top two levels of Shade A's game tree" />
        </div>
        <div className="seg" role="group" aria-label="Shades and their brain">
          {[1, 2].map(n => <button key={n} type="button" className="chip" aria-pressed={opts.shades === n} onClick={() => set({ shades: n })}>{n} {n > 1 ? 'shades' : 'shade'}</button>)}
          <span className="seg__gap" aria-hidden="true" />
          {Object.entries(BRAINS).map(([k, b]) => <button key={k} type="button" className="chip" aria-pressed={opts.brain === k} onClick={() => set({ brain: k })}>{b.name}</button>)}
        </div>
        <label className="slider" htmlFor="hunt-depth"><span>Look-ahead: <b className="mono">{opts.brain === 'chase' ? 'none' : `${opts.depth} ${opts.depth === 1 ? 'ply' : 'plies'}`}</b></span>
          <input id="hunt-depth" type="range" min="1" max="8" value={opts.depth} disabled={opts.brain === 'chase'} onChange={e => set({ depth: +e.target.value })} />
        </label>
        <div className="hunt__row">
          <label className="check" htmlFor="hunt-order"><input id="hunt-order" type="checkbox" checked={opts.order} disabled={opts.brain !== 'minimax'} onChange={e => set({ order: e.target.checked })} /> Best moves first</label>
          <label className="check" htmlFor="hunt-auto"><input id="hunt-auto" type="checkbox" checked={opts.auto} onChange={e => set({ auto: e.target.checked })} /> Autopilot</label>
          <button type="button" className="chip" onClick={hint}>Get a hint</button>
          <button type="button" className="chip" onClick={() => newGame()}>New hunt</button>
        </div>
        <div className="pad" aria-label="Move">
          {[[0, '↑', 'Move up', '1/2'], [3, '←', 'Move left', '2/1'], [4, '·', 'Wait one turn', '2/2'], [1, '→', 'Move right', '2/3'], [2, '↓', 'Move down', '3/2']].map(([d, s, l, a]) => (
            <button key={d} type="button" className="chip" style={{ gridArea: a }} aria-label={l} onClick={() => tryDir(d)}>{s}</button>
          ))}
        </div>

      </div>

      <figure className="hunt__board span-6 start-7" ref={box}>
        <ClickSpark sparkColor={[WORLD.glow, WORLD.ember]} sparkCount={8} sparkRadius={20} sparkSize={8} duration={380}>
          <div className="board">
            <canvas ref={cv} onPointerDown={onBoard} role="img" aria-label={`Shadow hunt, turn ${g.turn}: ${got} of ${g.embers.length} embers collected`} />
            <div className="hunt__over" ref={over} hidden>
              <div><h3>{ends[0]}</h3><p>{ends[1]}</p><button type="button" className="chip" onClick={() => newGame()}>New hunt</button></div>
            </div>
          </div>
        </ClickSpark>
        <div className="hunt__hud">
          <span className="hunt__embers" aria-label={`${got} of ${g.embers.length} embers`}>
            {g.embers.map((_, k) => <i key={k} ref={el => { hud.current[k] = el; }} className={g.mask >> k & 1 ? 'is-got' : ''} />)}
          </span>
          <span className="mono">Turn {g.turn}{recordTurns ? ` · record ${recordTurns}` : ''}</span>
          <span className="mono" aria-live="polite">{status}</span>
        </div>
      </figure>
    </>
  );
}
