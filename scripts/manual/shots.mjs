/**
 * ユーザーマニュアルの画面を撮影する（v2.8.0）。出力: public/manual/img/*.jpg
 *
 * 使い方（プロジェクトのルートで）:
 *   npm run build && npx vite build --mode collab-dev   # Pages 版と開発用コラボ版をビルド
 *   npm run manual:shots
 *   npm run build:collab                                # dist-collab を本番設定に戻す
 *
 * Pages 版（dist）とコラボ版（dist-collab、collab-dev 設定）を自前で配信し、ヘッドレスの Edge で操作して撮る。
 * 場面はサンプル「架空の体育館」に区画・ゾーン・テキスト・人数を置いたもの（IndexedDB に入れて読み込ませる）。
 * 表示倍率 100%・表示位置 (0,0) のまま撮るので、図面上のメートル座標から画面座標を計算できる。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/manual/img');
mkdirSync(OUT, { recursive: true });

const PAGES_PORT = 5191;
const COLLAB_PORT = 5192;
// コラボ版のハブは collab-server/server.mjs の既定ポート 1234（.env.collab-dev の VITE_COLLAB_WS_URL と同じ）
const VIEW = { width: 2000, height: 1700 }; // 図面下の 50m の線の右端まで表示できる幅

/* ---------- サーバ ---------- */

const procs = [];
const startNode = (args) => {
  const p = spawn(process.execPath, args, { cwd: ROOT, stdio: 'ignore' });
  procs.push(p);
  return p;
};
const stopAll = () => {
  for (const p of procs) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
};
const waitHttp = async (url) => {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* 起動待ち */
    }
    await sleep(200);
  }
  throw new Error('起動しません: ' + url);
};
const vite = path.join(ROOT, 'node_modules/vite/bin/vite.js');

/* ---------- 撮影用の場面 ---------- */

const sample = JSON.parse(readFileSync(path.join(ROOT, 'public/架空の体育館.layout.json'), 'utf8'));
const S = sample.floors[0].scaleRatio; // px / m（約 30.6）

const zone = (id, typeId, x, y, residents) => ({
  kind: 'zone', id, typeId, x, y, rotation: 0, ...(residents ? { residents } : {}),
});
const POLY = { strokeStyle: 'solid', strokeWidthPx: 2, fillOpacity: 0.25, showCount: true, showLabel: true, labelFontSize: 18 };

const placed = [];
// 居住エリアA（居住スペース(小) 1m×2m を 2 列 6 個）
for (let r = 0; r < 2; r++)
  for (let i = 0; i < 6; i++)
    placed.push(zone(`a${r}${i}`, 'living-small', 14.5 + i, 10 + r * 2.5, { healthy: 2 + ((i + r) % 3), ...(i === 2 ? { 'needs-care': 1 } : {}) }));
placed.push({ kind: 'polygon', id: 'zoneA', points: [{ x: 14, y: 9.6 }, { x: 21, y: 9.6 }, { x: 21, y: 15 }, { x: 14, y: 15 }], strokeColor: '#1565c0', fillColor: '#1565c0', label: '居住エリアA', ...POLY });
// 要配慮者エリア（居住スペース(大) 2m×2m を 2 列 3 個）
for (let r = 0; r < 2; r++)
  for (let i = 0; i < 3; i++)
    placed.push(zone(`b${r}${i}`, 'living-large', 23.5 + i * 2.5, 10 + r * 2.8, { 'needs-care': 2, healthy: 1 }));
placed.push({ kind: 'polygon', id: 'zoneB', points: [{ x: 23, y: 9.6 }, { x: 31, y: 9.6 }, { x: 31, y: 15.3 }, { x: 23, y: 15.3 }], strokeColor: '#ef6c00', fillColor: '#fb8c00', label: '要配慮者エリア', ...POLY });
// まだゾーンで囲んでいない区画（「囲むゾーンを作成」の説明用）
const groupC = [];
for (let r = 0; r < 2; r++)
  for (let i = 0; i < 4; i++) {
    const z = zone(`c${r}${i}`, 'living-small', 14.5 + i, 17.5 + r * 2.5, { healthy: 3 });
    groupC.push(z);
    placed.push(z);
  }
placed.push(zone('reception', 'reception', 28.5, 23));
placed.push(zone('supply', 'supply-distribution', 33, 23));
placed.push(zone('corner', 'supply-corner', 36, 23.3));
placed.push(zone('lounge', 'lounge', 40.5, 10));
placed.push(zone('dining', 'dining', 40, 14.5));
placed.push(zone('change1', 'changing-room', 45.5, 20));
placed.push(zone('change2', 'changing-room', 45.5, 21.6));
placed.push({ kind: 'text', id: 't1', text: '通路（幅 1.5m 以上）', x: 14.2, y: 15.6, fontSize: 16, scaleX: 1, scaleY: 1, rotation: 0, color: '#c62828' });
placed.push({ kind: 'text', id: 't2', text: '↓ 玄関から入場', x: 28.4, y: 21.6, fontSize: 16, scaleX: 1, scaleY: 1, rotation: 0, color: '#2e7d32' });

const scene = {
  floors: [
    { ...sample.floors[0], id: 'f1', name: '1F', placed },
    { id: 'f2', name: '2F', scaleRatio: S, placed: [] },
  ],
  activeFloorId: 'f1',
  residentTypes: sample.residentTypes,
  zoneListName: sample.zoneListName,
};

const putScene = (page) =>
  page.evaluate(`new Promise((res, rej) => { const r = indexedDB.open('keyval-store'); r.onupgradeneeded = () => r.result.createObjectStore('keyval'); r.onsuccess = () => { const tx = r.result.transaction('keyval', 'readwrite'); tx.objectStore('keyval').put(${JSON.stringify(scene)}, 'evac-tool/layout/state-v2'); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); })`);

/* ---------- 撮影の補助 ---------- */

const MARK_CSS = `
#__marks { position: fixed; inset: 0; pointer-events: none; z-index: 100000; }
#__marks .box { position: absolute; border: 3px solid #e53935; border-radius: 8px; box-shadow: 0 0 0 2px rgba(255,255,255,.8); }
#__marks .num { position: absolute; width: 30px; height: 30px; border-radius: 50%; background: #e53935; color: #fff;
  font: bold 17px/30px sans-serif; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,.4); }`;

/** 赤枠と番号を重ねる。items: [{ x, y, w, h, n }]（画面座標） */
const mark = (page, items) =>
  page.evaluate(`(() => {
    document.getElementById('__marks')?.remove();
    const st = document.getElementById('__marks_css') ?? Object.assign(document.createElement('style'), { id: '__marks_css', textContent: ${JSON.stringify(MARK_CSS)} });
    document.head.appendChild(st);
    const root = Object.assign(document.createElement('div'), { id: '__marks' });
    for (const it of ${JSON.stringify(items)}) {
      const b = document.createElement('div'); b.className = 'box';
      Object.assign(b.style, { left: (it.x - 4) + 'px', top: (it.y - 4) + 'px', width: (it.w + 8) + 'px', height: (it.h + 8) + 'px' });
      root.appendChild(b);
      if (it.n != null) {
        const n = document.createElement('div'); n.className = 'num'; n.textContent = it.n;
        const nx = it.nx ?? (it.x - 16), ny = it.ny ?? (it.y - 16);
        Object.assign(n.style, { left: Math.max(2, nx) + 'px', top: Math.max(2, ny) + 'px' });
        root.appendChild(n);
      }
    }
    document.body.appendChild(root);
  })()`);
const clearMarks = (page) => page.evaluate(`document.getElementById('__marks')?.remove()`);

const union = (...rs) => {
  const v = rs.filter(Boolean);
  if (v.length === 0) return null;
  const x = Math.min(...v.map((r) => r.x));
  const y = Math.min(...v.map((r) => r.y));
  return { x, y, w: Math.max(...v.map((r) => r.x + r.w)) - x, h: Math.max(...v.map((r) => r.y + r.h)) - y };
};
const pad = (r, p = 12) => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });

// 要素の中の文字が実際に占める範囲（帯の右側の余白を含めない）
const textRect = (page, expr) =>
  page.evaluate(`(() => { const e = ${expr}; if (!e) return null; const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);

const written = [];
const save = async (page, name, r) => {
  let clip;
  if (r === null || (r && !(r.w > 0 && r.h > 0))) {
    console.warn('  ⚠ 範囲が取れないため飛ばします:', name);
    return;
  }
  if (r) {
    const x = Math.max(0, Math.floor(r.x));
    const y = Math.max(0, Math.floor(r.y));
    clip = { x, y, width: Math.min(VIEW.width - x, Math.ceil(r.w)), height: Math.min(VIEW.height - y, Math.ceil(r.h)) };
  }
  await sleep(250);
  writeFileSync(path.join(OUT, `${name}.jpg`), await page.screenshot(clip));
  written.push(name);
  console.log('  撮影:', name);
};

/* ---------- 撮影 ---------- */

const shootPages = async (browser) => {
  const base = `http://localhost:${PAGES_PORT}/EvacuationShelterLayoutTools/`;
  const p = await browser.newPage(`${base}#/layout`, { viewport: VIEW });
  await p.waitFor(`document.querySelector('[aria-label="階層を追加"]')`, 30000);
  await putScene(p);
  await p.reload();
  await p.waitFor(`document.querySelector('.konvajs-content')`, 30000);
  await sleep(1500);

  const canvas = await p.rect(`document.querySelector('.konvajs-content')`);
  const at = (mx, my) => ({ x: canvas.x + mx * S, y: canvas.y + my * S });
  const mrect = (x0, y0, x1, y1) => {
    const a = at(x0, y0);
    const b = at(x1, y1);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  };
  const clickM = async (mx, my, mod = 0) => {
    const q = at(mx, my);
    await p.clickAt(q.x, q.y, mod);
  };
  const header = await p.rect(`document.querySelector('h3')?.closest('.mantine-Group-root')`);
  const toolbar = union(await p.rect(p.byText('施設画像')), await p.rect(p.byText('設定')));
  const floorRow = await p.rect(`[...document.querySelectorAll('p')].find(e => e.textContent.trim() === '階層')?.parentElement`);
  const editBar = union(await p.rect(p.byText('元に戻す')), await p.rect(p.byText('ゾーンだけ移動')));
  const floorTabs = union(await p.rect(`[...document.querySelectorAll('p')].find(e => e.textContent.trim() === '階層')`), await p.rect(`document.querySelector('[aria-label="階層を追加"]')`));
  // パレット・図面・右側のパネルが並ぶ行（LayoutPage の display:flex; flex:1; overflow:hidden）
  const ROW = `[...document.querySelectorAll('div')].find(d => d.style.display === 'flex' && d.style.overflow === 'hidden' && d.querySelector('.konvajs-content'))`;
  const palette = await p.rect(`${ROW}.firstElementChild`);
  const rightPanel = () => p.rect(`${ROW}.lastElementChild`);
  const status = async () => {
    const r = await p.rect(`[...document.querySelectorAll('*')].filter(e => e.textContent.includes('縮尺:') && e.textContent.includes('表示倍率')).at(-1)?.parentElement`);
    return r && { x: 0, y: r.y, w: VIEW.width, h: r.h };
  };
  // ステータスバーの左（メッセージ）と右（縮尺・人数）。幅 2000 の帯のままでは文字が小さすぎるので分ける
  // メッセージの文字の範囲だけを切り抜く（高さはステータスバーに合わせる）
  const statusLeft = async () => {
    const bar = await status();
    const t = await textRect(p, `[...document.querySelectorAll('*')].filter(e => e.textContent.includes('縮尺:') && e.textContent.includes('表示倍率')).at(-1)?.parentElement?.firstElementChild`);
    return bar && t && { x: 0, y: bar.y, w: Math.min(VIEW.width, t.x + t.w + 16), h: bar.h };
  };
  const statusRight = async () => ({ ...(await status()), x: VIEW.width - 720, w: 720 });

  // 図面全体（ヒーロー画像）
  await save(p, 'map-overview', mrect(11.5, 8, 48.5, 26.8));

  // 1 つの区画を選択（区画パネル・人数）
  await clickM(groupC[0].x + 0.5, groupC[0].y + 1);
  await sleep(400);
  const panel1 = await rightPanel();
  // 画面の各部の名称（区画を選んで右側のパネルも出した状態）
  await mark(p, [
    { ...header, n: 1 },
    { ...toolbar, n: 2 },
    { ...floorRow, w: editBar.x - floorRow.x - 12, n: 3 },
    { ...editBar, n: 4 },
    { ...palette, n: 5, nx: palette.x + 8, ny: palette.y + 8 },
    { x: canvas.x + 4, y: canvas.y + 4, w: panel1.x - canvas.x - 8, h: canvas.h - 8, n: 6, nx: canvas.x + 14, ny: canvas.y + 14 },
    { ...panel1, n: 7, nx: panel1.x + 8, ny: panel1.y + 8 },
    { ...(await status()), n: 8, nx: 8, ny: (await status()).y - 6 },
  ]);
  await save(p, 'layout-overview');
  await clearMarks(p);
  await save(p, 'toolbar-1', pad(union(await p.rect(p.byText('施設画像')), await p.rect(p.byText('全削除'))), 8));
  await save(p, 'toolbar-2', pad(union(await p.rect(p.byText('サンプル読込')), await p.rect(p.byText('設定'))), 8));
  await save(p, 'floor-tabs', pad(floorTabs, 8));
  await save(p, 'edit-bar', pad(editBar, 6));
  await save(p, 'palette', { ...palette, h: Math.min(palette.h, 900) });
  await save(p, 'block-selected', mrect(13, 14.6, 20.5, 23.5));
  await save(p, 'selection-panel', { ...panel1, h: Math.min(panel1.h, 760) });
  await save(p, 'statusbar', await statusRight());

  // 居住者種類
  await p.clickText('居住者種類');
  await p.waitFor(`[...document.querySelectorAll('[role=dialog]')].some(d => d.innerText.includes('居住者種類の設定'))`);
  await sleep(500);
  await save(p, 'resident-types', pad(await p.rect(`[...document.querySelectorAll('[role=dialog]')].find(d => d.innerText.includes('居住者種類の設定'))`), 4));
  await p.escape();
  await sleep(400);

  // 複数選択 → 囲むゾーンを作成
  await p.escape();
  for (const [i, z] of groupC.entries()) await clickM(z.x + 0.5, z.y + 1, i === 0 ? 0 : 8);
  await sleep(400);
  await save(p, 'multi-select', mrect(13, 16.4, 20.5, 23.5));
  await save(p, 'multi-panel', { ...(await rightPanel()), h: 520 });
  await p.clickText('囲むゾーンを作成');
  await sleep(600);
  await save(p, 'hull-created', mrect(13, 15.6, 20.5, 23.5));
  await save(p, 'undo', pad(editBar, 6));
  await save(p, 'hull-status', await statusLeft());
  // 回転中（ゾーン内選択のまま回転ハンドルを 30° 回して撮り、元に戻してから離す）
  {
    const top = at(14.5 - 0.2, 17.5 - 0.2).y - 8;
    const cx = at(16.5, 0).x;
    const cy = at(0, (17.3 + 22.2) / 2).y;
    const r = cy - (top - 50);
    await p.mouse('mouseMoved', cx, top - 50, { buttons: 0 });
    await p.mouse('mousePressed', cx, top - 50, { buttons: 1 });
    for (let i = 1; i <= 6; i++) {
      const a = (-90 + 5 * i) * (Math.PI / 180);
      await p.mouse('mouseMoved', cx + r * Math.cos(a), cy + r * Math.sin(a), { buttons: 1 });
      await sleep(40);
    }
    await save(p, 'zone-rotating', mrect(12.3, 14.5, 21, 24.5));
    await p.mouse('mouseMoved', cx, top - 50, { buttons: 1 });
    await p.mouse('mouseReleased', cx, top - 50, { buttons: 0 });
    await sleep(300);
  }

  // ゾーンだけを選択（ゾーン設定パネル・回転ハンドル）
  await p.escape();
  await clickM(17.5, 14.8);
  await sleep(400);
  await save(p, 'zone-selected', mrect(13, 7.2, 22, 16));
  await save(p, 'polygon-panel', { ...(await rightPanel()), h: 1100 });
  await save(p, 'zone-hint', await statusLeft());
  // もう一度クリック → ゾーン内選択
  await clickM(17.5, 14.8);
  await sleep(400);
  await save(p, 'zone-inner', mrect(13, 7.2, 22, 16));
  await p.escape();

  // ゾーンを描く
  for (let i = 0; i < 3 && !(await p.evaluate(`!!${p.byText('ゾーン作図中…')}`)); i++) {
    await p.clickText('ゾーン');
    await sleep(400);
  }
  console.log('  作図モード:', await p.evaluate(`!!${p.byText('ゾーン作図中…')}`));
  // 続けて素早くクリックするとダブルクリック（＝確定）と判定されるので、間を空ける
  for (const [x, y] of [[38.5, 19.3], [43.8, 19.3], [43.8, 23.2], [38.5, 23.2]]) {
    await clickM(x, y);
    await sleep(600);
  }
  await sleep(300);
  await save(p, 'zone-drawing', mrect(36.5, 17.5, 47, 25));
  console.log('  作図中のボタン:', await p.evaluate(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /確定|戻す|取消/.test(t)).join(' / ')`));
  await save(p, 'zone-drawing-buttons', pad(union(await p.rect(p.byText('取消')), await p.rect(`[...document.querySelectorAll('button')].find(e => e.textContent.trim().startsWith('確定（'))`)), 10));
  await p.clickText('取消');
  await sleep(300);

  // テキストの追加
  await p.clickText('テキスト');
  await sleep(300);
  await clickM(34, 18.5);
  await p.waitFor(`[...document.querySelectorAll('[role=dialog]')].some(d => d.innerText.includes('テキストの追加'))`);
  await sleep(400);
  await save(p, 'text-modal', pad(await p.rect(`[...document.querySelectorAll('[role=dialog]')].find(d => d.innerText.includes('テキストの追加'))`), 4));
  await p.clickText('キャンセル');
  await sleep(300);
  await save(p, 'text-on-map', mrect(13.5, 15, 33, 24.8));

  // 縮尺設定（図面下の 50m の線の両端をクリック）
  await p.clickText('縮尺設定');
  await sleep(300);
  await clickM(93 / S, 1270 / S);
  await sleep(300);
  await save(p, 'scale-point', mrect(0.5, 37, 20, 43));
  await clickM(1625 / S, 1270 / S);
  await p.waitFor(`[...document.querySelectorAll('[role=dialog]')].some(d => d.innerText.includes('縮尺の設定'))`);
  await sleep(400);
  await save(p, 'scale-modal', pad(await p.rect(`[...document.querySelectorAll('[role=dialog]')].find(d => d.innerText.includes('縮尺の設定'))`), 4));
  await p.clickText('キャンセル');
  await sleep(300);
  if (await p.evaluate(`!!${p.byText('縮尺設定中…')}`)) await p.clickText('縮尺設定中…');

  // 階層のメニュー
  await p.clickEl(`document.querySelector('[aria-label="1F の操作"]')`);
  await p.waitFor(p.byText('この階層を削除'));
  await sleep(300);
  await save(p, 'floor-menu', pad(union(floorTabs, await p.rect(`document.querySelector('[role=menu]')`)), 8));
  await p.escape();

  // レイアウト保存・サンプル・設定・区画エディタ
  await p.clickText('レイアウト保存');
  await p.waitFor(`[...document.querySelectorAll('[role=dialog]')].some(d => d.innerText.includes('レイアウトを保存'))`);
  await sleep(1000); // 開くアニメーションが終わってから大きさを測る
  {
    // ダイアログの要素が中身より小さく測れることがあるので、中のボタンまで含めて切り抜く
    const D = `[...document.querySelectorAll('[role=dialog]')].find(d => d.innerText.includes('レイアウトを保存'))`;
    const saveBtn = await p.rect(`[...${D}.querySelectorAll('button')].find(b => b.textContent.trim() === '保存')`);
    await save(p, 'save-modal', pad(union(await p.rect(D), saveBtn && { ...saveBtn, h: saveBtn.h + 16 }), 4));
  }
  await p.escape();
  await sleep(300);
  await p.clickText('サンプル読込');
  await p.waitFor(p.byText('架空の公民館'));
  await sleep(300);
  await save(p, 'sample-menu', pad(union(await p.rect(p.byText('サンプル読込')), await p.rect(`document.querySelector('[role=menu]')`)), 8));
  await p.escape();
  await sleep(300);
  await p.clickText('設定');
  await p.waitFor(`[...document.querySelectorAll('[role=dialog]')].some(d => d.innerText.includes('ユーザー設定'))`);
  await sleep(400);
  await save(p, 'settings-modal', pad(await p.rect(`[...document.querySelectorAll('[role=dialog]')].find(d => d.innerText.includes('ユーザー設定'))`), 4));
  await p.clickText('キャンセル');
  await sleep(300);
  await p.clickText('編集');
  await p.waitFor(`[...document.querySelectorAll('[role=dialog]')].some(d => d.innerText.includes('区画の追加・編集'))`);
  await sleep(600);
  await p.clickEl(`[...document.querySelectorAll('[role=dialog] *')].filter(e => e.children.length === 0 && e.textContent.trim() === '居住スペース(小)').at(0)`);
  await sleep(400);
  {
    // 画面の幅いっぱいに開くので、左上（案内・区画の一覧・区画の編集の上半分）だけを切り抜く
    const d = await p.rect(`[...document.querySelectorAll('[role=dialog]')].find(d => d.innerText.includes('区画の追加・編集'))`);
    await save(p, 'zone-editor-modal', pad({ ...d, w: Math.min(d.w, 1150), h: Math.min(d.h, 860) }, 4));
  }
  await p.escape();
  await sleep(400);

  // PDF 図面の読み込み（2F に。サンプルの図面を PDF にして使う）
  {
    const tmp = await browser.newPage('about:blank', { viewport: { width: 1200, height: 900 } });
    const bg = sample.floors[0].background.dataUrl;
    await tmp.evaluate(`document.body.style.margin = '0'; document.body.innerHTML = '<img src="${bg}" style="width:100%">'`);
    await sleep(500);
    const pdf = await tmp.send('Page.printToPDF', { landscape: true, printBackground: true, paperWidth: 11.69, paperHeight: 8.27, marginTop: 0.3, marginBottom: 0.3, marginLeft: 0.3, marginRight: 0.3 });
    const pdfPath = path.join(ROOT, 'node_modules/.cache/manual-sample-floor.pdf');
    mkdirSync(path.dirname(pdfPath), { recursive: true });
    writeFileSync(pdfPath, Buffer.from(pdf.data, 'base64'));
    tmp.close();
    await p.send('Page.bringToFront');
    await p.clickText('2F');
    await sleep(400);
    const doc = await p.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await p.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file][accept*="pdf"]' });
    await p.send('DOM.setFileInputFiles', { nodeId, files: [pdfPath] });
    await p.waitFor(`[...document.querySelectorAll('[role=dialog]')].some(d => d.innerText.includes('PDF から図面を読み込む'))`, 15000);
    // プレビューの描画が終わる（読み込み中の表示が消える）まで待つ
    await sleep(800);
    await p.waitFor(`![...document.querySelectorAll('[role=dialog]')].find(d => d.innerText.includes('PDF から図面を読み込む'))?.querySelector('.mantine-Loader-root')`, 60000);
    await sleep(1000);
    await save(p, 'pdf-import', pad(await p.rect(`[...document.querySelectorAll('[role=dialog]')].find(d => d.innerText.includes('PDF から図面を読み込む'))`), 4));
    await p.escape();
    await sleep(300);
  }

  console.log('  画面のエラー:', p.errors.length ? p.errors.slice(0, 3) : 'なし');
  p.close();

  // 区画エディタ・区画印刷・メニュー（幅 2000 では文字が小さすぎるので、ノートパソコン程度の幅で撮る）
  const W2 = { width: 1280, height: 1000 };
  const q = await browser.newPage(`${base}#/editor`, { viewport: W2 });
  await sleep(1800);
  await save(q, 'editor', { x: 0, y: 0, w: W2.width, h: 760 });
  await q.clickEl(`[...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === '居住スペース(小)').at(0)`);
  await sleep(600);
  await save(q, 'editor-detail', { x: 0, y: 0, w: W2.width, h: W2.height });
  await q.send('Page.navigate', { url: `${base}#/print` });
  await sleep(1800);
  await save(q, 'print', { x: 0, y: 0, w: W2.width, h: W2.height });
  await q.send('Page.navigate', { url: `${base}#/` });
  await sleep(1500);
  await mark(q, [{ ...(await q.rect(q.byText('使い方マニュアル'))), n: null }]);
  await save(q, 'menu', { x: 0, y: 0, w: W2.width, h: 560 });
  await clearMarks(q);
  q.close();

  // タブレット（iPad の横向き程度の幅）
  const t = await browser.newPage(`${base}#/layout`, { viewport: { width: 1180, height: 820 } });
  await t.waitFor(`document.querySelector('.konvajs-content')`, 30000);
  await sleep(1200);
  await t.clickText('1F'); // PDF の手順で 2F を表示したままなので 1F に戻す
  await sleep(800);
  await save(t, 'tablet', { x: 0, y: 0, w: 1180, h: 820 });
  t.close();
};

const shootCollab = async (browser) => {
  const base = `http://localhost:${COLLAB_PORT}/`;
  const room = `manual${Date.now()}`;
  // ホスト役（Electron の API をまねて「参加者を招待」を出す。アドレスは説明用のダミー）
  const fakeApi = `window.electronAPI = { getSessionInfo: async () => ({ port: 52845, room: 'room-a1b2c3', lanIps: ['192.168.0.10'], lanNetworks: [{ address: '192.168.0.10', iface: 'Wi-Fi' }], participantUrls: ['http://192.168.0.10:52845/?room=room-a1b2c3#/layout'] }) };`;
  // ホストの表示名・色（淡い色だとゾーンの上で見えにくいので濃い色にする）
  const hostUser = `try { localStorage.setItem('evac-collab/presence-user', JSON.stringify({ name: '本部（ホスト）', color: '#d81b60' })); } catch {}`;
  const host = await browser.newPage(`${base}#/`, { viewport: VIEW, onNewDocument: fakeApi + hostUser });
  await sleep(1000);
  await putScene(host);
  await host.send('Page.navigate', { url: `${base}?host=1&room=${room}#/layout` });
  await host.waitFor(`document.body.innerText.includes('状態: 接続中')`, 30000);
  await sleep(1500);
  const banner = await host.rect(`[...document.querySelectorAll('*')].filter(e => e.textContent.startsWith('マルチ操作')).at(-1)?.parentElement`);
  const bannerText = await textRect(host, `[...document.querySelectorAll('*')].filter(e => e.textContent.startsWith('マルチ操作')).at(-1)`);
  await save(host, 'collab-banner', pad({ x: 0, y: banner.y, w: bannerText ? bannerText.x + bannerText.w + 12 : 1180, h: banner.h }, 2));
  await save(host, 'collab-banner-buttons', pad(union(await host.rect(host.byText('表示名・色')), await host.rect(host.byText('参加者を招待（URL・QR）'))), 8));
  await host.clickText('参加者を招待（URL・QR）');
  await host.waitFor(`[...document.querySelectorAll('[role=dialog]')].some(d => d.innerText.includes('参加者を招待'))`);
  await sleep(1200);
  await save(host, 'collab-invite', pad(await host.rect(`[...document.querySelectorAll('[role=dialog]')].find(d => d.innerText.includes('参加者を招待'))`), 4));
  await host.escape();
  await sleep(300);
  await host.clickText('表示名・色');
  await host.waitFor(`[...document.querySelectorAll('[role=dialog]')].some(d => d.innerText.includes('表示名・色の変更'))`);
  await sleep(500);
  await save(host, 'collab-presence', pad(await host.rect(`[...document.querySelectorAll('[role=dialog]')].find(d => d.innerText.includes('表示名・色の変更'))`), 4));
  await host.escape();

  // 参加者の画面：ホストのカーソルと選択が見える。
  // 同じ Edge のタブにすると片方が隠れたタブになるため、参加者は別の Edge（別の端末の代わり）で開く
  const guestBrowser = await launch({ port: 9412, width: VIEW.width, height: VIEW.height });
  const guest = await guestBrowser.newPage(`${base}?room=${room}#/layout`, { viewport: VIEW });
  await guest.waitFor(`document.body.innerText.includes('状態: 接続中')`, 30000);
  await sleep(1500);
  const hc = await host.rect(`document.querySelector('.konvajs-content')`);
  await host.send('Page.bringToFront');
  // ホストが区画を 2 つ選び、カーソルをその右に置く
  await host.clickAt(hc.x + (groupC[0].x + 0.5) * S, hc.y + (groupC[0].y + 1) * S);
  await host.clickAt(hc.x + (groupC[1].x + 0.5) * S, hc.y + (groupC[1].y + 1) * S, 8);
  console.log('  ホストの選択:', (await host.evaluate(`document.body.innerText`)).includes('2 個の区画を選択中'));
  for (let i = 0; i < 5; i++) {
    await host.mouse('mouseMoved', hc.x + (20 + i * 0.1) * S, hc.y + 19.3 * S, { buttons: 0 });
    await sleep(120);
  }
  await sleep(1500);
  if (process.env.MANUAL_DEBUG) {
    // ハブに流れているプレゼンスを Node から確かめる（撮影の調査用）
    const { createRequire } = await import('node:module');
    const req = createRequire(path.join(ROOT, 'package.json'));
    const Y = req('yjs');
    const { WebsocketProvider } = req('y-websocket');
    const d = new Y.Doc();
    const pv = new WebsocketProvider('ws://localhost:1234', room, d, { WebSocketPolyfill: req('ws') });
    await sleep(1500);
    const states = [...pv.awareness.getStates().entries()].filter(([id]) => id !== d.clientID);
    console.log('  プレゼンス:', JSON.stringify(states.map(([, st]) => ({ user: st.user?.name, floorId: st.floorId, sel: st.selectedIds, cursor: st.cursor }))));
    pv.destroy();
  }
  // 参加者は最初に図面を受け取ったとき、図面全体が見える倍率へ自動で合わせる（中央寄せ）。その倍率で切り抜く
  const gc = await guest.rect(`document.querySelector('.konvajs-content')`);
  const pct = Number((await guest.evaluate(`document.body.innerText`)).match(/表示倍率: (\d+)%/)?.[1] ?? 100) / 100;
  const bgW = sample.floors[0].background.width;
  const bgH = sample.floors[0].background.height;
  const ox = gc.x + (gc.w - bgW * pct) / 2;
  const oy = gc.y + (gc.h - bgH * pct) / 2;
  const gm = (mx, my) => ({ x: ox + mx * S * pct, y: oy + my * S * pct });
  const g0 = gm(12.5, 15);
  const g1 = gm(25, 24);
  await save(guest, 'collab-guest', { x: g0.x, y: g0.y, w: g1.x - g0.x, h: g1.y - g0.y });
  console.log('  画面のエラー:', [...host.errors, ...guest.errors].slice(0, 3).join(' | ') || 'なし');
  host.close();
  guest.close();
  guestBrowser.close();
};

/* ---------- 実行 ---------- */

try {
  startNode([vite, 'preview', '--port', String(PAGES_PORT), '--strictPort']);
  startNode([vite, 'preview', '--mode', 'collab-dev', '--port', String(COLLAB_PORT), '--strictPort']);
  startNode([path.join(ROOT, 'collab-server/server.mjs')]);
  await waitHttp(`http://localhost:${PAGES_PORT}/EvacuationShelterLayoutTools/`);
  await waitHttp(`http://localhost:${COLLAB_PORT}/`);
  const browser = await launch({ port: 9410, width: VIEW.width, height: VIEW.height });
  try {
    // MANUAL_ONLY=pages / collab で片方だけ撮れる（撮り直し用）
    const only = process.env.MANUAL_ONLY;
    if (!only || only === 'pages') {
      console.log('Pages 版を撮影');
      await shootPages(browser);
    }
    if (!only || only === 'collab') {
      console.log('コラボ版を撮影');
      await shootCollab(browser);
    }
  } finally {
    browser.close();
  }
  console.log(`\n${written.length} 枚を ${path.relative(ROOT, OUT)} に保存しました`);
} finally {
  stopAll();
}
