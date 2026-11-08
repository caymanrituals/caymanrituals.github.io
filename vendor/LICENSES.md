# JavaScript Library Licenses

## GSAP (GreenSock Animation Platform)

**Version:** 3.12.5  
**NPM Package:** gsap@3.12.5  
**Files:** gsap.min.js, ScrollTrigger.min.js  
**Original CDN URLs:**
- https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js
- https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js

**License:** GreenSock Standard License

From the library header:
```
/*!
 * GSAP 3.12.5
 * https://gsap.com
 * 
 * @license Copyright 2024, GreenSock. All rights reserved.
 * Subject to the terms at https://gsap.com/standard-license or for Club GSAP members, the agreement issued with that membership.
 * @author: Jack Doyle, jack@greensock.com
 */
```

See https://gsap.com/standard-license for the full license terms.

---

## Lenis

**Version:** 1.1.18  
**NPM Package:** lenis@1.1.18  
**File:** lenis.min.js  
**Original CDN URL:** https://cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.min.js

**License:** MIT

```
The MIT License

Copyright (c) 2024 darkroom.engineering

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## three.js — removed 2026-09-26

The sea-level shader previously ran on three.js r158 (`vendor/three.min.js`). It has been replaced with
about 50 lines of raw WebGL (same fragment shader, no library) to cut 636 KB of unused surface area. There
is nothing to licence here any more; this note exists so the history isn't silently lost.

---

## three.js — returned 2026-11-08, tree-shaken (see the history above)

**Version:** 0.186.1 (r186.1)  
**NPM Package:** three@0.186.1  
**File:** three-cr.min.js, a tree-shaken, minified ES module (about 577 KB, about 146 KB gzipped) holding only the
classes the site uses.  
**Built by:** `vendor/three-build/build.sh` from `vendor/three-build/entry.js` (esbuild 0.28.2; the entry file lists
every class used, so rebuild after changing it). Nothing in `vendor/three-build/` is loaded by the site.

**License:** MIT

```
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

It drives the 3D layer in `js/` (`cr3d.js` and its scene modules). The layer is decoration only: it fetches three.js
after the page has loaded, and not at all when the visitor prefers reduced motion, has Save-Data on, reports under
2 GB of memory, or has no WebGL 2, so the page is complete without it.

`img/hero-mask-*.jpg` are derived from the hero and collection photographs (open water, scrub and surf as three
greyscale tiles). Regenerate them with `vendor/three-build/make-masks.mjs` whenever those photographs change.
