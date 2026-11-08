/* The five studies in three dimensions.
 *
 * Each object is modelled from the page's own concept images (banded caymanite disc and pendant, a rope bracelet
 * with brass collars, a square glass vessel with a cord-wrapped cap, a three-band candle), as a form study and no
 * more: no lettering, no finish or material claims beyond what the images already show. They share one set of
 * procedural textures, one reflection environment and one flame.
 *
 *   pieces  the "Coming soon" panel: one object at a time, and it turns, and changes to the next study, as you
 *           scroll the rail of cards
 *   study   a study overlay: that study's object, turning slowly, lit; the candle burns
 */
import { clamp, lerp, smooth, mq } from './cr3d-kit.js';

const KINDS = ['keeper', 'slab', 'rope', 'edp', 'candle'];

/* ------------------------------------------------------------------ procedural textures */

function vnoise(x, y) {
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const ix = Math.floor(x); const iy = Math.floor(y); const fx = x - ix; const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx); const uy = fy * fy * (3 - 2 * fy);
  return h(ix, iy) * (1 - ux) * (1 - uy) + h(ix + 1, iy) * ux * (1 - uy) + h(ix, iy + 1) * (1 - ux) * uy + h(ix + 1, iy + 1) * ux * uy;
}

/* banded caymanite: warped strata in oxblood, rust, cream and umber */
function stoneTexture(T) {
  const S = 512; const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d'); const img = g.createImageData(S, S);
  const P = [[126, 30, 28], [176, 58, 42], [222, 204, 176], [240, 228, 204], [128, 74, 50], [92, 54, 42], [198, 120, 84]];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S; const v = y / S;
      const warp = (vnoise(u * 3, v * 2) - 0.5) * 1.6 + Math.sin(u * 6.28 * 1.5 + v * 2.0) * 0.18;
      const b = (v * 8.4 + warp * 1.3) * 1.0;
      const i0 = ((Math.floor(b) % P.length) + P.length) % P.length; const i1 = (i0 + 1) % P.length;
      let f = b - Math.floor(b); f = f * f * (3 - 2 * f);
      const grain = (vnoise(u * 40, v * 26) - 0.5) * 7;
      const o = (y * S + x) * 4;
      for (let k = 0; k < 3; k++) img.data[o + k] = clamp(P[i0][k] * (1 - f) + P[i1][k] * f + grain, 0, 255);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.wrapS = tex.wrapT = T.MirroredRepeatWrapping;
  return tex;
}

/* twisted cord: diagonal strands with fibre noise, used as colour and as bump */
function ropeTexture(T, asBump) {
  const S = 256; const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d'); const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const ph = ((x + y * 0.62) / S) * Math.PI * 2 * 4;
      const s = Math.sin(ph); const ridge = clamp(s * 0.5 + 0.55, 0, 1);
      const fibre = (vnoise(x * 0.5, y * 2.4) - 0.5) * 0.35;
      const l = clamp(ridge * 0.85 + fibre + 0.1, 0, 1);
      const o = (y * S + x) * 4;
      if (asBump) { const v = l * 255; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; }
      else { img.data[o] = 120 + l * 112; img.data[o + 1] = 98 + l * 108; img.data[o + 2] = 66 + l * 96; }
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new T.CanvasTexture(c); tex.wrapS = tex.wrapT = T.RepeatWrapping; if (!asBump) tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

/* the reflection environment: a warm room with a key softbox, a fill and a cool top light */
function envTexture(T) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#15120f'); grd.addColorStop(0.42, '#54463a'); grd.addColorStop(0.5, '#c4b296'); grd.addColorStop(0.58, '#43382e'); grd.addColorStop(1, '#0d0b0a');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  try { g.filter = 'blur(5px)'; } catch (e) { /* no canvas filters: harder highlights */ }
  g.fillStyle = '#fff4e2'; g.fillRect(64, 44, 96, 70);
  g.fillStyle = '#ffd49a'; g.fillRect(338, 66, 72, 56);
  g.fillStyle = '#cfe2ff'; g.fillRect(226, 14, 64, 30);
  const tex = new T.CanvasTexture(c); tex.mapping = T.EquirectangularReflectionMapping; tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

function softShadow(T) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(0.55, 'rgba(0,0,0,0.18)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new T.CanvasTexture(c);
}

/* ------------------------------------------------------------------ glass and flame shaders */

const GLASS_VS = `varying vec3 vWN; varying vec3 vWV;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWN = normalize(mat3(modelMatrix) * normal); vWV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const GLASS_FS = `precision highp float;
uniform sampler2D uEnv; uniform vec3 uTint; uniform float uBack, uAlpha;
varying vec3 vWN; varying vec3 vWV;
vec3 envAt(vec3 r){ float u = atan(r.z, r.x) / 6.28318 + 0.5; float v = asin(clamp(r.y, -1.0, 1.0)) / 3.14159 + 0.5; return texture2D(uEnv, vec2(u, v)).rgb; }
void main(){
  vec3 n = normalize(vWN); vec3 v = normalize(vWV);
  if (uBack > 0.5) n = -n;
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float f = pow(1.0 - ndv, 2.6);
  vec3 env = envAt(reflect(-v, n));
  vec3 col = mix(uTint * 0.85, env, clamp(f * 1.2 + 0.1, 0.0, 1.0));
  float a = (uAlpha + 0.85 * f) * (uBack > 0.5 ? 0.5 : 1.0);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.9));
}`;

const FLAME_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FLAME_FS = `precision highp float;
uniform float uTime, uFlicker; varying vec2 vUv;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
void main(){
  float t = uTime;
  vec2 p = vUv; p.x -= 0.5;
  float h = p.y;                                              // 0 at the wick, 1 at the tip
  float sway = (vn(vec2(t * 2.1, h * 3.0)) - 0.5) * 0.22 * h + sin(t * 6.3 + h * 8.0) * 0.012 * h;
  float lick = vn(vec2(p.x * 7.0, h * 5.0 - t * 4.2)) - 0.5;  // flame tongues rising
  float w = mix(0.17, 0.0, pow(h, 0.85)) * (1.0 + lick * 0.35);
  float d = abs(p.x - sway) / max(w, 0.0005);
  float body = (1.0 - smoothstep(0.45, 1.0, d)) * smoothstep(0.0, 0.07, h) * (1.0 - smoothstep(0.78, 1.0, h));
  float core = (1.0 - smoothstep(0.0, 0.8, d)) * smoothstep(0.0, 0.05, h) * (1.0 - smoothstep(0.3, 0.55, h));
  vec3 cool = vec3(0.45, 0.62, 1.0);
  vec3 hot = vec3(1.0, 0.93, 0.7);
  vec3 mid = vec3(1.0, 0.62, 0.18);
  vec3 tip = vec3(0.9, 0.22, 0.05);
  vec3 col = mix(mid, tip, smoothstep(0.35, 0.95, h));
  col = mix(col, hot, core * 0.8);
  col = mix(col, cool, (1.0 - smoothstep(0.0, 0.14, h)) * 0.55);
  float glow = exp(-dot(vec2(p.x * 1.6, (h - 0.28) * 0.9), vec2(p.x * 1.6, (h - 0.28) * 0.9)) * 7.0) * 0.5;
  float a = (body * 0.95 + glow) * uFlicker;
  gl_FragColor = vec4(col * (body + glow * 0.8) * 1.25, clamp(a, 0.0, 1.0));
}`;

const HALO_FS = `precision highp float; uniform float uFlicker, uStrength; varying vec2 vUv;
void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = exp(-r * r * 4.5) * (1.0 - smoothstep(0.55, 0.98, r)) * uStrength * uFlicker;
  gl_FragColor = vec4(vec3(1.0, 0.62, 0.26) * a, a); }`;

/* ------------------------------------------------------------------ the objects */

function roundedRect(T, w, h, r) {
  const s = new T.Shape(); const x = -w / 2; const y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function build(T, kind, ctx) {
  const { R, env, tex, own } = ctx;
  const g = new T.Group();
  const keep = (o) => { own.push(o); return o; };
  const brass = keep(new T.MeshStandardMaterial({ color: 0xd2ad66, metalness: 1, roughness: 0.24, envMapIntensity: 2.1 }));
  const glassMat = (back, tint, alpha) => keep(new T.ShaderMaterial({
    vertexShader: GLASS_VS, fragmentShader: GLASS_FS, transparent: true, depthWrite: false,
    side: back ? T.BackSide : T.FrontSide,
    uniforms: { uEnv: { value: env }, uTint: { value: tint || new T.Color(0.82, 0.9, 0.86) }, uBack: { value: back ? 1 : 0 }, uAlpha: { value: alpha == null ? 0.1 : alpha } },
  }));
  const add = (geo, mat, order) => { keep(geo); const m = new T.Mesh(geo, mat); if (order != null) m.renderOrder = order; g.add(m); return m; };
  let height = 2.4;
  let flame = null;

  if (kind === 'keeper') {
    const mat = keep(new T.MeshStandardMaterial({ map: tex.stone, roughness: 0.34, metalness: 0, envMapIntensity: 1.1 }));
    const m = add(new T.CylinderGeometry(1.12, 1.12, 0.5, 96, 1), mat);
    m.rotation.x = Math.PI / 2 - 0.35;
    height = 2.3;
  } else if (kind === 'slab') {
    const mat = keep(new T.MeshStandardMaterial({ map: tex.stone, roughness: 0.3, metalness: 0, envMapIntensity: 1.2 }));
    tex.stone.repeat.set(0.75, 0.75);
    const body = add(new T.ExtrudeGeometry(roundedRect(T, 1.0, 1.5, 0.1), { depth: 0.22, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 3, curveSegments: 12 }), mat);
    body.position.z = -0.11;
    const frame = roundedRect(T, 1.2, 1.7, 0.14); frame.holes.push(roundedRect(T, 1.02, 1.52, 0.1));
    add(new T.ExtrudeGeometry(frame, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 12 }), brass).position.z = -0.15;
    const bail = add(new T.TorusGeometry(0.17, 0.03, 12, 40), brass); bail.position.set(0, 0.97, 0);
    g.rotation.x = 0.0; height = 2.1;
  } else if (kind === 'rope') {
    const mat = keep(new T.MeshStandardMaterial({ map: tex.rope, bumpMap: tex.ropeBump, bumpScale: 3.2, roughness: 0.92, metalness: 0, envMapIntensity: 0.5 }));
    tex.rope.repeat.set(40, 3); tex.ropeBump.repeat.set(40, 3);
    add(new T.TorusGeometry(1.02, 0.24, 28, 160), mat);
    [0.0, 3.2].forEach((a) => {
      const c = add(new T.CylinderGeometry(0.3, 0.3, 0.56, 40, 1, false), brass);
      c.position.set(Math.cos(a) * 1.02, Math.sin(a) * 1.02, 0); c.rotation.z = a;
    });
    g.rotation.x = -0.5; height = 2.5;
  } else if (kind === 'edp') {
    const W = 1.15; const D = 1.0; const H = 1.15;
    const bodyGeo = new T.ExtrudeGeometry(roundedRect(T, W, D, 0.12), { depth: H, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 4, curveSegments: 12 });
    bodyGeo.rotateX(-Math.PI / 2); bodyGeo.translate(0, -H / 2 - 0.1, 0);
    // the liquid is a volume of tinted glass: pale at the surface, deeper amber lower down, with the room reflected in it
    const liqGeo = new T.ExtrudeGeometry(roundedRect(T, W - 0.2, D - 0.2, 0.09), { depth: H * 0.66, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 10 });
    liqGeo.rotateX(-Math.PI / 2); liqGeo.translate(0, -H / 2 - 0.02, 0);
    const amber = new T.Color(0.98, 0.72, 0.26);
    add(liqGeo, glassMat(true, amber, 0.55), 1); add(liqGeo, glassMat(false, amber, 0.5), 1.5);
    add(bodyGeo, glassMat(true), 2); add(bodyGeo, glassMat(false), 3);
    const neck = new T.CylinderGeometry(0.28, 0.3, 0.3, 40, 1, true); neck.translate(0, H / 2 + 0.2, 0);
    add(neck, glassMat(true), 2); add(neck, glassMat(false), 3);
    const cap = add(new T.CylinderGeometry(0.33, 0.33, 0.36, 48), keep(new T.MeshStandardMaterial({ color: 0x131212, roughness: 0.35, metalness: 0.2, envMapIntensity: 1 }))); cap.position.y = H / 2 + 0.52;
    const cord = keep(new T.MeshStandardMaterial({ map: tex.rope, bumpMap: tex.ropeBump, bumpScale: 2.6, roughness: 0.95, envMapIntensity: 0.4 }));
    [H / 2 + 0.24, H / 2 + 0.12].forEach((y) => { const t = add(new T.TorusGeometry(0.31, 0.055, 12, 48), cord); t.rotation.x = Math.PI / 2; t.position.y = y; });
    height = 2.6;
  } else if (kind === 'candle') {
    const R0 = 0.98;
    const wax = (r0, r1, h0, h1, color, rough) => { const m = add(new T.CylinderGeometry(r1, r0, h1 - h0, 64), keep(new T.MeshStandardMaterial({ color, roughness: rough, metalness: 0, envMapIntensity: 0.5, emissive: color, emissiveIntensity: 0.03 }))); m.position.y = (h0 + h1) / 2; return m; };
    wax(R0 * 0.9, R0 * 0.9, -0.82, -0.2, 0x3d2b22, 0.7);      // umber
    wax(R0 * 0.9, R0 * 0.9, -0.2, 0.34, 0x7e2a26, 0.55);      // oxblood
    wax(R0 * 0.9, R0 * 0.9, 0.34, 0.86, 0xe9dcc0, 0.5);       // cream
    const top = add(new T.CylinderGeometry(R0 * 0.9, R0 * 0.9, 0.01, 64), keep(new T.MeshStandardMaterial({ color: 0xf2e6c8, roughness: 0.4, emissive: 0xffc36a, emissiveIntensity: 0.12 })));
    top.position.y = 0.865;
    const wick = add(new T.CylinderGeometry(0.014, 0.018, 0.17, 8), keep(new T.MeshStandardMaterial({ color: 0x1d1814, roughness: 0.9 }))); wick.position.y = 0.95;
    const wall = new T.CylinderGeometry(R0, R0 * 0.94, 1.78, 64, 1, true); wall.translate(0, 0.02, 0);
    add(wall, glassMat(true), 2); add(wall, glassMat(false), 3);
    const base = new T.CylinderGeometry(R0 * 0.94, R0 * 0.9, 0.1, 64); base.translate(0, -0.88, 0);
    add(base, glassMat(false), 3);
    flame = { x: 0, y: 1.07 };
    height = 2.5;
  }
  // where the lowest point of this object sits (before scaling), so its shadow can sit just under it
  g.updateMatrixWorld(true);
  let minY = 0; const v = new T.Vector3();
  g.traverse((n) => {
    if (!n.geometry) return;
    if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
    const b = n.geometry.boundingBox;
    for (let i = 0; i < 8; i++) { v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(n.matrixWorld); if (v.y < minY) minY = v.y; }
  });
  return { group: g, height, flame, minY };
}

/* ------------------------------------------------------------------ one scene for both stage kinds */

export async function create(ctx) {
  const { T, stage, host, canvas, renderer: R, frame } = ctx;
  const box = canvas.parentNode;                       // the reserved .cr3d-stage
  const isPieces = stage.kind === 'pieces';
  const kinds = isPieces ? KINDS : [stage.study];
  const own = [];
  const tex = { stone: stoneTexture(T), rope: ropeTexture(T, false), ropeBump: ropeTexture(T, true) };
  const env = envTexture(T); const shadowTex = softShadow(T);
  own.push(tex.stone, tex.rope, tex.ropeBump, env, shadowTex);

  R.autoClear = true; R.setClearColor(0x000000, 0);
  R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
  const scene = new T.Scene();
  scene.environment = env; scene.environmentIntensity = 0.85;
  const cam = new T.PerspectiveCamera(30, 1, 0.1, 60);
  cam.position.set(0, 0.55, 7.4); cam.lookAt(0, 0, 0);

  const key = new T.DirectionalLight(0xfff0dc, 1.6); key.position.set(-3, 4, 5); scene.add(key);
  const rim = new T.DirectionalLight(0x9ec3ff, 0.7); rim.position.set(4, 2, -3); scene.add(rim);
  scene.add(new T.AmbientLight(0xffffff, 0.12));

  const objects = kinds.map((k) => {
    const o = build(T, k, { R, env, tex, own });
    o.kind = k; o.size = (isPieces ? 2.35 : 2.8) / o.height; o.group.scale.setScalar(o.size); o.floorY = o.minY * o.size;
    const pivot = new T.Group(); pivot.add(o.group); scene.add(pivot); o.pivot = pivot;
    return o;
  });

  // the grounding shadow
  const shadow = new T.Mesh(new T.PlaneGeometry(3.6, 3.6), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.5 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.2; scene.add(shadow); own.push(shadow.geometry, shadow.material);

  // the candle's flame, a point light and a halo, in world space (the wick is on the turning axis)
  let flameMesh = null; let halo = null; let candleLight = null; const FU = { uTime: { value: 0 }, uFlicker: { value: 1 } };
  const candle = objects.find((o) => o.kind === 'candle');
  if (candle) {
    const s = candle.size;
    const FLAME_H = 0.8; const wickTop = (0.95 + 0.085) * s;
    flameMesh = new T.Mesh(new T.PlaneGeometry(0.45, FLAME_H), new T.ShaderMaterial({ vertexShader: FLAME_VS, fragmentShader: FLAME_FS, uniforms: FU, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    flameMesh.position.set(0, wickTop + FLAME_H / 2 - 0.03, 0.05); flameMesh.renderOrder = 6; scene.add(flameMesh);
    halo = new T.Mesh(new T.PlaneGeometry(3.4, 3.4), new T.ShaderMaterial({ vertexShader: FLAME_VS, fragmentShader: HALO_FS, uniforms: { uFlicker: FU.uFlicker, uStrength: { value: isPieces ? 0.55 : 0.8 } }, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    halo.position.set(0, wickTop + 0.3, -0.4); halo.renderOrder = 0; scene.add(halo);
    candleLight = new T.PointLight(0xffa24a, 3.2, 6, 1.6); candleLight.position.set(0, wickTop + 0.25, 0.25); scene.add(candleLight);
    own.push(flameMesh.geometry, flameMesh.material, halo.geometry, halo.material);
  }

  try { if (R.compileAsync) await R.compileAsync(scene, cam); } catch (e) { /* first draw compiles instead */ }

  // ---- where the stage sits ----
  const rail = isPieces ? host.querySelector('#rail') : null;
  let lastCss = null;
  const setCss = (v) => { if (v !== lastCss) { lastCss = v; box.style.cssText = v; } };
  function layout() {
    const wide = isPieces ? mq('(min-width: 900px)') : mq('(min-width: 1000px)');
    if (!wide) { setCss(''); return; }                 // narrow: the stylesheet keeps it in the flow
    const hr = host.getBoundingClientRect();
    if (isPieces) {
      // the empty area to the right of the header's paragraph, clear of the scroll gauge at the page's right edge
      const head = host.querySelector('.tb-head'); const h = head.getBoundingClientRect();
      const lede = host.querySelector('.tb-lede'); const lr = (lede || head).getBoundingClientRect();
      const left = lr.right + 28; const limit = Math.min(h.right, window.innerWidth - 150);
      const W = Math.min(430, limit - left); const H = Math.max(300, Math.min(400, h.height + 20));
      if (W < 230) { setCss('display:none'); return; }
      setCss('left:' + Math.round(left - hr.left) + 'px;top:' + Math.round(h.top - hr.top + 10) + 'px;width:' + Math.round(W) + 'px;height:' + Math.round(H) + 'px');
    } else {
      // the text column stretches to the full row, so measure to its last line, not its box
      const txt = host.querySelector('.sample-txt'); const t = txt.getBoundingClientRect();
      const lastLine = (txt.lastElementChild || txt).getBoundingClientRect();
      const H = clamp(hr.height - (lastLine.bottom - hr.top) - 56, 0, 380);
      if (H < 170) { setCss('display:none'); return; }
      setCss('left:' + Math.round(t.left - hr.left) + 'px;top:' + Math.round(lastLine.bottom - hr.top + host.scrollTop + 24) + 'px;width:' + Math.round(Math.min(t.width + 40, 420)) + 'px;height:' + Math.round(H) + 'px');
    }
  }
  layout();
  window.addEventListener('resize', layout);

  let w = 1; let h = 1; let spin = 0; let lastShow = -1;
  return {
    resize(cw, ch) { w = cw; h = ch; cam.aspect = cw / ch; cam.updateProjectionMatrix(); },
    draw(t, dt) {
      if ((t * 4 | 0) !== lastShow) { lastShow = t * 4 | 0; layout(); }
      // turning: idle spin, plus the rail (pieces) or the pointer (studies)
      const px = frame.pointer.mouse ? frame.pointer.sx : Math.sin(t * 0.17) * 0.4;
      const py = frame.pointer.mouse ? frame.pointer.sy : 0;
      spin += dt * 0.32;
      let focus = 0; let raw = 0;
      if (isPieces) {
        const max = rail ? rail.scrollWidth - rail.clientWidth : 0;
        const hr = host.getBoundingClientRect();
        const p = max > 8 ? clamp(rail.scrollLeft / max, 0, 1) : clamp((frame.vh - hr.top) / (hr.height + frame.vh), 0, 1);
        raw = p * (KINDS.length - 1);
        const fl = Math.floor(raw); focus = Math.min(KINDS.length - 1, fl + smooth(0.32, 0.68, raw - fl));
      }
      objects.forEach((o, i) => {
        const d = isPieces ? Math.abs(focus - i) : 0;
        const s = isPieces ? smooth(0.62, 0.16, d) : 1;           // each study grows in as the rail reaches it and shrinks away as it leaves
        o.pivot.visible = s > 0.01;
        if (!o.pivot.visible) return;
        o.pivot.scale.setScalar(lerp(0.55, 1, s));
        o.pivot.position.y = (1 - s) * -0.35;
        o.pivot.rotation.y = spin + (isPieces ? raw * 2.4 + frame.scrollY * 0.0016 : 0) + px * 0.45 + i * 0.7;
        o.pivot.rotation.x = py * 0.12;
      });
      let fy = 0; let fw = 0;
      objects.forEach((o) => { if (o.pivot.visible) { const w = o.pivot.scale.x - 0.5; fy += o.floorY * w; fw += w; } });
      if (fw > 0) { shadow.position.y = fy / fw - 0.07; shadow.material.opacity = 0.5 * clamp(fw * 1.2, 0, 1); }
      // the candle burns whenever it is in view
      const flick = 0.9 + 0.1 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1.7) + (Math.sin(t * 23.0) * 0.03);
      FU.uTime.value = t; FU.uFlicker.value = flick;
      if (candleLight) candleLight.intensity = 3.2 * flick;
      if (flameMesh) {
        const show = isPieces ? smooth(0.62, 0.16, Math.abs(focus - KINDS.indexOf('candle'))) : 1;
        flameMesh.visible = halo.visible = show > 0.02; candleLight.visible = show > 0.02;
        flameMesh.scale.setScalar(lerp(0.4, 1, show)); halo.material.uniforms.uStrength.value = (isPieces ? 0.55 : 0.8) * show;
      }
      R.render(scene, cam);
      return true;
    },
    dispose() {
      window.removeEventListener('resize', layout);
      own.forEach((o) => { try { o.dispose && o.dispose(); } catch (e) { /* ignore */ } });
      objects.forEach((o) => o.group.traverse((n) => { if (n.geometry) n.geometry.dispose(); }));
      setCss('');
    },
  };
}
