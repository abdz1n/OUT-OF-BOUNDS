import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import LightRays from './reactbits/LightRays.jsx';
import { reducedMotion } from '../game/draw.js';

// the rays' settings, shared with rays.html, which renders their still
export const RAYS = { raysOrigin: 'top-center', raysColor: '#f1c27d', raysSpeed: .6, lightSpread: .9, rayLength: 4, fadeDistance: 1.6,
  rayDensity: 1.1, glow: .8, haze: .3, atmosphere: .6, saturation: .9, intensity: 1.35, mouseInfluence: .12, cursorShadow: false };

// The page's one effect: lantern light falling into the dark, leaning toward the pointer. Its still (rays-still.webp)
// is the host's ground until the shader really draws, so a GPU that refuses the shader still shows the rays; the
// <img> copy under it is for scripts off, and stays at a third under the live rays as their soft base.
export default function LightFrame() {
  const box = useRef(null), still = reducedMotion();
  const [live, setLive] = useState(false);
  useEffect(() => {
    const img = box.current?.closest('.frame')?.querySelector('.light__still');
    if (img) gsap.set(img, { opacity: 0 }); // with scripts on, the host itself carries the still until the rays draw
    let n = 0;
    const id = setInterval(() => {
      const cv = box.current?.querySelector('canvas');
      if (cv && (cv.width !== 300 || cv.height !== 150)) { // a canvas starts at 300 x 150; LightRays sizes it once its shader links
        clearInterval(id); setLive(true);
        if (img) gsap.to(img, { opacity: .35, duration: still ? 0 : .8, delay: still ? 0 : .6, ease: 'power1.out' }); // a soft base under the live rays
      } else if (++n > 40) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, []);
  return (
    <div ref={box} style={{ position: 'absolute', inset: 0 }}>
      <LightRays {...RAYS} raysSpeed={still ? 0 : RAYS.raysSpeed} followMouse={!still} clickPulse={!still} intro={!still}
        style={live ? undefined : { background: 'url(rays-still.webp) center / cover no-repeat' }} />
    </div>
  );
}
