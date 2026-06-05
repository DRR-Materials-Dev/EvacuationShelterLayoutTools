/**
 * PoC1 同期スモークテスト（ヘッドレス）。
 * 2 つの Y.Doc を同期ハブ経由で接続し、session.ts と同じ placed ミラー
 * （Y.Array<Y.Map>）で「ホストがシード → 参加者が移動 → ホストへ反映」を検証する。
 */
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { WebSocket } from 'ws';

const URL = process.env.WS_URL ?? 'ws://localhost:1234';
const ROOM = `smoke-${Math.floor(Math.random() * 1e6)}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const connect = (doc) =>
  new Promise((resolve) => {
    const p = new WebsocketProvider(URL, ROOM, doc, { WebSocketPolyfill: WebSocket });
    p.on('sync', (s) => s && resolve(p));
  });

const hostDoc = new Y.Doc();
const guestDoc = new Y.Doc();

const hostProvider = await connect(hostDoc);
const guestProvider = await connect(guestDoc);

const hostPlaced = hostDoc.getArray('placed');
const guestPlaced = guestDoc.getArray('placed');

// ホストがシード（区画 1 件）
hostDoc.transact(() => {
  const m = new Y.Map();
  m.set('kind', 'zone');
  m.set('id', 'zone-1');
  m.set('x', 0);
  m.set('y', 0);
  m.set('rotation', 0);
  hostPlaced.push([m]);
});

await wait(300);
const guestSeeded = guestPlaced.length === 1 && guestPlaced.get(0).get('id') === 'zone-1';
console.log(`1) 参加者が初期シードを受信        : ${guestSeeded ? 'OK' : 'NG'}`);

// 参加者が x/y を移動
guestDoc.transact(() => {
  const m = guestPlaced.get(0);
  m.set('x', 5.5);
  m.set('y', 3.2);
});

await wait(300);
const m = hostPlaced.get(0);
const moved = m.get('x') === 5.5 && m.get('y') === 3.2;
console.log(`2) ホストに参加者の移動が反映        : ${moved ? 'OK' : 'NG'}`);

// 別要素の同時移動が自動マージされるか（host が zone-1、guest が zone-2 を追加・移動）
hostDoc.transact(() => {
  const a = new Y.Map();
  a.set('kind', 'zone');
  a.set('id', 'zone-2');
  a.set('x', 1);
  a.set('y', 1);
  hostPlaced.push([a]);
});
await wait(200);
hostDoc.transact(() => hostPlaced.get(0).set('x', 9)); // zone-1 を host が動かす
guestDoc.transact(() => {
  const g = guestPlaced.toArray().find((it) => it.get('id') === 'zone-2');
  if (g) g.set('x', 9); // zone-2 を guest が動かす
});
await wait(400);
const z1 = hostPlaced.toArray().find((it) => it.get('id') === 'zone-1');
const z2 = guestPlaced.toArray().find((it) => it.get('id') === 'zone-2');
const merged = z1?.get('x') === 9 && z2?.get('x') === 9 && guestPlaced.length === 2;
console.log(`3) 別要素の同時移動が自動マージ      : ${merged ? 'OK' : 'NG'}`);

hostProvider.destroy();
guestProvider.destroy();
const allOk = guestSeeded && moved && merged;
console.log(`\n結果: ${allOk ? '全 OK ✅' : '失敗あり ❌'}`);
process.exit(allOk ? 0 : 1);
