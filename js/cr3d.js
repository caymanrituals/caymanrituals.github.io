/* Cayman Rituals: the 3D layer (three.js).
 *
 * Everything here is decoration over the finished page: it adds aria-hidden canvases and styles, never text, never
 * layout. The page is complete without it, and this file does nothing at all when:
 *   - the visitor asked for reduced motion (live: the page's own script adds .static), or Save-Data is on,
 *     or the device reports under 2 GB of memory, or
 *   - WebGL is missing or fails (every scene fails on its own and leaves the page as it was).
 * three.js (vendor/three-cr.min.js) is only fetched once those checks pass, after the page has loaded.
 *
 * Scenes (each is a stage: a host element, a module that draws it, and rules for when it lives):
 *   hero      the living photograph            cr3d-hero.js
 *   fall      the same shader on the collection photo
 *   bluff, caymanite, thatch, ironshore, trench, take, floor
 *             scent and light drifting with scroll   cr3d-atmos.js
 *   sea       the living waterline             cr3d-sea.js
 *   pieces    a vessel that turns with the rail      cr3d-vessels.js
 *   studies   a lit candle, glass, stone, brass in each study overlay   cr3d-vessels.js
 *
 * Rules every stage obeys (the brief): devicePixelRatio capped at 2; a pixel budget per canvas; only visible stages
 * draw; stages are created when they come near and destroyed when far, so a phone never holds more than a few
 * WebGL contexts; slow frames step the resolution down; a lost context removes its canvas.
 */
import { doc, root, DEBUG, log, mq, clamp, palette } from './cr3d-kit.js';

const BOOT_T0 = performance.now();

function canRun() {
  if (mq('(prefers-reduced-motion: reduce)') || root.classList.contains('static')) return false;
  const c = navigator.connection;
  if ((c && c.saveData) || (navigator.deviceMemory && navigator.deviceMemory < 2)) return false;
  // A free test only: creating a throwaway GL context here would cost a long task on every page view. The first real
  // renderer is the probe; if it cannot be created every scene stands down (see webglDead).
  if (!('WebGL2RenderingContext' in window)) return false;
  return true;
}

/* ------------------------------------------------------------------ stages */

const $ = (sel, from) => (from || doc).querySelector(sel);
const atmos = (id, preset, extra) => ({
  id, host: () => doc.getElementById(id), mod: () => import('./cr3d-atmos.js'), preset,
  alpha: true, scale: 0.6, ...extra,
});

const STAGES = [
  { id: 'hero', host: () => doc.getElementById('hero'), mod: () => import('./cr3d-hero.js'), eager: true, alpha: false, power: 'high-performance' },
  { id: 'fall', host: () => $('#fall .fall-win'), mod: () => import('./cr3d-hero.js'), variant: 'fall', alpha: false, power: 'high-performance' },
  atmos('bluff', 'bluff'), atmos('caymanite', 'caymanite'), atmos('thatch', 'thatch'),
  atmos('ironshore', 'ironshore'), atmos('trench', 'trench', { scale: 0.75 }),
  atmos('take', 'take', { scale: 0.75 }), atmos('floor', 'floor', { scale: 0.75 }),
  atmos('carry', 'carry', { host: () => $('.campaign'), scale: 0.7 }),
  { id: 'sea', host: () => doc.getElementById('sealevel'), mod: () => import('./cr3d-sea.js'), alpha: true, scale: 1 },
  { id: 'pieces', host: () => doc.getElementById('pieces'), mod: () => import('./cr3d-vessels.js'), kind: 'pieces', alpha: true, power: 'high-performance' },
];
['keeper', 'slab', 'rope', 'edp', 'candle'].forEach((k) => STAGES.push({
  id: 'study-' + k, host: () => doc.getElementById('sample-' + k), mod: () => import('./cr3d-vessels.js'), kind: 'study', study: k,
  alpha: true, power: 'high-performance',
}));

/* ------------------------------------------------------------------ shared state */

let T = null;                      // the three.js namespace
let webglDead = false;             // a renderer could not be created: no WebGL here, leave the page as it was
const live = new Map();            // stage -> instance
const mobile = mq('(max-width: 899px)');
const MAX_LIVE = mobile ? 4 : 6;
const pointer = { x: 0, y: 0, sx: 0, sy: 0, mouse: false };
const frame = { t: 0, dt: 0, scrollY: 0, vw: 0, vh: 0, pointer, mobile };
let looping = false;
let lastNow = 0;
let slow = 0;
let counted = 0;

function dprCap() { return Math.min(2, window.devicePixelRatio || 1); }

/* The stylesheet is a real file (the carry page's Content-Security-Policy allows no inline styles). It is awaited
   before any canvas or stage box is placed, so nothing can ever appear unstyled and shift the layout. */
function loadCss() {
  if (doc.querySelector('link[data-cr3d]')) return Promise.resolve();
  return new Promise((res) => {
    const l = doc.createElement('link');
    l.rel = 'stylesheet'; l.href = new URL('./cr3d.css', import.meta.url).href; l.dataset.cr3d = '';
    l.onload = res; l.onerror = res;
    doc.head.appendChild(l);
  });
}

/* The vessel stages live inside panels that are hidden when the page loads (the "Coming soon" tab, the study overlays).
   Their boxes are created here, up front, so that when a panel opens nothing moves. */
function reserveStages() {
  const pieces = doc.getElementById('pieces');
  const head = pieces && $('.tb-head', pieces);
  // (on a phone the box takes room in the flow: if that panel is already open when we get here, adding it would push the
  // rail down in front of the visitor, so that one scene sits out)
  const open = pieces && pieces.offsetParent !== null;
  if (head && !(open && mobile)) { const w = doc.createElement('div'); w.className = 'cr3d-stage'; w.setAttribute('aria-hidden', 'true'); w.dataset.stage = 'pieces'; head.after(w); }
  ['keeper', 'slab', 'rope', 'edp', 'candle'].forEach((k) => {
    const sm = doc.getElementById('sample-' + k);
    const txt = sm && $('.sample-txt', sm);
    // right after the study's text: on a phone the object comes before the diagram, on a wide screen it is placed absolutely and takes no space
    if (txt) { const w = doc.createElement('div'); w.className = 'cr3d-stage'; w.setAttribute('aria-hidden', 'true'); w.dataset.stage = 'study-' + k; txt.after(w); }
  });
}

/* ------------------------------------------------------------------ instance lifecycle */

function place(st, host, canvas) {
  if (st.kind === 'pieces' || st.kind === 'study') {
    const box = $('.cr3d-stage[data-stage="' + st.id + '"]') || $('.cr3d-stage[data-stage="pieces"]');
    if (box) box.appendChild(canvas);
    return;
  }
  if (st.id === 'hero') {
    const zoom = $('.hero-zoom', host);
    const pic = zoom && ($('picture', zoom) || zoom.lastElementChild);
    if (pic) { pic.after(canvas); return; }
  }
  if (st.id === 'fall') { const pic = $('picture', host); if (pic) pic.after(canvas); else host.appendChild(canvas); return; }
  if (st.id === 'sea') { canvas.style.zIndex = '0'; host.prepend(canvas); return; }
  if (st.id === 'carry') {
    const img = $('img', host);
    if (!img) { host.prepend(canvas); return; }
    host.classList.add('cr3d-lift');
    img.after(canvas);
    const fit = () => { canvas.style.height = img.offsetHeight + 'px'; canvas.style.bottom = 'auto'; };   // CSSOM: allowed under any CSP
    fit();
    if ('ResizeObserver' in window) { st._fit = new ResizeObserver(fit); st._fit.observe(img); }
    return;
  }
  host.classList.add('cr3d-lift');
  host.prepend(canvas);
}

function sizeOf(inst) {
  const c = inst.canvas;
  const w = Math.max(1, c.clientWidth);
  const h = Math.max(1, c.clientHeight);
  const budget = (inst.st.maxPx || (mobile ? 1.5e6 : 3.7e6));
  const pr = Math.min(dprCap() * inst.scale * inst.q, Math.sqrt(budget / (w * h)));
  return { w, h, pr: Math.max(0.5, pr) };
}

function resize(inst) {
  if (inst.dead) return;
  const s = sizeOf(inst);
  inst.renderer.setPixelRatio(s.pr);
  inst.renderer.setSize(s.w, s.h, false);
  inst.size = s;
  if (inst.scene && inst.scene.resize) inst.scene.resize(s.w, s.h, s.pr);
}

/* Scenes start one at a time, each after the browser has had a chance to paint, so two heavy steps (a shader compile,
   a texture upload) never land in the same task. */
let chain = Promise.resolve();
const breathe = () => new Promise((res) => setTimeout(res, 0));
function mount(st) {
  if (st.inst || st.busy || st.failed || webglDead) return;
  st.busy = true;
  chain = chain.then(breathe).then(() => doMount(st)).catch(() => {});
}

async function doMount(st) {
  try {
    if (!st.want) return;
    const mod = await st.mod();
    if (!st.want) return;                              // it left again while the module loaded
    const host = st.host();
    if (!host) { st.failed = true; return; }
    if ((st.kind === 'pieces' || st.kind === 'study') && !$('.cr3d-stage[data-stage="' + st.id + '"]')) { st.failed = true; return; }
    const canvas = doc.createElement('canvas');
    canvas.className = 'cr3d-c cr3d-' + st.id;
    canvas.setAttribute('aria-hidden', 'true');
    place(st, host, canvas);
    let renderer;
    const trr = performance.now();
    try {
      renderer = new T.WebGLRenderer({
        canvas, antialias: false, alpha: st.alpha !== false, premultipliedAlpha: true,
        powerPreference: st.power || 'low-power',
      });
    } catch (e) { canvas.remove(); st.failed = true; webglDead = true; STAGES.forEach((x) => { x.failed = true; giveBack(x); }); return; }
    renderer.setClearColor(0x000000, 0);
    log('renderer', st.id, Math.round(performance.now() - trr) + 'ms');
    await breathe();
    const inst = { st, host, canvas, renderer, scene: null, visible: false, dead: false, q: 1, scale: st.scale || 1, on: false, size: null };
    // a context lost on its own (not our own unmount, which also fires this event) means the GPU gave up: stop for good
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (inst.dead || st.inst !== inst) return; st.failed = true; unmount(st); }, false);
    st.inst = inst; live.set(st, inst);
    const ctx = { T, host, canvas, renderer, stage: st, inst, frame, pal: palette(), mobile, log };
    const tc = performance.now();
    const scene = await mod.create(ctx);
    log('create', st.id, Math.round(performance.now() - tc) + 'ms');
    if (inst.dead) { try { if (scene && scene.dispose) scene.dispose(); } catch (e) { /* ignore */ } return; }
    if (!scene) { unmount(st); return; }
    inst.scene = scene;
    resize(inst);
    log('ready', st.id, Math.round(performance.now() - tc) + 'ms');
    inst.ro = 'ResizeObserver' in window ? new ResizeObserver(() => { inst.rz = true; wake(); }) : null;
    if (inst.ro) inst.ro.observe(canvas);
    inst.visible = !!st.near;
    log('mounted', st.id, inst.size);
    // keep the number of live contexts down: drop the farthest idle stage
    while (live.size > MAX_LIVE) {
      let far = null; let fd = -1;
      live.forEach((i, s) => {
        if (s === st) return;
        const r = i.host.getBoundingClientRect();
        const d = Math.abs((r.top + r.bottom) / 2 - frame.vh / 2);
        if (!i.visible && d > fd) { fd = d; far = s; }
      });
      if (!far) break;
      unmount(far);
    }
    wake();
    await breathe();
  } catch (e) {
    st.failed = true; log('stage failed', st.id, e);
    giveBack(st);
  } finally { st.busy = false; }
}

function giveBack(st) {
  if (st.kind !== 'pieces' && st.kind !== 'study') return;
  const box = $('.cr3d-stage[data-stage="' + st.id + '"]');
  if (box && !box.querySelector('canvas')) box.style.display = 'none';
}

function unmount(st) {
  const inst = st.inst;
  if (!inst) return;
  inst.dead = true;
  try { if (inst.ro) inst.ro.disconnect(); } catch (e) { /* ignore */ }
  try { if (st._fit) { st._fit.disconnect(); st._fit = null; } } catch (e) { /* ignore */ }
  try { if (inst.scene && inst.scene.dispose) inst.scene.dispose(); } catch (e) { /* ignore */ }
  try { inst.renderer.dispose(); inst.renderer.forceContextLoss(); } catch (e) { /* ignore */ }
  if (inst.canvas && inst.canvas.parentNode) inst.canvas.remove();
  live.delete(st); st.inst = null;
  log('unmounted', st.id);
}

/* ------------------------------------------------------------------ when does a stage live, when does it draw */

function watch(st) {
  const host = st.host();
  if (!host) return;
  st.want = false; st.near = false;
  const setWant = (v) => { st.want = v; if (v) mount(st); else if (st.inst) unmount(st); };
  // (a stage dropped to make room comes back as soon as it is near again)
  const setNear = (v) => { st.near = v; if (st.inst) st.inst.visible = v; if (v) { if (st.want && !st.inst && !st.busy && !st.failed) mount(st); wake(); } };

  if (st.kind === 'study') {
    // fixed overlays are always "in the viewport": follow their own is-on class instead
    const sync = () => { const on = host.classList.contains('is-on'); if (on) { setWant(true); setNear(true); } else { setNear(false); clearTimeout(st._off); st._off = setTimeout(() => { if (!host.classList.contains('is-on')) setWant(false); }, 900); } };
    new MutationObserver(sync).observe(host, { attributes: true, attributeFilter: ['class'] });
    sync();
    return;
  }
  if ('IntersectionObserver' in window) {
    // phones: tighter margins, so only the cards on (or just next to) the screen ever hold a GL context
    new IntersectionObserver((es) => { for (const e of es) setWant(e.isIntersecting); }, { rootMargin: mobile ? '25% 0px' : '90% 0px' }).observe(host);
    new IntersectionObserver((es) => { for (const e of es) setNear(e.isIntersecting); }, { rootMargin: mobile ? '0px' : '60px 0px' }).observe(host);
  } else { setWant(true); setNear(true); }
}

/* ------------------------------------------------------------------ the one loop */

function paused(inst) {
  if (root.classList.contains('idx-open')) return true;
  if (root.classList.contains('sample-open')) return inst.st.kind !== 'study';   // an open study covers the page
  return inst.st.kind === 'study';
}

function loop(now) {
  if (doc.hidden || !live.size) { looping = false; lastNow = 0; return; }
  const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
  frame.t = (now - BOOT_T0) / 1000; frame.dt = dt;
  frame.scrollY = window.scrollY; frame.vw = window.innerWidth; frame.vh = window.innerHeight;
  const k = 1 - Math.exp(-dt * 2.6);
  pointer.sx += (pointer.x - pointer.sx) * k; pointer.sy += (pointer.y - pointer.sy) * k;
  let any = false;
  live.forEach((inst) => {
    if (inst.dead || !inst.visible || paused(inst) || !inst.scene) return;
    any = true;
    if (inst.rz) { inst.rz = false; resize(inst); }   // resize before drawing, never after: a resize clears the buffer
    let ok = false;
    const td = DEBUG ? performance.now() : 0;
    try { ok = inst.scene.draw(frame.t, dt, frame); } catch (e) { log('draw failed', inst.st.id, e); inst.dead = true; inst.st.failed = true; setTimeout(() => unmount(inst.st), 0); }
    if (DEBUG && !inst.firstDrawLogged) { inst.firstDrawLogged = true; log('first draw', inst.st.id, Math.round(performance.now() - td) + 'ms'); }
    if (ok && !inst.on) { inst.on = true; inst.canvas.classList.add('is-on'); }
  });
  if (!any) { looping = false; lastNow = 0; return; }
  // governor: real frame interval, ignoring stalls from tab switches
  if (lastNow) {
    const gap = now - lastNow;
    if (gap < 250) { counted++; if (gap > 26) slow++; }
    if (counted >= 60) {
      if (slow > 36 && !(DEBUG && window.__cr3dNoGov)) live.forEach((inst) => { if (inst.visible && inst.q > 0.6) { inst.q = Math.max(0.6, inst.q * 0.82); inst.rz = true; log('degrade', inst.st.id, inst.q.toFixed(2)); } });
      counted = 0; slow = 0;
    }
  }
  lastNow = now;
  requestAnimationFrame(loop);
}
function wake() { if (!looping && !doc.hidden) { looping = true; lastNow = 0; requestAnimationFrame(loop); } }
doc.addEventListener('visibilitychange', wake);

window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  pointer.mouse = true;
  pointer.x = clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
  pointer.y = clamp((e.clientY / window.innerHeight) * 2 - 1, -1, 1);
}, { passive: true });

/* ------------------------------------------------------------------ start */

/* Can this browser draw WebGL 2 on a real GPU? Asked once, here (three seconds after load, not at page start), before
   anything is downloaded. failIfMajorPerformanceCaveat makes the browser refuse software rendering, where a 3D layer
   would be the opposite of smooth; the debug switch lifts that so the layer can be tested on a machine without a GPU. */
function glOk() {
  try {
    const c = doc.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: !DEBUG, powerPreference: 'low-power' });
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch (e) { return false; }
}

async function start() {
  if (!glOk()) { log('no usable WebGL 2: the page stays as it is'); return; }
  let mod;
  const t0 = performance.now();
  try { mod = await import('../vendor/three-cr.min.js'); } catch (e) { log('three failed to load', e); return; }
  log('import three', Math.round(performance.now() - t0) + 'ms');
  T = mod;
  await loadCss();
  reserveStages();
  root.classList.add('has-3d');
  if (DEBUG) window.__cr3d = { T, live, STAGES, frame, pointer, unmount, mount };
  STAGES.forEach(watch);
  // if reduced motion is switched on while the page is open, take everything down
  const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (rm && rm.addEventListener) rm.addEventListener('change', () => {
    if (rm.matches) { STAGES.forEach((s) => { s.want = false; s.failed = true; unmount(s); }); root.classList.remove('has-3d'); }
  });
}

/* The first seconds of a visit belong to the photograph, the fonts and the page's own scripts. The 3D layer wakes up
   once those have settled: three seconds after the page has loaded, at an idle moment. (It is decoration; nothing is
   waiting for it.) */
function idle(fn) {
  const go = () => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 400));
  const later = () => setTimeout(go, 3000);
  if (doc.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
}

if (canRun()) idle(start);
