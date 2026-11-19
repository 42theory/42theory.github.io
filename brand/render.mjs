#!/usr/bin/env node
// 42theory: renders the raster brand files (share card, logo, touch and app icons, favicon.ico) from their sources.
// Headless Chrome is driven over its debugging pipe; there are no dependencies beyond Node and Chrome.
//
//   node brand/render.mjs <site folder>
//
// <site folder> holds the published site: assets/favicon.svg, assets/42theory-lockup.svg, assets/fonts/*.woff2,
// the anatomy data and the drawing engine (the built bundle, or nc.js, nv.js and bb.js in a working copy).
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(process.argv[2] || 'site'), HERE = fileURLToPath(new URL('.', import.meta.url)), A = join(SITE, 'assets');
const need = (p) => { if (!existsSync(p)) { console.error('missing: ' + p); process.exit(2); } return p; };
['favicon.svg', '42theory-lockup.svg', 'fonts/Geist-Variable.woff2', 'fonts/GeistMono-Variable.woff2'].forEach((f) => need(join(A, f)));
need(join(HERE, 'logo-square.svg'));

// the drawing engine and the anatomy, as the site ships them: the separate sources in a working copy, or the two files the published home page names
const home = existsSync(join(SITE, 'index.html')) ? readFileSync(join(SITE, 'index.html'), 'utf8') : '';
const named = (re, what) => { const m = home.match(re); if (!m || !existsSync(join(A, m[1]))) { console.error(`index.html does not name a ${what} that exists in ${A}`); process.exit(2); } return m[1]; };
const engine = existsSync(join(A, 'nv.js')) ? ['nc.js', 'nv.js', 'bb.js'] : [named(/<script src="assets\/(42theory\.[0-9a-f]{8}\.js)"/, 'script bundle')];
const anatomy = existsSync(join(A, 'anatomy.js')) ? 'anatomy.js' : named(/<script src="assets\/(anatomy\.[0-9a-f]{8}\.js)"/, 'anatomy file');

// ---------------------------------------------------------------- pages to photograph
const WORK = mkdtempSync(join(tmpdir(), 'brand-'));
const fav = readFileSync(join(A, 'favicon.svg'), 'utf8');
const swap = (s, a, b) => { if (!s.includes(a)) { console.error('favicon.svg has changed shape: ' + a + ' not found'); process.exit(2); } return s.replace(a, b); };
// the touch icon fills its square (the phone rounds the corners itself); the maskable icon keeps the mark inside the safe zone
writeFileSync(join(WORK, 'touch.svg'), swap(fav, 'rx="26"', 'rx="0"'));
writeFileSync(join(WORK, 'maskable.svg'), swap(swap(fav, 'rx="26"', 'rx="0"'), 'translate(10 10) scale(0.8333)', 'translate(22.8 22.8) scale(0.62)'));
writeFileSync(join(WORK, 'tile.svg'), fav);
writeFileSync(join(WORK, 'logo.svg'), readFileSync(join(HERE, 'logo-square.svg'), 'utf8'));
const READY = `<script>function ok(){document.documentElement.setAttribute('data-ready','1')}</script>`;
const imgPage = (svg, n) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}img{display:block}</style>${READY}</head><body><img src="/work/${svg}" width="${n}" height="${n}" alt="" onload="this.decode().then(ok,ok)"></body></html>`;
const cardPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>42theory card</title><style>
@font-face{font-family:"Geist";src:url(/site/assets/fonts/Geist-Variable.woff2) format("woff2");font-weight:100 900}
@font-face{font-family:"Geist Mono";src:url(/site/assets/fonts/GeistMono-Variable.woff2) format("woff2");font-weight:100 900}
html,body{margin:0;background:#0F1B24}
.card{position:relative;width:1200px;height:630px;overflow:hidden;background:#0F1B24;color:#fff;font-family:"Geist",sans-serif}
#cv{position:absolute;inset:0}
.lock{position:absolute;left:72px;top:64px;height:46px;width:auto}
h1{position:absolute;left:72px;top:214px;margin:0;font-weight:300;font-size:72px;line-height:1.04;letter-spacing:-0.032em}
h1 span{display:block}h1 .b{color:#4AA3FF}
.sub{position:absolute;left:74px;top:398px;margin:0;font-size:27px;font-weight:400;color:rgba(255,255,255,.82);letter-spacing:-0.005em}
.url{position:absolute;left:74px;bottom:62px;margin:0;font:400 21px "Geist Mono",monospace;color:#4AA3FF}
</style></head><body>
<div class="card"><canvas id="cv" width="1200" height="630"></canvas><img class="lock" id="lock" src="/site/assets/42theory-lockup.svg" alt="42theory">
<h1><span>Read the neural code.</span><span class="b">Then write it.</span></h1><p class="sub">The intelligence layer for neuroscience</p><p class="url">42theory.com</p></div>
${engine.map((f) => `<script src="/site/assets/${f}"></script>`).join('')}<script src="/site/assets/${anatomy}"></script>
<script>
// the reference brain as surface points, drawn by the page's own renderer
(function () {
  var cv = document.getElementById('cv'), g = cv.getContext('2d'), W = 1200, H = 630;
  function draw() {
    var M = BB.init(), b = M.anchors.brain;
    g.fillStyle = '#0F1B24'; g.fillRect(0, 0, W, H);
    var r = g.createRadialGradient(900, 320, 0, 900, 320, 760); r.addColorStop(0, 'rgba(34,58,76,0.6)'); r.addColorStop(1, 'rgba(15,27,36,0)'); g.fillStyle = r; g.fillRect(0, 0, W, H);
    var v = BB.view({ tx: b[0], ty: b[1], tz: b[2], yaw: 52, pitch: 8, k: 3250, cx: 932, cy: 322, R: 0.1, dot: 2.3, W: W, H: H });
    BB.draw(g, v, { skin: { a: 0.08 }, cortex: { a: 0.88, spark: 1 }, cingulate: { a: 0.3 }, insula: { a: 0.25 }, thalamus: { a: 0.25 }, deep: { a: 0.2 }, brainstem: { a: 0.75 }, cerebellum: { a: 0.75 } }, { t: 3.1 });
    var f = g.createLinearGradient(520, 0, 760, 0); f.addColorStop(0, 'rgba(15,27,36,0.96)'); f.addColorStop(1, 'rgba(15,27,36,0)'); g.fillStyle = f; g.fillRect(0, 0, 760, H);
    Promise.all([document.fonts.load('300 72px Geist'), document.fonts.load('400 27px Geist'), document.fonts.load('400 21px "Geist Mono"'), document.getElementById('lock').decode()]).then(function () {
      if (!document.fonts.check('300 72px Geist') || !document.fonts.check('400 21px "Geist Mono"')) { document.documentElement.setAttribute('data-ready', 'fonts'); return; }
      document.documentElement.setAttribute('data-ready', '1');
    }, function (e) { document.documentElement.setAttribute('data-ready', 'error: ' + e); });
  }
  if (window.ANAT) draw(); else document.addEventListener('anatomy', draw);
})();
</script></body></html>`;
writeFileSync(join(WORK, 'card.html'), cardPage);
const ICONS = { 'tile-16': ['tile.svg', 16], 'tile-32': ['tile.svg', 32], 'tile-48': ['tile.svg', 48], 'tile-192': ['tile.svg', 192], 'tile-512': ['tile.svg', 512], 'touch-180': ['touch.svg', 180], 'maskable-512': ['maskable.svg', 512], 'logo-800': ['logo.svg', 800] };
for (const [k, [svg, n]] of Object.entries(ICONS)) writeFileSync(join(WORK, k + '.html'), imgPage(svg, n));

// ---------------------------------------------------------------- a local server for the pages (same origin for fonts, scripts and images)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname), root = u.startsWith('/site/') ? SITE : u.startsWith('/work/') ? WORK : null;
  const file = root && normalize(join(root, u.slice(6)));
  if (!file || !file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

// ---------------------------------------------------------------- Chrome over the debugging pipe
const CHROME = process.env.CHROME_BIN || ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].find((b) => spawnSync(b, ['--version'], { stdio: 'ignore' }).status === 0);
if (!CHROME) { console.error('Chrome was not found. Set CHROME_BIN.'); process.exit(2); }
console.log(spawnSync(CHROME, ['--version'], { encoding: 'utf8' }).stdout.trim() + ', Node ' + process.version);
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--user-data-dir=' + join(WORK, 'profile'), '--remote-debugging-pipe', 'about:blank'], { stdio: ['ignore', 'ignore', 'inherit', 'pipe', 'pipe'] });
let seq = 0, buf = Buffer.alloc(0); const waiting = new Map();
chrome.stdio[4].on('data', (d) => {
  buf = Buffer.concat([buf, d]); let i;
  while ((i = buf.indexOf(0)) >= 0) { const m = JSON.parse(buf.subarray(0, i).toString('utf8')); buf = buf.subarray(i + 1); const w = m.id && waiting.get(m.id); if (w) { waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); } }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; waiting.set(id, { res, rej }); chrome.stdio[3].write(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }) + '\0'); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAILED: ' + msg); try { chrome.kill(); } catch (e) { /* already gone */ } server.close(); process.exit(1); };
const guard = setTimeout(() => fail('timed out after 150 s'), 150000);
chrome.on('exit', (code) => { if (waiting.size) fail('Chrome exited early (' + code + ')'); });

async function shoot(page, w, h, opt = {}) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);
  if (opt.clear) await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, sessionId);
  await send('Page.navigate', { url: BASE + '/work/' + page }, sessionId);
  let state = null;
  for (let i = 0; i < 400 && state !== '1'; i++) {
    await sleep(100);
    const r = await send('Runtime.evaluate', { expression: 'document.readyState === "complete" ? document.documentElement.getAttribute("data-ready") : null', returnByValue: true }, sessionId);
    state = r.result.value; if (state && state !== '1') fail(page + ': ' + state);
  }
  if (state !== '1') fail(page + ': never became ready');
  await send('Runtime.evaluate', { expression: 'new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(r, 120); }); }); })', awaitPromise: true }, sessionId);
  const shot = await send('Page.captureScreenshot', Object.assign({ format: opt.jpeg ? 'jpeg' : 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 }, captureBeyondViewport: false, optimizeForSpeed: false }, opt.jpeg ? { quality: opt.jpeg } : {}), sessionId);
  await send('Target.closeTarget', { targetId });
  return Buffer.from(shot.data, 'base64');
}
const pngSize = (b) => (b.subarray(1, 4).toString('latin1') === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20), b[25]] : null);    // width, height, colour type (6 = RGBA)
function jpegSize(b) { if (b[0] !== 0xFF || b[1] !== 0xD8) return null; let i = 2; while (i < b.length) { if (b[i] !== 0xFF) return null; const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m >= 0xC0 && m <= 0xC3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + len; } return null; }
function ico(pngs) {                                  // an .ico that carries PNG images (read by every current browser and by Windows since Vista)
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = 6 + 16 * pngs.length; const dir = pngs.map((p) => { const [w, h] = pngSize(p), e = Buffer.alloc(16); e[0] = w >= 256 ? 0 : w; e[1] = h >= 256 ? 0 : h; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(p.length, 8); e.writeUInt32LE(off, 12); off += p.length; return e; });
  return Buffer.concat([head, ...dir, ...pngs]);
}

const out = [];
function put(rel, data, want) {
  const size = rel.endsWith('.jpg') ? jpegSize(data) : rel.endsWith('.png') ? pngSize(data) : null;
  if (want && (!size || size[0] !== want[0] || size[1] !== want[1])) fail(`${rel}: expected ${want.join('x')}, got ${size ? size.slice(0, 2).join('x') : 'an unreadable file'}`);
  if (want && want[2] === 'alpha' && size[2] !== 6) fail(rel + ': expected a transparent background');
  const file = join(SITE, rel); mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, data);
  out.push([rel, data.length, want ? want.slice(0, 2).join('x') : '', createHash('sha256').update(data).digest('hex').slice(0, 12)]);
}
try {
  put('assets/42theory-card.jpg', await shoot('card.html', 1200, 630, { jpeg: 88 }), [1200, 630]);
  put('assets/42theory-logo.png', await shoot('logo-800.html', 800, 800), [800, 800]);
  put('assets/apple-touch-icon.png', await shoot('touch-180.html', 180, 180), [180, 180]);
  put('assets/icon-maskable-512.png', await shoot('maskable-512.html', 512, 512), [512, 512]);
  put('assets/icon-192.png', await shoot('tile-192.html', 192, 192, { clear: true }), [192, 192, 'alpha']);
  put('assets/icon-512.png', await shoot('tile-512.html', 512, 512, { clear: true }), [512, 512, 'alpha']);
  const t32 = await shoot('tile-32.html', 32, 32, { clear: true });
  put('assets/favicon-32.png', t32, [32, 32, 'alpha']);
  put('favicon.ico', ico([await shoot('tile-16.html', 16, 16, { clear: true }), t32, await shoot('tile-48.html', 48, 48, { clear: true })]));
} catch (e) { fail(e.message); }
clearTimeout(guard); waiting.clear(); server.close();
const gone = new Promise((r) => chrome.once('exit', r)); chrome.kill(); await Promise.race([gone, sleep(4000)]);
try { rmSync(WORK, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch (e) { /* the temporary folder is left for the system to clear */ }
console.log(out.map((r) => r[0].padEnd(34) + String(r[1]).padStart(8) + ' bytes  ' + r[2].padEnd(9) + r[3]).join('\n'));
console.log('rendered ' + out.length + ' files into ' + SITE);
