// Headless Chrome selftest driver for the FormulaSnip web UI.
// Usage: node scripts/web-selftest.mjs [--shot out.png] [--keep]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const shotIdx = args.indexOf('--shot');
const shotPath = shotIdx >= 0 ? args[shotIdx + 1] : path.join(ROOT, 'build', 'selftest-web.png');
const port = 9420 + Math.floor(Math.random() * 40);
const profile = `/tmp/formulasnip-chrome-${process.pid}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--allow-file-access-from-files',
    '--hide-scrollbars',
    '--window-size=1280,860',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { chrome.kill(); } catch {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  };

  try {
    let targets = [];
    for (let i = 0; i < 100; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        targets = await res.json();
        if (targets.find((t) => t.type === 'page')) break;
      } catch {}
      await sleep(100);
    }
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      else if (msg.method) events.push(msg);
    };
    const send = (method, params = {}) => new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    await new Promise((r) => { ws.onopen = r; });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__SELFTEST__ = true;' });
    await send('Page.navigate', { url: `file://${ROOT}/app/web/index.html` });

    let result = null;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const r = await send('Runtime.evaluate', {
        expression: 'window.__SELFTEST_RESULT__ ? JSON.stringify(window.__SELFTEST_RESULT__) : null',
        returnByValue: true
      });
      const v = r.result?.result?.value;
      if (v && v !== 'null') { result = JSON.parse(v); break; }
      await sleep(400);
    }

    await sleep(600);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(shotPath), { recursive: true });
    if (shot.result?.data) fs.writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'));
    console.log('SCREENSHOT: ' + shotPath);

    if (!result) {
      const diag = await send('Runtime.evaluate', {
        expression: 'JSON.stringify({body: document.body ? document.body.innerText.slice(0,500) : "", status: document.getElementById("status") ? document.getElementById("status").textContent : ""})',
        returnByValue: true
      });
      console.log('NO_RESULT: ' + (diag.result?.result?.value || ''));
      process.exitCode = 2;
    } else {
      for (const c of result.checks) console.log((c.ok ? 'PASS' : 'FAIL') + '  ' + c.name + (c.detail ? '  [' + c.detail + ']' : ''));
      console.log('SELFTEST: ' + (result.ok ? 'OK' : 'FAILED'));
      process.exitCode = result.ok ? 0 : 1;
    }
    ws.close();
  } finally {
    cleanup();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
