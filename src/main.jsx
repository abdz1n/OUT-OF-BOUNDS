import 'lenis/dist/lenis.css';
import './styles/game.css';
import { createRoot } from 'react-dom/client';
import { gsap } from 'gsap';
import Lenis from 'lenis';
import HeroReel from './components/HeroReel.jsx';
import SearchLab from './components/SearchLab.jsx';
import SearchRace from './components/SearchRace.jsx';
import ShadowHunt from './components/ShadowHunt.jsx';
import LightFrame from './components/LightFrame.jsx';
import Capture from './components/Capture.jsx';

// The page itself is static HTML (index.html); the game's parts mount into it as islands.
const mount = (sel, el) => document.querySelectorAll(sel).forEach(node => createRoot(node).render(el(node)));
mount('#hero-reel', () => <HeroReel />);
mount('#search-lab', () => <SearchLab />);
mount('#search-race', () => <SearchRace />);
mount('#light-rays', () => <LightFrame />);
mount('#hunt-game', () => <ShadowHunt />);
mount('[data-capture]', n => <Capture kind={n.dataset.capture} />);

// Smooth scrolling with Lenis on GSAP's clock (the one ticker the game uses too). Off under reduced motion.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const lenis = new Lenis({ duration: 1.1, anchors: true, smoothWheel: true });
  window.lenis = lenis; // the design kit's checker scrolls through window.lenis
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
