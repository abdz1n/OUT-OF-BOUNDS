// Renders the page's two stills from the game's own code with a headless Edge or Chrome:
//   public/key-art.webp    the hero's poster (poster.html: A* on the reel's labyrinth)
//   public/rays-still.webp the light rays as a still, for a GPU that refuses their shader (rays.html; needs ffmpeg)
// Run it with the dev server up: npm run dev, then npm run posters.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.argv[2] || 'http://localhost:5173';
const browser = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean).find(p => existsSync(p));
if (!browser) throw new Error('No Edge or Chrome found: set BROWSER to its path');

const run = (args, opts = {}) => {
  const profile = mkdtempSync(join(tmpdir(), 'lantern-posters-'));
  try { return execFileSync(browser, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', `--user-data-dir=${profile}`, ...args], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'], ...opts }); }
  finally { rmSync(profile, { recursive: true, force: true }); }
};

// 1. the key art: the page draws it into a canvas and prints it as a data URL
const dom = run(['--virtual-time-budget=8000', '--dump-dom', `${base}/poster.html`]);
const m = dom.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/);
if (!m) throw new Error('poster.html drew nothing: is the dev server running?');
writeFileSync('public/key-art.webp', Buffer.from(m[1], 'base64'));
console.log('public/key-art.webp');

// 2. the rays: a screenshot of the live shader at the light frame's size, twice over, then WebP
const png = resolve(tmpdir(), `lantern-rays-${process.pid}.png`);
run(['--window-size=728,560', '--force-device-scale-factor=2', '--virtual-time-budget=3000', `--screenshot=${png}`, `${base}/rays.html`]);
try {
  execFileSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-quality', '78', 'public/rays-still.webp']);
  console.log('public/rays-still.webp');
} catch { console.log(`ffmpeg not found: the rays still is at ${png}; convert it to public/rays-still.webp`); }
finally { if (existsSync('public/rays-still.webp')) rmSync(png, { force: true }); }
