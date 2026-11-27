import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import ClickSpark from './reactbits/ClickSpark.jsx';
import { WALL, FLOOR, WATER, openCount, makeSearchMap, emptyHall } from '../ai/grid.js';
import { runSearch, frontierAt, ALGOS, ALGO_KEYS, manhattan } from '../ai/search.js';
import { newSeed } from '../ai/rng.js';
import { drawSearch, fit, cellAt, TAU, WORLD } from '../game/draw.js';
import { searchStore, useSearchMap, useTicker, fmt } from '../ui/store.js';

const TOOLS = [[WALL, 'Wall'], [WATER, 'Water'], [FLOOR, 'Erase']];
const xy = (i, cols) => `${i % cols}, ${Math.floor(i / cols)}`;
const PORTRAIT = 560; // under this width the board turns a quarter, so a phone shows it tall and large

// cellAt for a board that may be turned: screen (x, y) on the tall board is cell column y, row from the right edge
function cellOn(el, g, e) {
  const r = el.getBoundingClientRect();
  if (r.width >= PORTRAIT) return cellAt(el, g, e);
  const cs = r.width / g.rows, c = Math.floor((e.clientY - r.top) / cs), row = Math.floor((r.right - e.clientX) / cs);
  return c < 0 || row < 0 || c >= g.cols || row >= g.rows ? -1 : row * g.cols + c;
}

export default function SearchLab() {
  const map = useSearchMap();
  const [algo, setAlgo] = useState('astar');
  const [weight, setWeight] = useState(1);
  const [speed, setSpeed] = useState(4);
  const [tool, setTool] = useState(WALL);
  const [hover, setHover] = useState(-1);
  const [, redraw] = useState(0); // the panel re-renders when the step count moves
  const cv = useRef(null), box = useRef(null);
  const A = useRef({ run: null, t: 0, playing: false, pathP: 0, drag: null, shown: -1 });
  const best = useRef(Infinity);

  const start = (a = algo, w = weight) => {
    const s = searchStore.get(), st = A.current;
    st.run = runSearch(s.g, s.start, s.goal, a, { weight: w });
    st.t = 0; st.pathP = 0; st.playing = true;
    gsap.killTweensOf(st);
    redraw(n => n + 1);
  };
  const settle = () => { // jump to the finished picture: used after an edit, and when a run ends
    const st = A.current;
    st.t = 1e9; st.playing = false; gsap.killTweensOf(st); st.pathP = 1;
    redraw(n => n + 1);
  };

  useEffect(() => { const s = searchStore.get(); best.current = runSearch(s.g, s.start, s.goal, 'ucs').cost; }, [map.version]);
  useEffect(() => { start(); }, []); // the lab opens with A* already lighting the way

  const onEdit = () => {
    const s = searchStore.get(), st = A.current;
    best.current = runSearch(s.g, s.start, s.goal, 'ucs').cost;
    if (st.run) { st.run = runSearch(s.g, s.start, s.goal, algo, { weight }); settle(); }
    searchStore.bump();
  };

  useTicker(box, (now, dt) => {
    const st = A.current, run = st.run, el = cv.current;
    if (!el) return;
    if (st.playing && run) {
      st.t += speed * dt / 16.7;
      if (st.t >= run.steps && st.pathP === 0) { st.pathP = .001; gsap.to(st, { pathP: 1, duration: .8, ease: 'power2.out' }); }
      if (st.t >= run.steps + 5 * TAU && st.pathP >= 1) settle();
    }
    const tall = el.parentElement.clientWidth < PORTRAIT;
    const f = tall ? fit(el, map.g.rows, map.g.cols) : fit(el, map.g.cols, map.g.rows);
    if (!f) return;
    const T = run ? Math.min(Math.floor(st.t), run.steps) : 0;
    const next = run && T < run.steps ? frontierAt(run, T, 1).next[0]?.i ?? -1 : -1;
    const o = { start: map.start, goal: map.goal, now, pathP: st.pathP, hover, next };
    if (tall) { f.ctx.save(); f.ctx.translate(f.w, 0); f.ctx.rotate(Math.PI / 2); drawSearch(f.ctx, f.h, map.g, run, st.t, o); f.ctx.restore(); }
    else drawSearch(f.ctx, f.w, map.g, run, st.t, o);
    if (T !== st.shown) { st.shown = T; redraw(n => n + 1); }
  });

  const paint = i => {
    const s = searchStore.get();
    if (i === s.start || i === s.goal || s.g.cells[i] === tool) return;
    s.g.cells[i] = tool; onEdit();
  };
  const onDown = e => {
    const s = searchStore.get(), i = cellOn(cv.current, s.g, e);
    if (i < 0) return;
    cv.current.setPointerCapture(e.pointerId);
    A.current.drag = i === s.start ? 'start' : i === s.goal ? 'goal' : 'paint';
    if (A.current.drag === 'paint') paint(i);
  };
  const onMove = e => {
    const s = searchStore.get(), i = cellOn(cv.current, s.g, e), d = A.current.drag;
    setHover(i);
    if (i < 0 || !d) { cv.current.style.cursor = i === s.start || i === s.goal ? 'grab' : 'crosshair'; return; }
    if (d === 'paint') return paint(i);
    if (s.g.cells[i] === WALL || i === s.start || i === s.goal) return;
    searchStore.set({ [d]: i }); onEdit();
  };
  const onUp = () => { A.current.drag = null; };

  const st = A.current, run = st.run, T = run ? Math.min(Math.floor(st.t), run.steps) : 0, done = run && T >= run.steps;
  const front = run && !done ? frontierAt(run, T, 4) : null;
  const a = ALGOS[algo], cols = map.g.cols;
  const cost = !done ? '—' : !run.found ? 'no way through' : run.cost === best.current ? `${run.cost}, the cheapest` : `${run.cost}, ${run.cost - best.current} over`;
  const hv = hover >= 0 && map.g.cells[hover] !== WALL ? hover : -1;
  const inspect = hv < 0 ? null : {
    g: run && run.gCost[hv] < Infinity && run.discovered[hv] >= 0 && run.discovered[hv] <= T ? run.gCost[hv] : null,
    h: manhattan(cols, hv, map.goal),
    opened: run && run.expanded[hv] >= 0 && run.expanded[hv] < T ? run.expanded[hv] + 1 : null,
  };

  return (
    <>
      <div className="lab__panel span-6">
        <div className="lab__card">
          <h3>{a.name}</h3>
          <p>{a.text}</p>
          <dl className="kv"><dt>Frontier</dt><dd>{a.frontier}</dd><dt>Guarantee</dt><dd>{algo === 'astar' && weight > 1 ? 'none at w above 1' : a.promise}</dd></dl>
        </div>
        <div className="seg" role="group" aria-label="Search algorithm">
          {ALGO_KEYS.map(k => <button key={k} type="button" className="chip" aria-pressed={k === algo} onClick={() => { setAlgo(k); start(k); }}>{ALGOS[k].short}</button>)}
        </div>
        {algo === 'astar' && (
          <label className="slider" htmlFor="lab-w"><span>Weight on the guess: <b className="mono">w = {weight}</b></span>
            <input id="lab-w" type="range" min="1" max="3" step="0.5" value={weight} onChange={e => { const w = +e.target.value; setWeight(w); start('astar', w); }} />
          </label>
        )}
        <div className="lab__run">
          <button type="button" className="chip" onClick={() => start()}>Search again</button>
          <button type="button" className="chip" disabled={!run || done} onClick={() => { st.playing = !st.playing; redraw(n => n + 1); }}>{st.playing ? 'Pause' : 'Resume'}</button>
          <button type="button" className="chip" disabled={!run || done} onClick={() => { st.playing = false; st.t = Math.floor(st.t) + 1; redraw(n => n + 1); }}>Step</button>
        </div>
        <label className="slider" htmlFor="lab-speed"><span>Speed: <b className="mono">{speed}×</b></span>
          <input id="lab-speed" type="range" min="1" max="40" value={speed} onChange={e => setSpeed(+e.target.value)} />
        </label>
        <div className="lab__read">
          <dl className="kv lab__stats">
            <dt>Opened</dt><dd>{fmt(T)} of {fmt(openCount(map.g))}</dd>
            <dt>Path</dt><dd>{done && run.found ? `${run.path.length - 1} steps` : '—'}</dd>
            <dt>Cost</dt><dd className={done && run.found && run.cost > best.current ? 'is-over' : ''}>{cost}</dd>
          </dl>
          <div className="lab__front">
            <p className="t-label">{front ? `Frontier, next of ${fmt(front.size)}` : done ? 'The door is open' : 'Pick an algorithm'}</p>
            {front && (
              <table className="mini">
                <thead><tr><th>Cell</th><th>g</th><th>h</th><th>{algo === 'astar' ? 'f' : algo === 'bfs' || algo === 'dfs' ? 'order' : 'key'}</th></tr></thead>
                <tbody>{front.next.map((x, j) => (
                  <tr key={x.i} className={j === 0 ? 'is-next' : ''}><td>{xy(x.i, cols)}</td><td>{x.g}</td><td>{x.h}</td><td>{algo === 'astar' ? x.f : algo === 'ucs' ? x.g : algo === 'greedy' ? x.h : j + 1}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <figure className="lab__board span-6 start-7" ref={box}>
        <ClickSpark sparkColor={[WORLD.glow, WORLD.ember]} sparkCount={9} sparkRadius={22} sparkSize={9} duration={420}>
          <div className="board">
            <canvas ref={cv} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => setHover(-1)}
              role="img" aria-label={`Labyrinth map ${map.seed}: ${a.name} has opened ${T} cells`} />
          </div>
        </ClickSpark>
        <div className="lab__tools">
          <div className="seg" role="group" aria-label="Paint">
            {TOOLS.map(([v, label]) => <button key={label} type="button" className="chip" aria-pressed={tool === v} onClick={() => setTool(v)}>{label}</button>)}
          </div>
          <div className="seg">
            <button type="button" className="chip" onClick={() => { searchStore.set(makeSearchMap(newSeed())); start(); }}>New labyrinth</button>
            <button type="button" className="chip" onClick={() => { const s = searchStore.get(); searchStore.set({ g: emptyHall(s.g.cols, s.g.rows), seed: 0 }); onEdit(); }}>Empty hall</button>
          </div>
          <span className="lab__inspect mono">
            {inspect ? <>cell {xy(hv, cols)} · g {inspect.g ?? '—'} · h {inspect.h}{algo === 'astar' && inspect.g != null ? ` · f ${inspect.g + weight * inspect.h}` : ''}{inspect.opened ? ` · opened ${inspect.opened}` : ''}</> : map.seed ? `Map ${map.seed}` : 'Empty hall'}
          </span>
        </div>
      </figure>
    </>
  );
}
