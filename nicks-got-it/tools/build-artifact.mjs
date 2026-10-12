// Builds a single self-contained HTML page for publishing as a claude.ai Artifact:
// game code + CSS inlined, Phaser loaded from a CDN (jsDelivr, with unpkg as fallback).
// Usage: node tools/build-artifact.mjs [outFile]
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.argv[2] ?? path.join(root, 'artifact', 'nicks-got-it.html');
const PHASER = '3.90.0';

const res = await build({
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  outdir: 'out',
  alias: { phaser: path.join(root, 'src/phaser-global.ts') },
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
  // Phaser from jsDelivr; if that fails, unpkg. Then start the game.
  (function () {
    var urls = ['https://cdn.jsdelivr.net/npm/phaser@${PHASER}/dist/phaser.min.js', 'https://unpkg.com/phaser@${PHASER}/dist/phaser.min.js'];
    function boot() { var s = document.createElement('script'); s.textContent = document.getElementById('game-src').textContent; document.body.appendChild(s); }
    function load(i) {
      if (i >= urls.length) { document.querySelector('#start .tag').textContent = 'Couldn’t load the game engine. Check your connection and reload.'; return; }
      var s = document.createElement('script');
      s.src = urls[i];
      s.onload = function () { window.Phaser ? boot() : load(i + 1); };
      s.onerror = function () { load(i + 1); };
      document.head.appendChild(s);
    }
    load(0);
  })();
</script>
<script type="text/plain" id="game-src">${js}</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(out, (page.length / 1024).toFixed(0) + ' KB');
