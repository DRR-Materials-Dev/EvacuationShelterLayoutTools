/**
 * 埋め込みハブ（hub.mjs）の検証：静的配信＋WS 同期を Electron GUI 抜きで確認する。
 */
import { fileURLToPath } from 'node:url';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { WebSocket } from 'ws';
import { startHub } from './hub.mjs';

const staticDir = fileURLToPath(new URL('../dist-collab', import.meta.url));
const hub = await startHub({ port: 0, host: '127.0.0.1', staticDir });
const base = `http://127.0.0.1:${hub.port}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? 'OK ' : 'NG '} ${label}`);
  if (!cond) ok = false;
};

// 1) ルートで index.html が配信される
const rootRes = await fetch(`${base}/`);
const rootHtml = await rootRes.text();
check('ルートで index.html を配信', rootRes.status === 200 && rootHtml.includes('id="root"'));

// 2) アセットが相対パスで取得できる
const m = rootHtml.match(/src="\.?\/?(assets\/[^"]+\.js)"/);
const assetPath = m ? m[1] : null;
const assetRes = assetPath ? await fetch(`${base}/${assetPath}`) : null;
check('JS アセットを配信', !!assetRes && assetRes.status === 200);

// 3) health
const healthRes = await fetch(`${base}/health`);
check('health エンドポイント', healthRes.status === 200);

// 4) WS 同期（同一ポートで Upgrade）
const ROOM = `hubtest-${Math.floor(Math.random() * 1e6)}`;
const connect = (doc) =>
  new Promise((resolve) => {
    const p = new WebsocketProvider(`ws://127.0.0.1:${hub.port}`, ROOM, doc, {
      WebSocketPolyfill: WebSocket,
    });
    p.on('sync', (s) => s && resolve(p));
  });
const a = new Y.Doc();
const b = new Y.Doc();
const pa = await connect(a);
const pb = await connect(b);

// アプリの構造（floors: Y.Array<Y.Map{ placed: Y.Array<Y.Map> }>）を模して 2 階層をシード。
const makeFloor = (id, name, items) => {
  const fm = new Y.Map();
  fm.set('id', id);
  fm.set('name', name);
  fm.set('scaleRatio', 50);
  fm.set('background', null);
  const placed = new Y.Array();
  placed.push(items.map((it) => { const m = new Y.Map(); for (const [k, v] of Object.entries(it)) m.set(k, v); return m; }));
  fm.set('placed', placed);
  return fm;
};
a.transact(() => {
  a.getArray('floors').push([
    makeFloor('f1', '1F', [{ kind: 'zone', id: 'z1', x: 0, y: 0 }]),
    makeFloor('f2', '2F', [{ kind: 'zone', id: 'z2', x: 1, y: 1 }]),
  ]);
});
await wait(300);
check('複数階層（2F含む）の同期', b.getArray('floors').length === 2 && b.getArray('floors').get(1).get('name') === '2F');

// 5) ネストした placed の move 同期（参加者が 2F の区画を動かす → ホストへ反映）
const bFloor2Placed = b.getArray('floors').get(1).get('placed');
bFloor2Placed.get(0).set('x', 9);
await wait(300);
const aX = a.getArray('floors').get(1).get('placed').get(0).get('x');
check('2F のネスト placed の move 同期', aX === 9);

// 6) 遅延参加者が全階層を受信できる
const c = new Y.Doc();
const pc = await connect(c);
await wait(400);
const lateOk = c.getArray('floors').length === 2 && c.getArray('floors').get(1).get('placed').get(0).get('x') === 9;
check('遅延参加者が全階層を取得', lateOk);

// 7) 全削除相当（1F の placed 全消し＋背景 null）の同期
a.transact(() => {
  const f1 = a.getArray('floors').get(0);
  f1.get('placed').delete(0, f1.get('placed').length);
  f1.set('background', null);
});
await wait(300);
const cleared = b.getArray('floors').get(0).get('placed').length === 0;
check('全削除（階層の placed クリア）の同期', cleared);

// 8) 区画リスト（meta）の同期
a.getMap('meta').set('zoneList', { version: 1, name: 'カスタム', zones: [] });
await wait(300);
const zl = b.getMap('meta').get('zoneList');
check('区画リスト(meta)の同期', !!zl && zl.name === 'カスタム');

// 9) プレゼンス（awareness）の中継
pa.awareness.setLocalStateField('user', { color: '#ff0000', name: 'ホスト' });
pa.awareness.setLocalStateField('cursor', { x: 1.5, y: 2.5 });
await wait(300);
let presenceOk = false;
pb.awareness.getStates().forEach((st, id) => {
  if (id === a.clientID && st.user?.name === 'ホスト' && st.cursor?.x === 1.5) presenceOk = true;
});
check('プレゼンス(awareness)の中継', presenceOk);

pa.destroy();
pb.destroy();
pc.destroy();

await hub.close();
console.log(`\n結果: ${ok ? '全 OK ✅' : '失敗あり ❌'}`);
process.exit(ok ? 0 : 1);
