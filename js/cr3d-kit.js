/* Shared helpers for the 3D layer: media queries, palette read from the page's own CSS tokens, GLSL chunks. */

export const doc = document;
export const root = doc.documentElement;
export const DEBUG = /[?&]cr3d-debug\b/.test(location.search);
export const log = (...a) => { if (DEBUG) console.log('[cr3d]', ...a); };

export function mq(q) { return !!(window.matchMedia && window.matchMedia(q).matches); }
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* A palette colour as [r, g, b] in 0..1, read from the page's CSS custom properties (so the 3D layer never
   disagrees with the design tokens). */
export function css(name, fallback) {
  const h = (getComputedStyle(root).getPropertyValue(name) || '').trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return fallback;
  return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255);
}

export function palette() {
  return {
    limestone: css('--limestone', [0.93, 0.93, 0.91]), clay: css('--clay', [0.9, 0.84, 0.8]),
    thatch: css('--thatch', [0.84, 0.84, 0.78]), ironshore: css('--ironshore', [0.13, 0.13, 0.12]),
    trench: css('--trench', [0.04, 0.08, 0.09]), brass: css('--brass', [0.77, 0.64, 0.42]),
    bone: css('--bone', [0.93, 0.91, 0.89]), oxblood: css('--oxblood', [0.43, 0.14, 0.21]),
    ink: css('--ink', [0.11, 0.1, 0.11]),
  };
}

/* One smooth noise, a fractal sum of it, and a ridged variant: the building blocks for water, cloud shadow,
   stone strata, leaf light and caustics. Written for this site. */
export const GLSL_NOISE = `
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x),f.y);}
float fbm(vec2 p){float a=0.5,s=0.0;mat2 r=mat2(0.8,-0.6,0.6,0.8);for(int i=0;i<4;i++){s+=a*vn(p);p=r*p*2.03+7.1;a*=0.5;}return s;}
float ridge(vec2 p){return 1.0-abs(vn(p)*2.0-1.0);}
`;
