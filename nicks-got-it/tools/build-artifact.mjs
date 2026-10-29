// Builds a single self-contained HTML page for publishing as a claude.ai Artifact:
// game code + CSS inlined; Phaser and Three.js load from a CDN (jsDelivr, with unpkg as fallback)
// and are read from their globals (window.Phaser, window.THREE).
// Usage: node tools/build-artifact.mjs [outFile]
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.argv[2] ?? path.join(root, 'artifact', 'nicks-got-it.html');
const PHASER = '3.90.0';
const THREE = '0.158.0'; // last line with the UMD build (build/three.min.js)
const GLOBALS = { phaser: 'Phaser', three: 'THREE' };

const res = await build({
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  outdir: 'out',
  plugins: [
    {
      name: 'cdn-globals',
      setup(b) {
        b.onResolve({ filter: /^(phaser|three)$/ }, (a) => ({ path: a.path, namespace: 'cdn-global' }));
        b.onLoad({ filter: /.*/, namespace: 'cdn-global' }, (a) => ({ contents: `module.exports = window.${GLOBALS[a.path]};`, loader: 'js' }));
      },
    },
  ],
  define: { 'import.meta.env.DEV': 'false' },
  loader: { '.css': 'css' },
  logLevel: 'warning',
});
const js = res.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = res.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';

// Body markup from index.html (the artifact host supplies <html>/<head>/<body>).
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module"[^>]*><\/script>/, '')
  .trim();

const page = `<title>Nick's Got It</title>
<style>
/* Single-look dark game page: every color is set explicitly. */
:root { color-scheme: dark; }
${css}
</style>
${body}
<script>
  // Phaser and Three.js from jsDelivr; if one fails, unpkg. Then start the game.
  (function () {
    var libs = [
      { g: 'Phaser', urls: ['https://cdn.jsdelivr.net/npm/phaser@${PHASER}/dist/phaser.min.js', 'https://unpkg.com/phaser@${PHASER}/dist/phaser.min.js'] },
      { g: 'THREE', urls: ['https://cdn.jsdelivr.net/npm/three@${THREE}/build/three.min.js', 'https://unpkg.com/three@${THREE}/build/three.min.js'] },
    ];
    function fail() { document.querySelector('#start .tag').textContent = 'Couldn’t load the game engine. Check your connection and reload.'; }
    function boot() { var s = document.createElement('script'); s.textContent = document.getElementById('game-src').textContent; document.body.appendChild(s); }
    function load(li, ui) {
      if (li >= libs.length) return boot();
      var lib = libs[li];
      if (ui >= lib.urls.length) return fail();
      var s = document.createElement('script');
      s.src = lib.urls[ui];
      s.onload = function () { window[lib.g] ? load(li + 1, 0) : load(li, ui + 1); };
      s.onerror = function () { load(li, ui + 1); };
      document.head.appendChild(s);
    }
    load(0, 0);
  })();
</script>
<script type="text/plain" id="game-src">${js}</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(out, (page.length / 1024).toFixed(0) + ' KB');
