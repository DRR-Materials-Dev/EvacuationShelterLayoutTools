/**
 * Microsoft Edge（ヘッドレス）を Chrome DevTools Protocol で操作する小さなヘルパー。
 * マニュアルの画面撮影（shots.mjs）と PDF 化（pdf.mjs）で使う。v2.8.0。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Edge を起動する。close() で、このプロファイルを使うプロセスだけを止める。 */
export const launch = async ({ port = 9400, width = 1920, height = 1080 } = {}) => {
  const { existsSync } = await import('node:fs');
  const edge = EDGE_CANDIDATES.find((p) => existsSync(p));
  if (!edge) throw new Error('Microsoft Edge が見つかりません');
  const profile = mkdtempSync(path.join(tmpdir(), 'evac-manual-edge-'));
  const proc = spawn(
    edge,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      // CDP で作ったタブがバックグラウンド扱いになり、描画・タイマーが止まるのを防ぐ
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      `--window-size=${width},${height}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch {
      /* 起動待ち */
    }
    await sleep(200);
  }
  return {
    async newPage(url, { viewport = { width, height }, onNewDocument } = {}) {
      const info = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      const page = await connectPage(info.webSocketDebuggerUrl);
      await page.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
      if (onNewDocument) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: onNewDocument });
      await page.send('Page.bringToFront');
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      if (url) {
        await page.send('Page.navigate', { url });
        await sleep(300);
      }
      return page;
    },
    close() {
      const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(profile)}*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }`;
      spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
    },
  };
};

const connectPage = async (wsUrl) => {
  const ws = new WebSocket(wsUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  // 返事が来ないまま止まらないよう、30 秒でタイムアウトにする
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      const timer = setTimeout(() => {
        pending.delete(i);
        rej(new Error(`CDP の応答がありません: ${method} ${JSON.stringify(params).slice(0, 120)}`));
      }, method === 'Page.captureScreenshot' ? 15000 : 30000);
      pending.set(i, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('DOM.enable');

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expression, timeout = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        if (await evaluate(`!!(${expression})`)) return true;
      } catch {
        /* 読込中 */
      }
      await sleep(150);
    }
    return false;
  };

  /** ボタン・メニュー項目を文字列で探す式（最後に見つかったもの＝前面のダイアログ・メニュー優先）。 */
  const byText = (text, sel = 'button, [role=menuitem], a') =>
    `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.textContent.trim() === ${JSON.stringify(text)}).at(-1)`;

  const mouse = (type, x, y, extra = {}) =>
    send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });

  const page = {
    send,
    evaluate,
    waitFor,
    errors,
    byText,
    /** 要素の画面上の矩形。 */
    rect: (expr) =>
      evaluate(`(() => { const e = ${expr}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`),
    /** 画面座標をマウスでクリックする（modifiers: 8 = Shift）。 */
    clickAt: async (x, y, modifiers = 0) => {
      await mouse('mouseMoved', x, y, { modifiers, buttons: 0 });
      await mouse('mousePressed', x, y, { modifiers, buttons: 1 });
      await mouse('mouseReleased', x, y, { modifiers, buttons: 0 });
      await sleep(250);
    },
    mouse,
    /** 要素（式）の中心をマウスでクリックする。 */
    clickEl: async (expr, timeout = 8000) => {
      if (!(await waitFor(expr, timeout))) throw new Error('見つかりません: ' + expr);
      const r = await page.rect(expr);
      await page.clickAt(r.x + r.w / 2, r.y + r.h / 2);
    },
    clickText: (text, sel) => {
      if (process.env.MANUAL_DEBUG) console.log('    押す:', text);
      return page.clickEl(byText(text, sel));
    },
    key: async (key, code, vk, modifiers = 0) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
      await sleep(250);
    },
    escape: () => page.key('Escape', 'Escape', 27),
    type: async (text) => {
      await send('Input.insertText', { text });
      await sleep(150);
    },
    /** 画面を JPEG で撮る。clip を省くと画面全体。 */
    screenshot: async (clip, quality = 85) => {
      const params = { format: 'jpeg', quality, captureBeyondViewport: false };
      if (clip) params.clip = { ...clip, scale: 1 };
      // 長く操作したあと、ヘッドレスの Edge で撮影が返らないことがある。前面に出し直して撮り直す
      for (let attempt = 1; ; attempt++) {
        try {
          const r = await send('Page.captureScreenshot', params);
          return Buffer.from(r.data, 'base64');
        } catch (e) {
          if (attempt >= 3) throw e;
          console.warn(`    撮影をやり直します（${attempt} 回目）`);
          await send('Page.bringToFront').catch(() => {});
          await mouse('mouseMoved', 5, 5, { buttons: 0 }).catch(() => {});
          await sleep(1000);
        }
      }
    },
    reload: async () => {
      await send('Page.reload');
      await sleep(500);
    },
    close: () => ws.close(),
  };
  return page;
};
