import { useSyncExternalStore, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { makeSearchMap } from '../ai/grid.js';

// The labyrinth the search lab and the race share. Painting mutates g.cells in place, then bump() tells everyone.
export const MAP_SEED = 28;
const listeners = new Set();
let state = { ...makeSearchMap(MAP_SEED), version: 0 };

export const searchStore = {
  get: () => state,
  set(patch) { state = { ...state, ...patch, version: state.version + 1 }; listeners.forEach(f => f()); },
  bump() { this.set({}); },
  subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
};
export const useSearchMap = () => useSyncExternalStore(searchStore.subscribe, searchStore.get);

// Runs fn on GSAP's ticker while the element is on screen (the page's one clock, which also drives Lenis).
export function useTicker(ref, fn) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let on = false;
    const tick = (time, dt) => fnRef.current(time * 1000, dt);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !on) { gsap.ticker.add(tick); on = true; }
      else if (!e.isIntersecting && on) { gsap.ticker.remove(tick); on = false; }
    }, { rootMargin: '200px 0px' });
    io.observe(el);
    return () => { io.disconnect(); if (on) gsap.ticker.remove(tick); };
  }, [ref]);
}

export const fmt = n => n.toLocaleString('en-US');
