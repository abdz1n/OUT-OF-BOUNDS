import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { runSearch, ALGOS, ALGO_KEYS } from '../ai/search.js';
import { drawSearch, drawHud, fit } from '../game/draw.js';
import { searchStore, useSearchMap, useTicker, fmt } from '../ui/store.js';

const SPEED = 5, ordinal = n => ['1st', '2nd', '3rd', '4th', '5th'][n - 1];

export default function SearchRace() {
  const map = useSearchMap();
  const box = useRef(null), cvs = useRef([]), badges = useRef([]);
  const R = useRef({ runs: [], t: 1e9, playing: false, shown: -1, done: new Set() });
  const [, redraw] = useState(0);
  const best = useRef(Infinity);

  const compute = () => {
    const s = searchStore.get();
    R.current.runs = ALGO_KEYS.map(a => runSearch(s.g, s.start, s.goal, a));
    best.current = R.current.runs[ALGO_KEYS.indexOf('ucs')].cost;
  };
  if (!R.current.runs.length) compute();
  useEffect(() => { compute(); if (!R.current.playing) R.current.t = 1e9; redraw(n => n + 1); }, [map.version]);

  const race = () => {
    compute();
    Object.assign(R.current, { t: 0, playing: true, done: new Set() });
    badges.current.forEach(b => b && gsap.set(b, { autoAlpha: 0 }));
    redraw(n => n + 1);
  };

  useTicker(box, (now, dt) => {
    const r = R.current, maxSteps = Math.max(...r.runs.map(x => x.steps));
    if (r.playing) {
      r.t += SPEED * dt / 16.7;
      if (r.t >= maxSteps + 40 * SPEED) { r.t = 1e9; r.playing = false; }
    }
    r.runs.forEach((run, k) => {
      const el = cvs.current[k];
      if (!el) return;
      const f = fit(el, map.g.cols, map.g.rows);
      if (!f) return;
      const lit = Math.min(Math.floor(r.t), run.steps), place = lit >= run.steps ? 1 + r.runs.filter(y => y.steps < run.steps).length : 0;
      drawSearch(f.ctx, f.w, map.g, run, r.t, { start: map.start, goal: map.goal, now, pathP: (r.t - run.steps) / (40 * SPEED) });
      drawHud(f.ctx, f.w, ALGOS[run.algo].short, place ? `${fmt(run.steps)} · ${ordinal(place)}` : fmt(lit));
      if (place && r.playing && !r.done.has(k)) { // a finisher's place lands in the scoreboard
        r.done.add(k);
        const b = badges.current[k];
        if (b) gsap.fromTo(b, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: .35, ease: 'power3.out' });
      }
    });
    const st = Math.min(Math.floor(r.t), maxSteps + 1);
    if (st !== r.shown) { r.shown = st; redraw(n => n + 1); }
  });

  const r = R.current, maxLit = Math.max(...r.runs.map(x => x.steps));
  return (
    <>
      {r.runs.map((run, k) => (
        <div className="board board--race span-4" key={run.algo} ref={k === 0 ? box : undefined}>
          <canvas ref={el => { cvs.current[k] = el; }} role="img" aria-label={`${ALGOS[run.algo].name} on the same labyrinth`} />
        </div>
      ))}
      <div className="race__score span-4">
        <table className="mini mini--score">
          <thead><tr><th>Algorithm</th><th>Cells opened</th><th>Path cost</th></tr></thead>
          <tbody>
            {r.runs.map((run, k) => {
              const lit = Math.min(Math.floor(r.t), run.steps), done = lit >= run.steps;
              const place = 1 + r.runs.filter(y => y.steps < run.steps).length;
              return (
                <tr key={run.algo}>
                  <td>{ALGOS[run.algo].short} <span className="race__place" ref={el => { badges.current[k] = el; }} style={{ visibility: done ? 'visible' : 'hidden' }}>{ordinal(place)}</span></td>
                  <td>{fmt(lit)}<span className="bar" style={{ transform: `scaleX(${(lit / maxLit).toFixed(3)})` }} /></td>
                  <td>{!done ? '…' : !run.found ? 'no way' : run.cost === best.current ? `${run.cost} ✓` : `${run.cost} (+${run.cost - best.current})`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button type="button" className="chip" onClick={race}>Race again</button>
      </div>
    </>
  );
}
