#!/usr/bin/env node
/**
 * Render one HTML file to a PNG at a fixed viewport and device scale.
 *
 *   node docs/shoot.cjs docs/architecture.html docs/architecture.png 1200 760
 *   CHROME="/path/to/chrome" node docs/shoot.cjs ...
 *
 * Talks to Chrome over the DevTools Protocol, so there are no npm dependencies.
 * Works from WSL too: a Windows Chrome binary is detected, the page is served over
 * a temporary local HTTP server (Windows reaches WSL's localhost), and the
 * profile directory is passed as a Windows path.
 */
const { spawn, execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const http = require('node:http');
const { dirname, extname, join, resolve, basename } = require('node:path');
const { pathToFileURL } = require('node:url');

const args = process.argv.slice(2);
const SOURCE = resolve(args[0] || 'docs/architecture.html');
const TARGET = resolve(args[1] || 'docs/architecture.png');
const WIDTH = Number(args[2] || 1200);
const HEIGHT = Number(args[3] || 760);
const SCALE = Number(args[4] || 2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  process.env.CHROME,
  '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
  '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

/** A Windows binary driven from WSL needs Windows-style arguments. */
const isWindowsChrome = (p) => p.startsWith('/mnt/c/') || /^[A-Za-z]:[\\/]/.test(p);

/** Where a WSL path is visible to Windows. */
function windowsPath(p) {
  const m = /^\/mnt\/([a-z])\/(.*)$/.exec(p);
  return m ? `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}` : p;
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

/** Serve the source's directory so relative assets resolve. */
function serve(root) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || basename(SOURCE);
    const file = join(root, rel);
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const getJson = (port, path) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port, path }, (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

(async () => {
  const browser = CANDIDATES.find((p) => existsSync(p));
  if (!browser) {
    console.error('No Chrome/Edge/Chromium found. Set CHROME=<path> and retry.');
    process.exit(1);
  }
  if (!existsSync(SOURCE)) {
    console.error('Missing', SOURCE);
    process.exit(1);
  }
  mkdirSync(dirname(TARGET), { recursive: true });

  const server = await serve(dirname(SOURCE));
  const port = server.address().port;
  const debugPort = 9500 + Math.floor(Math.random() * 400);
  const win = isWindowsChrome(browser);
  const profile = win
    ? `C:\\Users\\${process.env.WINUSER || 'DELL'}\\AppData\\Local\\Temp\\shoot-${Date.now()}`
    : join('/tmp', `shoot-${Date.now()}`);

  console.log('browser:', browser);
  console.log('serving:', `http://127.0.0.1:${port}/${basename(SOURCE)}`);

  const proc = spawn(browser, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  const cleanup = async () => {
    try { proc.kill(); } catch { /* already gone */ }
    // 从 WSL 启动的 Windows Chrome，proc.kill() 只杀掉 interop 壳，chrome.exe 和它的
    // 子进程会留在 Windows 侧继续占内存（并发跑几十次就会把机器拖死）。这里按本次
    // 唯一的 profile 目录名精确清理，不会碰用户自己开着的 Chrome。
    if (win) {
      const tag = profile.split(/[\\/]/).pop();
      const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${tag}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      try {
        execFileSync('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', ps],
          { timeout: 15000, stdio: 'ignore' });
      } catch { /* 清理失败不影响渲染结果 */ }
    }
    await new Promise((r) => server.close(r));
  };

  try {
    let target;
    for (let i = 0; i < 60; i++) {
      await sleep(300);
      try {
        target = (await getJson(debugPort, '/json/list')).find((t) => t.type === 'page');
        if (target) break;
      } catch { /* not listening yet */ }
    }
    if (!target) throw new Error('DevTools endpoint never came up');

    const ws = await connect(target.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { ok, fail } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
      }
    };
    const send = (method, params = {}) => new Promise((ok, fail) => {
      const n = ++id;
      pending.set(n, { ok, fail });
      ws.send(JSON.stringify({ id: n, method, params }));
    });

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false,
    });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/${basename(SOURCE)}` });
    await sleep(1200);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(TARGET, Buffer.from(shot.data, 'base64'));
    console.log('wrote:', TARGET, `${WIDTH * SCALE}×${HEIGHT * SCALE}`);
    ws.close();
  } finally {
    await cleanup();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

/** Minimal WebSocket client over node:http, enough for CDP. */
function connect(url) {
  return new Promise((ok, fail) => {
    const { hostname, port, pathname } = new URL(url);
    const key = Buffer.from(String(Math.random())).toString('base64');
    const req = http.request({
      hostname, port, path: pathname,
      headers: {
        Connection: 'Upgrade', Upgrade: 'websocket',
        'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
      },
    });
    req.on('upgrade', (res, socket) => ok(wrapSocket(socket)));
    req.on('error', fail);
    req.end();
  });
}

/** Frame/unframe WebSocket text messages (no fragmentation, no extensions). */
function wrapSocket(socket) {
  const api = { onmessage: null, send, close: () => socket.destroy() };
  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 2) return;
      const fin = (buffer[0] & 0x80) !== 0;
      const opcode = buffer[0] & 0x0f;
      let len = buffer[1] & 0x7f;
      let offset = 2;
      if (len === 126) { if (buffer.length < 4) return; len = buffer.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buffer.length < 10) return; len = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      if (buffer.length < offset + len) return;
      const payload = buffer.subarray(offset, offset + len);
      buffer = buffer.subarray(offset + len);
      if (opcode === 0x1 && fin) api.onmessage?.({ data: payload.toString('utf8') });
      if (opcode === 0x8) { socket.destroy(); return; }
    }
  });
  function send(text) {
    const data = Buffer.from(text, 'utf8');
    const head = [];
    head.push(0x81);
    if (data.length < 126) head.push(0x80 | data.length);
    else if (data.length < 65536) { head.push(0x80 | 126, data.length >> 8, data.length & 0xff); }
    else {
      head.push(0x80 | 127);
      const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(data.length)); head.push(...b);
    }
    const mask = Buffer.from([1, 2, 3, 4]);
    head.push(...mask);
    const masked = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i & 3];
    socket.write(Buffer.concat([Buffer.from(head), masked]));
  }
  return api;
}
