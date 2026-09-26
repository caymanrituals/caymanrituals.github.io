# caymanrituals.github.io

The Cayman Rituals website: one static page, `index.html`, served by GitHub Pages from this repository.

## What's here

- `index.html`: the whole site. Markup, styles and scripts in one file.
- `img/`: product studies and the hero photograph (credits in `CREDITS.txt`).
- `brand/`: the stamp (favicon) and the social share image.
- `fonts/`: Bodoni Moda and Manrope, self-hosted copies of the Google Fonts files, with `fonts.css` and the SIL Open Font Licence for each.
- `vendor/`: GSAP 3.12.5 with ScrollTrigger and Lenis 1.1.18, self-hosted. Versions and licences in `vendor/LICENSES.md`. The sea-level shader runs on raw WebGL written by hand; no three.js or other 3D library is loaded.
- `404.html`, `robots.txt`, `sitemap.xml`.
- `_headers`: security headers for Netlify or Cloudflare Pages. GitHub Pages ignores this file; it only takes effect if the site moves to one of those hosts.

The page loads nothing from other servers. It renders the same where Google and public CDNs are blocked, and sends no visitor data to Google.

## Preview locally

    python3 -m http.server 8000

Then open http://localhost:8000. Before merging a change, check three things: open a piece ("Open the layers") and scroll inside the panel; scroll through sea level on a phone or retina screen (the gold line should sit just above the "Sea level · 0 m" label); and turn on reduced motion in the operating system, where the page must still read top to bottom with everything visible.

## If the site moves to its own domain

Update the absolute URLs in `index.html` (canonical, `og:url`, `og:image`, the JSON-LD block), `sitemap.xml`, `robots.txt` and `404.html`, and add a `CNAME` file.
