/* Scent and light drifting with scroll: one preset per layer of the Cayman section.
 *
 * Each card gets a transparent canvas behind its text. Two things are drawn:
 *   - a "light field" shader that belongs to the layer: cloud shadow over the Bluff (air), banded light through the
 *     fissures of Caymanite (earth), dappled light through the thatch fronds (fire), caustics falling through
 *     Ironshore water (water). Trench and the floor have none: they are dark water.
 *   - motes that rise or fall at three depths, with the nearer ones larger, softer and quicker, and parallax with
 *     the scroll, so scent seems to drift past as you read down the island. In the Trench a few motes pulse like
 *     bioluminescence.
 * The colours come from the page's own tokens; nothing here touches text or layout.
 */
import { GLSL_NOISE, clamp } from './cr3d-kit.js';

const VS_QUAD = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';

/* ---- the light fields: each returns vec4(rgb, alpha) for a point uv (0..1, y up) ---- */
const FIELDS = {
  cloud: `
    vec2 q = vec2(uv.x * asp * 1.1, uv.y * 0.9) + vec2(t * 0.012, uScroll * 0.25);
    float c = fbm(q * 1.5 + fbm(q * 0.7 + t * 0.01) * 1.2);
    float shade = smoothstep(0.5, 0.78, c);
    return vec4(vec3(0.16, 0.20, 0.27), shade * 0.11);`,
  strata: `
    float y = uv.y * 8.0 + fbm(vec2(uv.x * 2.6, uv.y * 1.8) + t * 0.02) * 2.4 + uScroll * 0.9;
    float band = smoothstep(0.30, 0.55, abs(sin(y * 3.14159)));
    float grain = fbm(vec2(uv.x * 14.0 * asp, y * 2.0));
    vec3 ox = uC1; vec3 amber = uC2;
    float shaft = pow(max(0.0, sin((uv.x * asp * 0.8 - uv.y * 0.6) * 4.2 + t * 0.14 + uScroll * 0.6)), 7.0);
    float a1 = band * (0.03 + 0.04 * grain);
    float a2 = shaft * 0.065;
    float a = a1 + a2;
    return vec4((ox * a1 + amber * a2) / max(a, 0.0001), a);`,
  dapple: `
    vec2 q = mat2(0.88, -0.48, 0.48, 0.88) * vec2(uv.x * asp, uv.y) * 4.2 + vec2(t * 0.07, uScroll * 0.3);
    float leaf = fbm(q + fbm(q * 1.7 - t * 0.05) * 1.1);
    float sun = smoothstep(0.58, 0.64, leaf);
    float shadow = smoothstep(0.40, 0.30, leaf);
    float a1 = sun * 0.17; float a2 = shadow * 0.10;
    float a = a1 + a2;
    return vec4((uC2 * a1 + uC1 * a2) / max(a, 0.0001), a);`,
  caustic: `
    vec2 q = vec2(uv.x * asp, uv.y) * 2.2;
    float c = 0.0;
    for (int i = 0; i < 3; i++) {
      q += vec2(vn(q * 1.3 + t * 0.14), vn(q * 1.3 - t * 0.11 + 4.0)) * 0.85;
      c += pow(ridge(q * (1.0 + float(i) * 0.7) + t * 0.06 * float(i + 1)), 7.0);
    }
    c /= 3.0;
    float depth = pow(clamp(uv.y, 0.0, 1.0), 1.3);          // brightest at the top edge, where the light comes in
    return vec4(mix(uC1, uC2, 0.35), c * 0.24 * depth);`,
  shafts: `
    float band = sin((uv.x * asp * 0.9 - uv.y * 0.75) * 5.2 - t * 0.11 + uScroll * 0.5);
    float body = pow(max(0.0, band), 5.0) * (0.55 + 0.45 * fbm(vec2(uv.x * 3.0 * asp, uv.y * 2.0) + t * 0.03));
    float fade = smoothstep(0.0, 0.5, uv.y) * 0.7 + 0.3;     // the light falls away toward the floor
    return vec4(uC1, body * 0.11 * fade);`,
  none: `return vec4(0.0);`,
};

/* ---- the presets ---- */
const PRESETS = {
  bluff: { field: 'cloud', gain: 2.6, n: [26, 44], size: [1.8, 5.0], alpha: [0.18, 0.42], dir: 1, speed: 0.006, sway: 0.05, par: 0.55, add: false, c1: [0.30, 0.27, 0.24], c2: [0.55, 0.42, 0.30], fc1: null, fc2: null },
  caymanite: { field: 'strata', gain: 1.7, n: [28, 48], size: [1.8, 5.2], alpha: [0.18, 0.42], dir: 1, speed: 0.007, sway: 0.04, par: 0.6, add: false, c1: 'oxblood', c2: [0.78, 0.52, 0.28], fc1: 'oxblood', fc2: [0.80, 0.56, 0.30] },
  thatch: { field: 'dapple', gain: 1.4, n: [30, 50], size: [1.6, 4.6], alpha: [0.2, 0.42], dir: 1, speed: 0.009, sway: 0.09, par: 0.7, add: false, c1: [0.30, 0.37, 0.20], c2: [0.62, 0.55, 0.28], fc1: [0.14, 0.19, 0.09], fc2: [1.0, 0.97, 0.84] },
  ironshore: { field: 'caustic', gain: 1.7, n: [34, 60], size: [1.4, 4.2], alpha: [0.25, 0.7], dir: 1, speed: 0.011, sway: 0.05, par: 0.8, add: true, c1: 'bone', c2: 'brass', fc1: 'brass', fc2: 'bone' },
  carry: { field: 'shafts', n: [40, 72], size: [1.5, 4.2], alpha: [0.3, 0.75], dir: 1, speed: 0.006, sway: 0.05, par: 0.5, add: true, c1: [1.0, 0.86, 0.66], c2: [1.0, 0.72, 0.5], fc1: [1.0, 0.86, 0.66], fc2: [1.0, 0.7, 0.5] },
  trench: { field: 'none', n: [200, 460], size: [1.5, 5.0], alpha: [0.2, 0.85], dir: -1, speed: 0.011, sway: 0.03, par: 1.0, add: true, c1: 'bone', c2: 'brass', bio: 0.03 },
  take: { field: 'none', n: [40, 80], size: [1.4, 4.0], alpha: [0.22, 0.6], dir: -1, speed: 0.006, sway: 0.04, par: 0.7, add: true, c1: 'brass', c2: 'bone' },
  floor: { field: 'none', n: [120, 260], size: [1.4, 4.6], alpha: [0.2, 0.7], dir: -1, speed: 0.01, sway: 0.03, par: 0.9, add: true, c1: 'bone', c2: 'brass', bio: 0.018 },
};

const MOTE_VS = `
attribute vec4 aSeed;
uniform float uTime, uScroll, uPR, uDir, uSpeed, uSway, uPar, uS0, uS1, uA0, uA1, uBio;
uniform vec2 uPtr;
varying float vA, vSoft, vMix, vPulse;
void main(){
  float near = 1.0 - aSeed.z;
  float par = mix(0.25, 1.4, near);
  float y = aSeed.y + uDir * uTime * uSpeed * (0.6 + aSeed.w) * par + uScroll * par * uPar;
  y = mod(y + 1.15, 2.3) - 1.15;
  float x = aSeed.x + sin(uTime * 0.07 * (1.0 + aSeed.w) + aSeed.w * 20.0) * uSway * par;
  x = mod(x + 1.1, 2.2) - 1.1;
  vec2 p = vec2(x, y) - uPtr * vec2(1.0, -1.0) * 0.035 * par;
  gl_Position = vec4(p, 0.0, 1.0);
  float bio = step(1.0 - uBio, aSeed.w);
  float pulse = bio * pow(max(0.0, sin(uTime * 0.42 + aSeed.w * 913.0)), 14.0);
  gl_PointSize = (mix(uS0, uS1, pow(near, 3.0)) + pulse * 18.0) * uPR;
  float edge = smoothstep(-1.0, -0.8, y) * smoothstep(1.0, 0.8, y);
  vA = mix(uA0, uA1, near) * (0.7 + 0.3 * sin(uTime * 0.5 + aSeed.w * 70.0)) * (1.0 - 0.6 * pow(near, 6.0)) * edge;
  vSoft = pow(near, 3.0); vMix = fract(aSeed.w * 7.0); vPulse = pulse;
}`;

const MOTE_FS = `
precision mediump float;
uniform vec3 uCA, uCB, uGlow;
varying float vA, vSoft, vMix, vPulse;
void main(){
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(mix(0.25, 0.0, vSoft), 1.0, r);
  float halo = exp(-r * r * 5.0);
  vec3 col = mix(mix(uCA, uCB, vMix), uGlow, vPulse);
  float a = core * vA * (1.0 - vPulse) + halo * vPulse * 0.9;
  gl_FragColor = vec4(col, a);
}`;

function fieldFrag(kind) {
  return `precision highp float;
uniform float uTime, uScroll, uAsp, uGain; uniform vec3 uC1, uC2; varying vec2 vUv;
${GLSL_NOISE}
vec4 field(vec2 uv, float t, float asp){ ${FIELDS[kind]} }
void main(){ vec4 f = field(vUv, uTime, uAsp); gl_FragColor = vec4(f.rgb, clamp(f.a * uGain, 0.0, 1.0)); }`;
}

export async function create(ctx) {
  const { T, host, canvas, renderer: R, stage, frame, pal } = ctx;
  const P = PRESETS[stage.preset];
  if (!P) return null;
  const col = (v) => new T.Color().fromArray(typeof v === 'string' ? pal[v] : v);
  const m = frame.mobile ? 0 : 1;
  const N = P.n[m];

  const scene = new T.Scene();
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  R.autoClear = true;
  R.setClearColor(0x000000, 0);

  // the light field
  let quad = null;
  const FU = {
    uTime: { value: 0 }, uScroll: { value: 0 }, uAsp: { value: 1 }, uGain: { value: P.gain || 1 },
    uC1: { value: col(P.fc1 || P.c1) }, uC2: { value: col(P.fc2 || P.c2) },
  };
  if (P.field !== 'none') {
    quad = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
      vertexShader: VS_QUAD, fragmentShader: fieldFrag(P.field), uniforms: FU, transparent: true,
      blending: (P.field === 'caustic' || P.field === 'shafts') ? T.AdditiveBlending : T.NormalBlending, depthTest: false, depthWrite: false,
    }));
    quad.renderOrder = 0;
    scene.add(quad);
  }

  // the motes
  const seeds = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    seeds[i * 4] = Math.random() * 2.2 - 1.1;
    seeds[i * 4 + 1] = Math.random() * 2.3 - 1.15;
    seeds[i * 4 + 2] = Math.random();
    seeds[i * 4 + 3] = Math.random();
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aSeed', new T.BufferAttribute(seeds, 4));
  const U = {
    uTime: { value: 0 }, uScroll: { value: 0 }, uPR: { value: 1 }, uPtr: { value: new T.Vector2() },
    uDir: { value: P.dir }, uSpeed: { value: P.speed }, uSway: { value: P.sway }, uPar: { value: P.par },
    uS0: { value: P.size[0] }, uS1: { value: P.size[1] }, uA0: { value: P.alpha[0] }, uA1: { value: P.alpha[1] },
    uBio: { value: P.bio || 0 },
    uCA: { value: col(P.c1) }, uCB: { value: col(P.c2) }, uGlow: { value: new T.Color(0.55, 0.86, 0.92) },
  };
  const pts = new T.Points(g, new T.ShaderMaterial({
    vertexShader: MOTE_VS, fragmentShader: MOTE_FS, uniforms: U, transparent: true,
    blending: P.add ? T.AdditiveBlending : T.NormalBlending, depthTest: false, depthWrite: false,
  }));
  pts.frustumCulled = false;
  pts.renderOrder = 1;
  scene.add(pts);

  try { if (R.compileAsync) await R.compileAsync(scene, cam); } catch (e) { /* the first draw compiles instead */ }
  return {
    resize(w, h, pr) { U.uPR.value = pr; FU.uAsp.value = w / h; },
    draw(t) {
      const r = host.getBoundingClientRect();
      // how far through the viewport this card has travelled (0 as it enters at the bottom, 1 as it leaves at the top)
      const sc = clamp((frame.vh - r.top) / (frame.vh + r.height), -0.2, 1.2) * 2.0;
      U.uTime.value = t; FU.uTime.value = t;
      U.uScroll.value = sc; FU.uScroll.value = sc;
      U.uPtr.value.x = frame.pointer.mouse ? frame.pointer.sx : 0; U.uPtr.value.y = frame.pointer.mouse ? frame.pointer.sy : 0;
      R.render(scene, cam);
      return true;
    },
    dispose() {
      if (quad) { quad.geometry.dispose(); quad.material.dispose(); }
      g.dispose(); pts.material.dispose();
      host.classList.remove('cr3d-lift');
    },
  };
}
