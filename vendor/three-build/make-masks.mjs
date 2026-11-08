// Regenerates the photograph masks used by js/cr3d-hero.js (img/hero-mask-*.jpg) and prints the horizon table.
// The masks (open water, scrub, surf, keep-out around lettering) are computed from the photographs' own pixels;
// doing that once here, instead of in every visitor's browser, keeps page start-up light.
// Run again whenever img/bluff-statement*.jpg or img/fall-cover-1400.jpg change.
//   node vendor/three-build/make-masks.mjs        (needs Node 18+ and Playwright with Chromium)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');   // CommonJS resolution honours NODE_PATH and global installs

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const types = { '.js': 'text/javascript', '.jpg': 'image/jpeg', '.html': 'text/html', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  if (req.url === '/__blank') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>masks</title>'); }
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;

const JOBS = [
  { key: 'landscape', src: '/img/bluff-statement.jpg' },
  { key: 'portrait', src: '/img/bluff-statement-portrait.jpg' },
  { key: 'fall', src: '/img/fall-cover-1400.jpg', fixedHz: -0.45 },   // the collection crop has no horizon
];
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/__blank`);    // a same-origin page, so the photographs can be read back
const out = await page.evaluate(async ({ jobs, port }) => {
  const m = await import(`http://127.0.0.1:${port}/js/cr3d-hero.js`);
  const res = {};
  for (const j of jobs) {
    const img = new Image(); img.src = j.src;
    await img.decode();
    const mk = m.buildMask(img, j.fixedHz);
    // three greyscale tiles side by side (water | scrub | surf), 256 px per tile: small, and no colour channels to bleed
    const packed = m.packMask(mk.canvas, 256);
    res[j.key] = { horizon: +mk.horizon.toFixed(4), png: packed.toDataURL('image/jpeg', 0.9) };
  }
  return res;
}, { jobs: JOBS, port });
for (const [k, v] of Object.entries(out)) {
  fs.writeFileSync(path.join(root, `img/hero-mask-${k}.jpg`), Buffer.from(v.png.split(',')[1], 'base64'));
  console.log(k, 'horizon', v.horizon, `${fs.statSync(path.join(root, `img/hero-mask-${k}.jpg`)).size} bytes`);
}
console.log('HORIZONS =', JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.horizon]))));
await browser.close(); server.close();
