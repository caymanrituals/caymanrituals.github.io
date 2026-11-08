/* The living photograph. A shader draws the page's own photograph (the sea rolls in perspective, sun glitters where the
   photograph already holds light, the surf breathes around the rock, the scrub moves in the wind, the whole view shifts
   in depth with the pointer) and masks built from the photograph's own pixels keep every effect on water, foliage and
   surf. Lettering baked into the picture never moves.
   Used for the hero ("hero") and the collection photograph ("fall"). */
import { doc, mq, css, DEBUG } from './cr3d-kit.js';


/* Masks from the photo itself, at 384 px wide: r = open water, g = scrub, b = surf. The horizon is found from the
   margins, where the wordmark is not. Same-origin image, so the pixels are readable. */
export function buildMask(img, fixedHz) {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const mw = 384;
  const mh = Math.max(8, Math.round((mw * nh) / nw));
  const c = doc.createElement('canvas');
  c.width = mw; c.height = mh;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, mw, mh);
  const px = x.getImageData(0, 0, mw, mh);
  const d = px.data;
  // The horizon is the one edge that runs straight across the whole frame: pick the row where the most columns
  // change brightness in the same direction. Shorelines and letters only cover part of a row.
  const lum = new Float32Array(mw * mh);
  for (let j = 0; j < lum.length; j++) lum[j] = 0.299 * d[j * 4] + 0.587 * d[j * 4 + 1] + 0.114 * d[j * 4 + 2];
  let hz = Math.round(mh * 0.34);
  let best = 0;
  for (let y = Math.round(mh * 0.15); y < Math.round(mh * 0.6); y++) {
    let pos = 0; let neg = 0;
    for (let xx = 0; xx < mw; xx++) {
      const g = lum[(y + 1) * mw + xx] - lum[(y - 1) * mw + xx];
      if (g > 5) pos++; else if (g < -5) neg++;
    }
    const s = Math.max(pos, neg) / mw;
    if (s > best) { best = s; hz = y; }
  }
  const horizon = typeof fixedHz === "number" ? fixedHz : (best > 0.6 ? hz / mh : 0.34);

  const W = new Float32Array(mw * mh);
  const F = new Float32Array(mw * mh);
  const S = new Float32Array(mw * mh);
  const ss = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < mh; y++) {
    const v = y / mh;
    const below = ss(horizon + 0.002, horizon + 0.012, v);
    for (let xx = 0; xx < mw; xx++) {
      const j = y * mw + xx;
      const i = j * 4;
      const r = d[i] / 255; const g = d[i + 1] / 255; const b = d[i + 2] / 255;
      const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
      const s = mx ? (mx - mn) / mx : 0;
      W[j] = below * ss(0.05, 0.14, b - r) * ss(-0.04, 0.03, b - g) * ss(0.25, 0.5, s);
      F[j] = ss(horizon + 0.08, horizon + 0.2, v) * ss(0.0, 0.05, g - r) * ss(-0.04, 0.02, g - b) * ss(0.05, 0.14, mx);
      S[j] = ss(horizon + 0.12, horizon + 0.22, v) * ss(0.34, 0.55, mx) * (1 - ss(0.12, 0.26, s));
    }
  }
  // Keep-out around lettering set over the sea (the wordmark's second line): pale, unsaturated strokes just under
  // the horizon, grown by a few pixels. The water there holds still so the letters never shimmer.
  const Lt = new Float32Array(mw * mh);
  for (let y = 0; y < mh; y++) {
    const dv = y / mh - horizon;
    if (dv < -0.01 || dv > 0.12) continue;
    for (let xx = 0; xx < mw; xx++) {
      const j = y * mw + xx;
      const r = d[j * 4] / 255; const g = d[j * 4 + 1] / 255; const b = d[j * 4 + 2] / 255;
      const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
      const s = mx ? (mx - mn) / mx : 0;
      Lt[j] = ss(0.45, 0.62, mx) * (1 - ss(0.18, 0.32, s));
    }
  }
  const keep = blur(Lt, mw, mh, 2);
  for (let j = 0; j < W.length; j++) W[j] *= 1 - ss(0.02, 0.09, keep[j]);
  // Surf only where open water is close by: grow the water mask, then keep the bright, pale pixels inside it.
  const near = blur(blur(W, mw, mh, 6), mw, mh, 6);
  for (let j = 0; j < S.length; j++) S[j] *= ss(0.04, 0.2, near[j]);
  const Wb = blur(W, mw, mh, 1);
  const Fb = blur(F, mw, mh, 1);
  const Sb = blur(S, mw, mh, 3);
  for (let j = 0; j < W.length; j++) {
    d[j * 4] = Math.round(Wb[j] * 255);
    d[j * 4 + 1] = Math.round(Fb[j] * 255);
    d[j * 4 + 2] = Math.round(Sb[j] * 255);
    d[j * 4 + 3] = 255;
  }
  x.putImageData(px, 0, 0);
  return { canvas: c, horizon };
}

/* Three masks (water, scrub, surf) become three greyscale tiles side by side in one canvas: greyscale survives JPEG
   without the colour channels bleeding into each other, and it is small. */
export function packMask(canvas, tileW) {
  const w = tileW; const h = Math.round(canvas.height * w / canvas.width);
  const src = doc.createElement('canvas'); src.width = w; src.height = h;
  const sg = src.getContext('2d', { willReadFrequently: true }); sg.imageSmoothingQuality = 'high'; sg.drawImage(canvas, 0, 0, w, h);
  const a = sg.getImageData(0, 0, w, h).data;
  const out = doc.createElement('canvas'); out.width = w * 3; out.height = h;
  const og = out.getContext('2d'); const img = og.createImageData(w * 3, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        const o = (y * w * 3 + c * w + x) * 4; const v = a[(y * w + x) * 4 + c];
        img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
      }
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

/* Masks are computed once when the site is built (vendor/three-build/make-masks.mjs) and shipped as small images, so
   visitors' phones do not spend half a second computing them. Keyed by photograph; any other image falls back to
   computing its mask in the browser. */
const MASKS = { landscape: 0.3438, portrait: 0.3401, fall: -0.45 };   // horizon, as a fraction of the picture's height
function maskKey(src) {
  if (/fall-cover/.test(src)) return 'fall';
  if (/bluff-statement-portrait/.test(src)) return 'portrait';
  if (/bluff-statement/.test(src)) return 'landscape';
  return null;
}
function loadImage(url) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
}

function blur(src, w, h, r) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[y * w + Math.min(w - 1, Math.max(0, x + k))];
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = s / n;
    }
  }
  return out;
}

const HERO_VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';

const HERO_FS = `
precision highp float;
uniform sampler2D uMap;
uniform sampler2D uMask;
uniform float uTime;
uniform float uHz;
uniform float uAsp;
uniform vec2 uPtr;
uniform vec4 uCover;
varying vec2 vUv;

// the masks are three greyscale tiles side by side: water | scrub | surf
vec3 mk(vec2 p){float u=clamp(p.x,0.004,0.996)/3.0;float v=p.y;
  return vec3(texture2D(uMask,vec2(u,v)).r,texture2D(uMask,vec2(u+0.3333333,v)).r,texture2D(uMask,vec2(u+0.6666667,v)).r);}
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x),f.y);}
// Swell on the sea plane, in plane coordinates: long rollers toward the shore, a cross sea, and chop.
float wave(vec2 w,float t){
  return sin(w.y*2.6+w.x*0.55-t*1.05)*0.55
       + sin(w.y*4.7-w.x*1.6-t*1.6)*0.28
       + (vn(w*vec2(1.7,2.9)+vec2(0.0,-t*0.55))-0.5)*0.9
       + (vn(w*vec2(4.3,7.1)+vec2(t*0.12,-t*1.05))-0.5)*0.42;
}
void main(){
  vec2 uv=vec2(vUv.x*uCover.x+uCover.z,(1.0-vUv.y)*uCover.y+uCover.w);
  vec3 m=mk(uv);
  float t=uTime;
  float dv=max(uv.y-uHz,0.0);
  float near=clamp(dv/(1.0-uHz),0.0,1.0);
  float fadeH=smoothstep(0.0,0.035,dv);
  // Screen to sea plane: distance grows toward the horizon, so the same swell gets smaller and denser there.
  float z=0.16/(dv+0.015);
  vec2 w=vec2((uv.x-0.5)*z*uAsp,z);
  float e=0.05;
  float h0=wave(w,t);
  vec2 grad=vec2(wave(w+vec2(e,0.0),t)-h0,wave(w+vec2(0.0,e),t)-h0)/e;
  // On-screen size of the swell falls with distance (perspective), so far water shimmers and near water rolls.
  vec2 d=grad*vec2(0.0016,0.0028)*(dv+0.012)*m.r*fadeH;
  // Never pull a pixel out of something that is not water (the wordmark letters, the rock, the shore).
  d*=mk(uv+d).x;
  float sw=sin(t*1.3+uv.x*48.0+vn(uv*14.0+t*0.15)*5.0)*(0.6+0.4*sin(t*0.37+uv.y*9.0));
  d+=vec2(0.0011,0.0004)*sw*m.g*(0.3+near);
  // wave and wind displacement ease to nothing at the frame edges, so they never pull from beyond the photograph
  d*=smoothstep(0.0,0.035,vUv.y)*smoothstep(1.0,0.965,vUv.y)*smoothstep(0.0,0.035,vUv.x)*smoothstep(1.0,0.965,vUv.x);
  d+=uPtr*(0.0016+0.0052*pow(near,1.25));
  vec3 col=texture2D(uMap,uv+d).rgb;
  col*=1.0+h0*0.045*m.r*fadeH;
  vec2 g=w*vec2(9.0,15.0)+vec2(0.0,t*0.9);
  vec2 id=floor(g);
  vec2 f=fract(g);
  float r=h21(id);
  vec2 c=vec2(h21(id+3.7),h21(id+9.1))*0.7+0.15;
  float tw=pow(0.5+0.5*sin(t*(1.7+r*3.3)+r*40.0),10.0);
  float sp=smoothstep(0.16,0.0,length((f-c)*vec2(1.0,0.6)))*tw*step(0.62,r);
  float lum=dot(col,vec3(0.299,0.587,0.114));
  sp*=m.r*smoothstep(0.035,0.09,dv)*smoothstep(0.14,0.4,lum);
  col+=sp*vec3(1.0,0.96,0.88)*0.75;
  float sb=vn(uv*vec2(26.0,30.0)+vec2(t*0.08,t*0.35));
  col*=1.0+m.b*(sb-0.45)*0.18;
  gl_FragColor=vec4(col,1.0);
}`;

const MOTE_VS = `
attribute vec4 aSeed;
uniform float uTime;
uniform float uPR;
uniform vec2 uPtr;
varying float vA;
varying float vSoft;
void main(){
  float dep=aSeed.z;
  float near=1.0-dep;
  float sp=mix(0.012,0.034,near)*(0.7+aSeed.w*0.6);
  float y=mod(aSeed.y+uTime*sp+1.0,2.0)-1.0;
  float x=aSeed.x+sin(uTime*(0.11+aSeed.w*0.1)+aSeed.w*31.0)*0.06+uTime*0.006*near;
  x=mod(x+1.1,2.2)-1.1;
  vec2 p=vec2(x,y)-uPtr*vec2(1.0,-1.0)*mix(0.008,0.06,near);
  gl_Position=vec4(p,0.0,1.0);
  gl_PointSize=(1.3+7.0*near*near)*uPR;
  float tw=0.55+0.45*sin(uTime*(0.8+aSeed.w*1.7)+aSeed.w*50.0);
  vA=mix(0.5,0.14,near*near)*tw*smoothstep(0.55,-0.1,y)*smoothstep(-1.0,-0.75,y);
  vSoft=near;
}`;

const MOTE_FS = `
precision mediump float;
uniform vec3 uCol;
varying float vA;
varying float vSoft;
void main(){
  float r=length(gl_PointCoord-0.5)*2.0;
  float a=1.0-smoothstep(mix(0.3,0.0,vSoft),1.0,r);
  gl_FragColor=vec4(uCol,a*vA);
}`;


export async function create(ctx) {
  const { T, host, canvas, renderer: R, stage, frame } = ctx;
  const variant = stage.variant || 'hero';
  const img = host.querySelector(variant === 'fall' ? '.fall-img' : '.hero-img');
  if (!img) return null;
  R.autoClear = false;
  R.setClearColor(0x0a1416, 1);

  const map = new T.Texture();
  map.minFilter = T.LinearFilter; map.magFilter = T.LinearFilter; map.generateMipmaps = false; map.flipY = false;
  const mask = new T.Texture();
  mask.minFilter = T.LinearFilter; mask.magFilter = T.LinearFilter; mask.generateMipmaps = false; mask.flipY = false;

  const U = {
    uMap: { value: map }, uMask: { value: mask }, uTime: { value: 0 }, uHz: { value: 0.34 },
    uAsp: { value: 1.33 }, uPtr: { value: new T.Vector2() }, uCover: { value: [1, 1, 0, 0] },
  };
  const photo = new T.Scene();
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
    vertexShader: HERO_VS, fragmentShader: HERO_FS, uniforms: U, depthTest: false, depthWrite: false,
  }));
  photo.add(quad);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Salt light: a few motes drifting off the sea, nearer ones larger, softer and quicker.
  const N = variant === 'fall' ? 36 : (frame.mobile ? 56 : 110);
  const seeds = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    seeds[i * 4] = Math.random() * 2.2 - 1.1;
    seeds[i * 4 + 1] = Math.random() * 2 - 1;
    seeds[i * 4 + 2] = Math.pow(Math.random(), 0.6);
    seeds[i * 4 + 3] = Math.random();
  }
  const mg = new T.BufferGeometry();
  mg.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3), 3));
  mg.setAttribute('aSeed', new T.BufferAttribute(seeds, 4));
  const MU = { uTime: { value: 0 }, uPR: { value: 1 }, uPtr: U.uPtr, uCol: { value: new T.Color().fromArray(css('--bone', [0.93, 0.91, 0.89])) } };
  const motes = new T.Points(mg, new T.ShaderMaterial({
    vertexShader: MOTE_VS, fragmentShader: MOTE_FS, uniforms: MU, transparent: true,
    blending: T.AdditiveBlending, depthTest: false, depthWrite: false,
  }));
  motes.frustumCulled = false;
  const air = new T.Scene();
  air.add(motes);

  let ready = false;
  let src = '';
  let disposed = false;
  const fixedHz = variant === 'fall' ? -0.45 : undefined;   // the collection crop has no horizon: treat the sea as near water

  function fit() {
    const W = Math.max(1, canvas.clientWidth);
    const H = Math.max(1, canvas.clientHeight);
    if (!img.naturalWidth) return;
    // Mirror object-fit: cover and the image's object-position, plus 2% overscan so parallax never shows an edge.
    const [px, py] = (getComputedStyle(img).objectPosition || '50% 50%').split(' ').map((v) => (parseFloat(v) || 50) / 100);
    const iw = img.naturalWidth; const ih = img.naturalHeight;
    const s = Math.max(W / iw, H / ih);
    const dw = iw * s; const dh = ih * s;
    const z = 1.02;
    const ax = W / dw; const bx = -((W - dw) * px) / dw;
    const ay = H / dh; const by = -((H - dh) * py) / dh;
    U.uCover.value = [ax / z, ay / z, (bx - px) / z + px, (by - py) / z + py];
    canvas.style.transformOrigin = getComputedStyle(img).transformOrigin;
  }

  async function photoSource() {
    // scale the largest art-direction sources down once, to what a screen can use; createImageBitmap does it off the main thread
    const cap = Math.min(R.capabilities.maxTextureSize, frame.mobile ? 2048 : 3072);
    const k = Math.min(1, cap / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k); const h = Math.round(img.naturalHeight * k);
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' }); } catch (e) { /* fall back to a canvas copy */ }
    }
    const c = doc.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c;
  }

  let loadToken = 0;
  async function load() {
    if (disposed || !img.naturalWidth || img.currentSrc === src) return;
    src = img.currentSrc;
    const mine = ++loadToken; const tl = performance.now();
    const key = maskKey(src);
    const [source, pre] = await Promise.all([
      photoSource(),
      key ? loadImage(new URL('../img/hero-mask-' + key + '.jpg', import.meta.url).href) : Promise.resolve(null),
    ]);
    if (disposed || mine !== loadToken) { if (source && source.close) source.close(); return; }
    let maskImage = pre; let horizon = pre ? MASKS[key] : 0.34;
    if (!pre) {                                           // an unknown photograph: compute its mask here, once
      const mk = buildMask(img, fixedHz);
      maskImage = packMask(mk.canvas, 256); horizon = mk.horizon;
    }
    if (map.image && (map.image.width !== source.width || map.image.height !== source.height)) map.dispose();
    if (map.image && map.image.close) map.image.close();
    map.image = source; map.needsUpdate = true;
    if (mask.image && (mask.image.width !== maskImage.width || mask.image.height !== maskImage.height)) mask.dispose();
    mask.image = maskImage; mask.needsUpdate = true;
    U.uHz.value = horizon;
    U.uAsp.value = img.naturalWidth / img.naturalHeight;
    if (DEBUG) window.__cr3dHero = Object.assign(window.__cr3dHero || {}, { [variant]: { mask: maskImage, horizon, precomputed: !!pre } });
    fit();
    ready = true;
    if (DEBUG) console.log('[cr3d] hero load()', variant, pre ? 'precomputed mask' : 'computed mask', Math.round(performance.now() - tl) + 'ms');
  }

  const onLoad = () => load();
  img.addEventListener('load', onLoad);
  let rq = 0;
  const onResize = () => { cancelAnimationFrame(rq); rq = requestAnimationFrame(() => { fit(); load(); }); };   // load() is a no-op unless the browser picked a different source
  window.addEventListener('resize', onResize);
  if (!(img.complete && img.naturalWidth)) await new Promise((res) => { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); });
  await load();
  if (!ready) { img.removeEventListener('load', onLoad); window.removeEventListener('resize', onResize); return null; }

  const tcomp = performance.now();
  await new Promise((res) => setTimeout(res, 0));       // give the browser a turn between the steps of start-up
  try { if (R.compileAsync) { await R.compileAsync(photo, cam); await new Promise((res) => setTimeout(res, 0)); await R.compileAsync(air, cam); } } catch (e) { /* the first draw compiles instead */ }
  if (DEBUG) console.log('[cr3d] hero compile', Math.round(performance.now() - tcomp) + 'ms');
  const target = { x: 0, y: 0 };
  let drawn = 0;
  return {
    debug: DEBUG ? { U, MU } : undefined,
    resize(w, h, pr) { MU.uPR.value = pr; fit(); },
    draw(t, dt) {
      if (!ready) return false;
      // pointer parallax on devices with a mouse, a slow drift everywhere else
      if (DEBUG && window.__cr3dStill) { target.x = 0; target.y = 0; }
      else if (frame.pointer.mouse) { target.x = frame.pointer.sx * 0.8; target.y = frame.pointer.sy * 0.8; }
      else { target.x = Math.sin(t * 0.13) * 0.35; target.y = Math.sin(t * 0.09 + 1.3) * 0.2; }
      const p = U.uPtr.value;
      const k = 1 - Math.exp(-dt * 2.4);
      p.x += (target.x - p.x) * k; p.y += (target.y - p.y) * k;
      U.uTime.value = t; MU.uTime.value = t;
      // follow the image's scroll zoom (set inline by the page's own scroll timeline)
      const tf = img.style.transform;
      if (canvas.style.transform !== tf) canvas.style.transform = tf;
      R.clear();
      R.render(photo, cam);
      if (drawn++ > 0) R.render(air, cam);                  // the motes join from the second frame, keeping the first frame short
      return true;
    },
    dispose() {
      disposed = true;
      img.removeEventListener('load', onLoad); window.removeEventListener('resize', onResize);
      if (map.image && map.image.close) map.image.close();
      map.dispose(); mask.dispose(); quad.geometry.dispose(); quad.material.dispose(); mg.dispose(); motes.material.dispose();
      canvas.style.transform = '';
    },
  };
}
