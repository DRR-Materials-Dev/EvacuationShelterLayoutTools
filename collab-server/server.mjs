/**
 * 避難所レイアウトツール — マルチ操作 同期ハブ（CLI / 開発用）
 *
 * 設計書 §9.14。開発時に単体で同期ハブを起動する用途（dev:collab と組み合わせて
 * 同一マシンの 2 ブラウザタブで試す）。配信は vite が担うため静的配信は行わない。
 *
 * 一般利用者向けの「アイコン起動」は Electron アプリ（electron/main.mjs）側が担う。
 *
 * 起動: npm run collab:server
 * 環境変数: COLLAB_HOST（既定 0.0.0.0） / COLLAB_PORT（既定 1234）
 *
 * ⚠ ws://（非TLS・平文）。信頼できる LAN 内でのみ使用すること。
 */
import { startHub } from './hub.mjs';

const host = process.env.COLLAB_HOST ?? '0.0.0.0';
const port = Number(process.env.COLLAB_PORT ?? 1234);

const hub = await startHub({
  port,
  host,
  onConn: (room, peer, kind) => {
    const mark = kind === 'join' ? '[+] 参加' : '[-] 退出';
    console.log(`${mark}  room="${room}"  from ${peer}`);
  },
});

console.log('避難所レイアウトツール マルチ操作 同期ハブ (CLI / 開発用)');
console.log(`  listen : ws://${host}:${hub.port}`);
for (const a of hub.lanIps) {
  console.log(`  LAN    : ws://${a}:${hub.port}`);
}
console.warn('  ⚠ ws:// は非TLS（平文）です。信頼できる LAN 内でのみ使用してください。');
