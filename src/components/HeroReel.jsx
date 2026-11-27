import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { makeSearchMap } from '../ai/grid.js';
import { runSearch, ALGOS } from '../ai/search.js';
import { drawSearch, drawHud, WORLD, TAU } from '../game/draw.js';
import { useTicker, fmt } from '../ui/store.js';

// The hero's film, made in the engine: BFS, greedy and A* light the same labyrinth one after another.
// It plays on a click of the hero's play control and ends on the poster (A*'s finished search).
const SHOTS = [['bfs', 7], ['greedy', 3], ['astar', 4.5]];
const odd = n => (Math.round(n) | 1);

function mapFor(w, h) { // a labyrinth cut to the frame, so the grid fills it at any width
  const a = w / Math.max(1, h);
  return a >= 1 ? makeSearchMap(3, Math.max(21, odd(31 * a)), 31) : makeSearchMap(3, 21, Math.max(21, odd(21 / a)));
}

export default function HeroReel() {
  const cv = useRef(null), box = useRef(null);
  const R = useRef({ map: null, runs: null, shot: 'astar', t: 1e9, pathP: 1, tl: null, size: '', playing: false });

  const build = () => {
    const el = cv.current, r = R.current;
    const w = el.parentElement.clientWidth, h = el.parentElement.clientHeight, key = w >= h ? 'wide' : 'tall';
    if (r.map && r.size === key) return;
    r.size = key; r.map = mapFor(w, h);
    r.runs = Object.fromEntries(SHOTS.map(([a]) => [a, runSearch(r.map.g, r.map.start, r.map.goal, a)]));
    r.tl?.kill();
    const tl = gsap.timeline({ paused: true, onComplete: () => poster() });
    for (const [a, secs] of SHOTS) {
      tl.call(() => { r.shot = a; r.t = 0; r.pathP = 0; })
        .to(r, { t: r.runs[a].steps + 3 * TAU, duration: secs, ease: 'none' })
        .to(r, { pathP: 1, duration: .8, ease: 'power2.out' }, '-=0.4')
        .to({}, { duration: a === 'astar' ? 1.4 : .8 });
    }
    r.tl = tl;
  };
  const button = () => document.getElementById('reel-play');
  const label = playing => {
    const b = button(); if (!b) return;
    b.setAttribute('aria-pressed', playing);
    b.querySelector('[data-reel-label]').textContent = playing ? 'Pause the search' : 'Watch the search';
    b.querySelector('.i-play').toggleAttribute('hidden', playing);
    b.querySelector('.i-pause').toggleAttribute('hidden', !playing);
  };
  const poster = () => { const r = R.current; r.tl.pause(0); Object.assign(r, { shot: 'astar', t: 1e9, pathP: 1, playing: false }); label(false); };

  useEffect(() => {
    build(); poster();
    const b = button();
    // layout.js hides a film control with no video file; this one plays the engine's reel, so it stays
    if (b) requestAnimationFrame(() => { b.hidden = false; });
    const onClick = () => {
      build();
      const r = R.current; // our own flag: GSAP's isActive() is false until the first tick after play()
      if (r.playing) { r.tl.pause(); r.playing = false; label(false); }
      else { r.tl.play(); r.playing = true; label(true); }
    };
    b?.addEventListener('click', onClick);
    const ro = new ResizeObserver(() => { if (!R.current.playing) { build(); poster(); } });
    ro.observe(box.current);
    // the poster image under the canvas stays for scripts off; with the engine running, the canvas covers it
    box.current.closest('.hero__media')?.classList.add('has-reel');
    return () => { b?.removeEventListener('click', onClick); ro.disconnect(); R.current.tl?.kill(); };
  }, []);

  useTicker(box, now => {
    const el = cv.current, r = R.current;
    if (!el || !r.map) return;
    const w = el.parentElement.clientWidth, h = el.parentElement.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return;
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
    const ctx = el.getContext('2d'), { g } = r.map, cs = w / g.cols, run = r.runs[r.shot];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = WORLD.night; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.translate(0, Math.round((h - g.rows * cs) / 2));
    drawSearch(ctx, w, g, run, r.t, { start: r.map.start, goal: r.map.goal, now, pathP: r.pathP });
    ctx.restore();
    drawHud(ctx, w, ALGOS[r.shot].short, `${fmt(Math.min(Math.floor(r.t), run.steps))} cells`);
  });

  return <div className="reel__box" ref={box}><canvas ref={cv} aria-hidden="true" /></div>;
}
