#!/usr/bin/env node
/* ============================================================
   NORTHERN LIGHTS RUN — tools/build_single.js
   Inlines css / js / assets from index.html into a single,
   portable file: northern-lights-run.html
     • css/style.css        → <style>
     • js/audio.js          → classic <script> (as-is)
     • js/*.js ES modules   → one bundled <script type="module">
       (boot.js entry, topologically sorted, `import 'three'`
       kept — three.js itself stays on the CDN via the importmap,
       so the single file still needs internet for three.js)
     • assets (png/jpg)     → base64 data URIs
   Usage:  node tools/build_single.js
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'text/javascript' };

function dataUri(file) {
  const p = path.join(ROOT, file);
  const ext = path.extname(file).toLowerCase();
  if (!mime[ext]) throw new Error('unsupported asset type: ' + file);
  const b64 = fs.readFileSync(p).toString('base64');
  return `data:${mime[ext]};base64,${b64}`;
}

/* ---------------- module bundling ---------------- */
const modules = {};
const RE_IMPORT_STAR = /import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"];?/g;
const RE_IMPORT_NAMED = /import\s+\{([^}]*)\}\s*from\s+['"]([^'"]+)['"];?/g;
const RE_IMPORT_BARE = /import\s+['"]([^'"]+)['"];?/g;
const RE_EXPORT_LIST = /export\s*\{[^}]*\};?/g;
const RE_EXPORT_DECL = /^export\s+(?=function|const|let|var|class)/;

function parseModule(file) {
  if (modules[file]) return modules[file];
  const src = read('js/' + file);
  const m = { file, deps: [], usesThree: false, body: src };
  modules[file] = m;

  // dependency scan (multi-line safe)
  RE_IMPORT_STAR.lastIndex = 0;
  let hit;
  while ((hit = RE_IMPORT_STAR.exec(src))) {
    if (hit[1] === 'three') m.usesThree = true;
    else if (hit[1].startsWith('./')) m.deps.push(hit[1].replace('./', '').replace(/\.js$/, ''));
  }
  RE_IMPORT_NAMED.lastIndex = 0;
  while ((hit = RE_IMPORT_NAMED.exec(src))) {
    if (hit[2] === 'three') m.usesThree = true;
    else if (hit[2].startsWith('./')) m.deps.push(hit[2].replace('./', '').replace(/\.js$/, ''));
  }
  RE_IMPORT_BARE.lastIndex = 0;
  while ((hit = RE_IMPORT_BARE.exec(src))) {
    if (hit[1].startsWith('./')) m.deps.push(hit[1].replace('./', '').replace(/\.js$/, ''));
  }

  // collect import aliases ({ update as simUpdate } → const simUpdate = update)
  const aliases = [];
  RE_IMPORT_NAMED.lastIndex = 0;
  let nhit;
  while ((nhit = RE_IMPORT_NAMED.exec(src))) {
    if (!nhit[2].startsWith('./')) continue;
    nhit[1].split(',').forEach(part => {
      const al = part.trim().match(/^\s*(\w+)\s+as\s+(\w+)\s*$/);
      if (al) aliases.push({ from: al[1], to: al[2] });
    });
  }

  // strip import/export statements
  let body = src
    .replace(RE_IMPORT_STAR, (all, spec) => spec === 'three' ? '/* three imported at bundle head */' : '')
    .replace(RE_IMPORT_NAMED, '')
    .replace(RE_IMPORT_BARE, '')
    .replace(RE_EXPORT_LIST, '');
  body = body.split('\n').map(l => l.replace(RE_EXPORT_DECL, '')).join('\n');
  aliases.forEach(a => { body += `\nconst ${a.to} = ${a.from};`; });
  m.body = body;

  m.deps.forEach(d => parseModule(d + '.js'));
  return m;
}
function topo(entry) {
  const order = [];
  const state = {}; // 0 visiting, 1 done
  function visit(file) {
    if (state[file] === 1) return;
    if (state[file] === 0) throw new Error('import cycle at ' + file);
    state[file] = 0;
    modules[file].deps.forEach(d => visit(d + '.js'));
    state[file] = 1;
    order.push(file);
  }
  visit(entry);
  return order;
}

const entry = 'boot.js';
parseModule(entry);
const order = topo(entry);
const usesThree = order.some(f => modules[f].usesThree);
let bundle = '';
if (usesThree) bundle += "import * as THREE from 'three';\n";
bundle += '/* ===== bundled modules: ' + order.join(', ') + ' ===== */\n';
order.forEach(f => { bundle += '\n/* ----- ' + f + ' ----- */\n' + modules[f].body + '\n'; });

/* ---------------- assemble ---------------- */
let html = read('index.html');

// 1. css → style tag
const css = read('css/style.css').replace(/url\((['"]?)(\.\.\/assets\/[^)'"]+)\1\)/g, (all, q, f) => `url("${dataUri(f.replace('../', ''))}")`);
html = html.replace(/<link rel="stylesheet" href="css\/style\.css">/, `<style>\n${css}\n</style>`);

// 2. audio (classic script, as-is)
const audio = read('js/audio.js');
html = html.replace(/<script src="js\/audio\.js"><\/script>/, `<script>\n${audio}\n</script>`);

// 3. modules → single module script
html = html.replace(/<script type="module" src="js\/boot\.js"><\/script>/, `<script type="module">\n${bundle}\n</script>`);

// 4. assets → data URIs
html = html.replace(/(src|href)="(assets\/[^"]+)"/g, (all, attr, f) => `${attr}="${dataUri(f)}"`);

// sanity checks
const problems = [];
if (html.includes('<link rel="stylesheet"')) problems.push('css link not inlined');
if (html.includes('<script src="js/')) problems.push('js script tag not inlined');
if (html.includes('src="assets/')) problems.push('asset ref not inlined');
if (problems.length) {
  console.error('❌ build_single: ' + problems.join(', '));
  process.exit(1);
}

const outPath = path.join(ROOT, 'northern-lights-run.html');
fs.writeFileSync(outPath, html);
const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
console.log(`✅ built northern-lights-run.html (${kb} KB)`);
console.log(`   modules bundled: ${order.join(' → ')}`);
console.log('   three.js: CDN via importmap (internet required, as designed)');
console.log('   google fonts: external (internet)');
