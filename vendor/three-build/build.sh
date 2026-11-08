#!/usr/bin/env bash
# Rebuilds vendor/three-cr.min.js: a tree-shaken, minified ES module of three.js with only the classes listed in
# entry.js (the full library is about 4x larger). Needs Node 18+. Nothing here is loaded by the site; only the
# output file is. See vendor/LICENSES.md.
set -euo pipefail
THREE_VERSION=0.186.1
ESBUILD_VERSION=0.28.2
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$here/entry.js" "$work/entry.js"
cd "$work"
npm init -y >/dev/null
npm install --no-audit --no-fund --silent "three@$THREE_VERSION" "esbuild@$ESBUILD_VERSION"
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=inline --target=es2020 \
  --banner:js="/* three.js r${THREE_VERSION#0.} (MIT), tree-shaken for caymanrituals: see vendor/LICENSES.md */" \
  --outfile="$here/../three-cr.min.js"
echo "wrote vendor/three-cr.min.js ($(wc -c < "$here/../three-cr.min.js") bytes)"
