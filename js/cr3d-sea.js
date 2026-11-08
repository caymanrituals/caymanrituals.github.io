/* The living waterline.
 * Sea level is the thin strip between the layer cards. Its brass hairline (.sea) becomes a rippling waterline: swell
 * travelling along it, glints running down its length, and a little light falling into the water below. The canvas
 * is aligned to the page's own hairline, which is hidden while the canvas is drawing (injected CSS in cr3d.js), so
 * with no 3D the original line is exactly what shows.
 */
import { GLSL_NOISE } from './cr3d-kit.js';

const VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
const FS = `precision highp float;
uniform vec2 uRes; uniform float uTime, uX0, uX1, uYc; uniform vec3 uBrass, uBone;
varying vec2 vUv;
${GLSL_NOISE}
void main(){
  vec2 px = vUv * uRes;
  float x0 = uX0 * uRes.x, x1 = uX1 * uRes.x, yc = uYc * uRes.y;
  float t = uTime;
  float inside = smoothstep(x0 - 1.0, x0 + 1.0, px.x) * smoothstep(x1 + 1.0, x1 - 1.0, px.x);
  float taper = smoothstep(0.0, 60.0, px.x - x0) * smoothstep(0.0, 60.0, x1 - px.x);
  // swell: long travelling waves plus a little chop, rising toward the middle of the line
  float w = (sin(px.x * 0.016 - t * 0.9) * 1.7 + sin(px.x * 0.043 + t * 1.5) * 0.95
           + (vn(vec2(px.x * 0.02 - t * 0.5, t * 0.3)) - 0.5) * 2.4) * (0.35 + 0.65 * taper);
  float y = yc + w;
  float d = abs(px.y - y);
  float line = 1.0 - smoothstep(0.0, 1.15, d);
  float halo = exp(-d * d / 30.0) * 0.30;
  // glints: bright flecks that run along the crest
  float gate = smoothstep(0.52, 0.84, vn(vec2(px.x * 0.011 - t * 0.22, t * 0.13)));      // only stretches of the crest flare
  float g = pow(max(0.0, sin(px.x * 0.085 + t * 1.7 + vn(vec2(px.x * 0.03, t * 0.25)) * 9.0)), 38.0);
  float glint = g * gate * (0.55 + 0.45 * vn(vec2(px.x * 0.05, t * 0.6))) * exp(-d * d / 7.0);
  // light falling into the water below the line, breaking into faint caustic flecks
  float below = step(y, px.y) * 0.0 + step(px.y, y) * exp(-(y - px.y) / 7.0);
  float fleck = pow(ridge(vec2(px.x * 0.045 + t * 0.05, px.y * 0.16 - t * 0.3)), 5.0);
  float under = below * fleck * 0.22;
  float a = (line * 0.95 + halo + glint * 0.85 + under) * inside;
  vec3 col = mix(uBrass, uBone, clamp(glint * 1.4 + under * 0.6, 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

export async function create(ctx) {
  const { T, host, canvas, renderer: R, pal } = ctx;
  const sea = host.querySelector('.sea');
  if (!sea) return null;
  R.autoClear = true;
  R.setClearColor(0x000000, 0);
  const U = {
    uRes: { value: new T.Vector2(1, 1) }, uTime: { value: 0 }, uX0: { value: 0 }, uX1: { value: 1 }, uYc: { value: 0.5 },
    uBrass: { value: new T.Color().fromArray(pal.brass) }, uBone: { value: new T.Color().fromArray(pal.bone) },
  };
  const scene = new T.Scene();
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, uniforms: U, transparent: true, depthTest: false, depthWrite: false,
  }));
  scene.add(quad);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  try { if (R.compileAsync) await R.compileAsync(scene, cam); } catch (e) { /* the first draw compiles instead */ }
  host.classList.add('cr3d-sea-on');
  let n = 0;

  function align() {
    const r = sea.getBoundingClientRect(); const c = canvas.getBoundingClientRect();
    if (!c.width || !c.height) return;
    U.uX0.value = (r.left - c.left) / c.width;
    U.uX1.value = (r.right - c.left) / c.width;
    U.uYc.value = 1 - (r.top + r.height / 2 - c.top) / c.height;
  }
  return {
    resize(w, h) { U.uRes.value.set(w, h); align(); },   // css pixels: wave size does not change with display density
    draw(t) {
      if ((n++ & 31) === 0) align();                   // the label can reflow; the line follows it
      U.uTime.value = t;
      R.render(scene, cam);
      return true;
    },
    dispose() {
      host.classList.remove('cr3d-sea-on');
      quad.geometry.dispose(); quad.material.dispose();
    },
  };
}
