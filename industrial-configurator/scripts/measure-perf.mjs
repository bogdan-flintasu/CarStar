#!/usr/bin/env node
/**
 * Frame-time benchmark of the configurator's 3D view (dev build), driven over the Chrome DevTools Protocol.
 * No dependency: Node's global WebSocket and fetch talk to a Chrome started with a throw-away profile.
 *
 *   node scripts/measure-perf.mjs [--url http://localhost:3016] [--headed] [--seconds 5] [--rates 1,4,6]
 *                                 [--halls 12x12x4,15x40x5,20x102x6] [--quality auto|high] [--json out.json]
 *
 * Halls are given as width x length x height (metres), the app's own `?w=&l=&h=` dev parameters. For each hall and CPU
 * throttling rate, the camera is orbited with real mouse drags over the canvas for `--seconds`, and every rendered
 * frame's timestamp is recorded in the page (rAF ticks in which `__hallStats.renderFrame` moved on). Reported:
 * median and p95 frame time, fps (rendered frames / elapsed time), the main-thread cost of one frame ("render CPU ms":
 * median of 30 synchronous `__hallAdvance()` calls at the same throttling; GPU time is not in it, so it shows the
 * headroom left under the 16.7 ms vsync cap), triangles and draw calls of the last frame, and the
 * page's adaptive quality level when the governor is present (`window.__hallQuality`).
 *
 * The GPU must be a real one: the script stops if WebGL reports SwiftShader (software rendering), unless --allow-soft.
 * Try headless first (the default); pass --headed if headless falls back to software rendering on this machine.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORT = { width: 1440, height: 900 };

function parseArgs(argv) {
  const args = {
    url: 'http://localhost:3016',
    headed: false,
    seconds: 5,
    rates: [1, 4, 6],
    halls: ['12x12x4', '15x40x5', '20x102x6'],
    quality: null,
    json: null,
    allowSoft: false,
    profileRoot: process.env.PERF_PROFILE_DIR || tmpdir(),
  };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = () => argv[++i];
    if (key === '--url') args.url = value();
    else if (key === '--headed') args.headed = true;
    else if (key === '--seconds') args.seconds = Number(value());
    else if (key === '--rates') args.rates = value().split(',').map(Number);
    else if (key === '--halls') args.halls = value().split(',');
    else if (key === '--quality') args.quality = value();
    else if (key === '--json') args.json = value();
    else if (key === '--allow-soft') args.allowSoft = true;
    else if (key === '--profile-root') args.profileRoot = value();
    else throw new Error(`Unknown argument ${key}`);
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Minimal CDP session over one page target. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners) listener(message);
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new Cdp(ws);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(listener) {
    this.listeners.push(listener);
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed');
    return result.result.value;
  }

  close() {
    this.ws.close();
  }
}

async function launchChrome(args) {
  const port = await freePort();
  const profile = mkdtempSync(join(args.profileRoot, 'perf-chrome-'));
  const flags = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    ...(args.headed ? [] : ['--headless=new', '--use-angle=metal']),
    'about:blank',
  ];
  const chrome = spawn(CHROME, flags, { stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const targets = await (await fetch(`${base}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return { chrome, profile, page };
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  chrome.kill();
  throw new Error('Chrome did not start');
}

const RENDERER_PROBE = `(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'no webgl2';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
})()`;

/** Records the rAF timestamp of every tick in which the 3D view rendered a frame. */
const RECORDER = `(() => {
  const perf = { times: [], last: window.__hallStats?.renderFrame ?? -1, running: true };
  window.__perf = perf;
  const tick = (t) => {
    if (!perf.running) return;
    const frame = window.__hallStats?.renderFrame ?? -1;
    if (frame !== perf.last) { perf.times.push(t); perf.last = frame; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

async function waitForHall(cdp, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await cdp.evaluate('(window.__hallAdvance?.(), window.__hallStats?.ready === true)').catch(() => false);
    if (ready) return;
    await sleep(250);
  }
  throw new Error('window.__hallStats.ready never became true');
}

/** Orbit: horizontal drags back and forth over the middle of the canvas. */
async function orbit(cdp, seconds) {
  const box = await cdp.evaluate(`(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  })()`);
  let x = box.x;
  const y = box.y;
  const reach = Math.min(240, box.w / 3);
  let direction = 1;
  const mouse = (type, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
  await mouse('mouseMoved', { buttons: 0, button: 'none' });
  await mouse('mousePressed', { buttons: 1, clickCount: 1 });
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    x += direction * 6;
    if (Math.abs(x - box.x) > reach) direction = -direction;
    await mouse('mouseMoved', { buttons: 1 });
    await sleep(8);
  }
  await mouse('mouseReleased', { buttons: 0, clickCount: 1 });
}

function summarize(times) {
  const deltas = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0 && d < 1000);
  if (deltas.length === 0) return { frames: 0, median: NaN, p95: NaN, fps: NaN };
  const sorted = [...deltas].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const elapsed = times[times.length - 1] - times[0];
  return { frames: deltas.length, median: at(0.5), p95: at(0.95), fps: (deltas.length / elapsed) * 1000 };
}

async function measureHall(cdp, args, hall, rate) {
  const [w, l, h] = hall.split('x').map(Number);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const url = `${args.url}/configurator?w=${w}&h=${h}&l=${l}&step=2`;
  await cdp.send('Page.navigate', { url });
  await sleep(1500);
  await waitForHall(cdp);
  if (args.quality) {
    await cdp.evaluate(`window.__hallQuality?.setMode?.(${JSON.stringify(args.quality)})`);
  }
  // Settle: textures, shader compilation, first framing.
  await sleep(1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  // Warm-up drag (the governor, if any, gets to adapt), then the measured one.
  const cameraBefore = await cdp.evaluate('window.__hallStats.camera');
  await orbit(cdp, 2);
  await cdp.evaluate(RECORDER);
  await orbit(cdp, args.seconds);
  const times = await cdp.evaluate('(window.__perf.running = false, window.__perf.times)');
  const cameraAfter = await cdp.evaluate('window.__hallStats.camera');
  // Main-thread cost of one frame (scene update + draw submission; the GPU's own time is not in it).
  const renderCpuMs = await cdp.evaluate(`(() => {
    const samples = [];
    for (let i = 0; i < 30; i++) { const t = performance.now(); window.__hallAdvance(); samples.push(performance.now() - t); }
    samples.sort((a, b) => a - b);
    return samples[15];
  })()`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const stats = await cdp.evaluate(`(() => {
    const s = window.__hallStats; const q = window.__hallQuality;
    return { triangles: s.triangles, drawCalls: s.drawCalls, dpr: window.devicePixelRatio,
      quality: q ? q.describe() : null };
  })()`);
  const moved = Math.hypot(...cameraAfter.map((v, i) => v - cameraBefore[i]));
  if (moved < 0.01) throw new Error(`The camera did not move during the orbit (${hall} @${rate}x)`);
  return { hall, rate, ...summarize(times), renderCpuMs, ...stats };
}

const pad = (value, width) => String(value).padStart(width);
const fmt = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : 'n/a');

function table(rows) {
  const header = '| hall (w×l×h) | CPU | median ms | p95 ms | fps | render CPU ms | triangles | draw calls | quality |';
  const rule = '|---|---|---|---|---|---|---|---|---|';
  const lines = rows.map(
    (r) =>
      `| ${r.hall.replaceAll('x', '×')} | ${r.rate}× | ${fmt(r.median)} | ${fmt(r.p95)} | ${fmt(r.fps, 0)} | ${fmt(r.renderCpuMs)} | ${pad(
        r.triangles.toLocaleString('en-US'),
        1,
      )} | ${r.drawCalls} | ${r.quality ?? '—'} |`,
  );
  return [header, rule, ...lines].join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const { chrome, profile, page } = await launchChrome(args);
  let cdp;
  try {
    cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    const consoleLines = [];
    cdp.on((message) => {
      if (message.method === 'Runtime.consoleAPICalled') {
        const text = message.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        if (text.includes('[HardwareTier]')) consoleLines.push(text);
      }
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    if (!args.headed) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 2, mobile: false });
    }
    await cdp.send('Page.navigate', { url: `${args.url}/configurator` });
    await sleep(1000);
    const renderer = await cdp.evaluate(RENDERER_PROBE);
    console.log(`GPU: ${renderer}  (${args.headed ? 'headed' : 'headless'})`);
    if (/swiftshader|llvmpipe|software/i.test(renderer) && !args.allowSoft) {
      throw new Error('Software rendering: re-run with --headed (or --allow-soft to measure anyway)');
    }

    const rows = [];
    for (const hall of args.halls) {
      for (const rate of args.rates) {
        const row = await measureHall(cdp, args, hall, rate);
        rows.push(row);
        console.log(
          `${hall} @${rate}x: median ${fmt(row.median)} ms, p95 ${fmt(row.p95)} ms, ${fmt(row.fps, 0)} fps, ` +
            `render CPU ${fmt(row.renderCpuMs)} ms, ` +
            `${row.triangles} tris, ${row.drawCalls} calls, dpr ${row.dpr}${row.quality ? `, ${row.quality}` : ''}`,
        );
      }
    }
    if (consoleLines.length) console.log(consoleLines[0]);
    console.log(`\n${table(rows)}\n`);
    if (args.json) writeFileSync(args.json, JSON.stringify({ renderer, tier: consoleLines[0] ?? null, rows }, null, 2));
  } finally {
    cdp?.close();
    chrome.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
