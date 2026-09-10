/**
 * 単体動作版 Electron 用のローカル静的配信サーバ。設計書 §9.20。
 *
 * コラボ版（collab-server/hub.mjs）と違い、同期ハブ（WebSocket）は持たず、
 * **127.0.0.1 のみ**で待ち受ける（LAN へは一切公開しない）。
 *
 * file:// で直接読み込まず HTTP 配信にするのは、IndexedDB / LocalStorage を
 * 通常のオリジン上で確実に動作させるため（背景画像・区画リストの永続化に必要）。
 */
import { createServer } from 'node:http';
import sirv from 'sirv';

/**
 * @param {object} opts
 * @param {string} opts.staticDir SPA の配信ディレクトリ。
 * @param {number} [opts.port=0] 0 で空きポート自動割当。
 * @param {string} [opts.host='127.0.0.1'] ループバック固定（LAN 非公開）。
 * @returns {Promise<{ port: number, host: string, close: () => Promise<void> }>}
 */
export const startStaticServer = ({ staticDir, port = 0, host = '127.0.0.1' }) =>
  new Promise((resolve, reject) => {
    const serve = sirv(staticDir, { single: true, dev: false, etag: true });

    const server = createServer((req, res) => {
      serve(req, res, () => {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
      });
    });

    server.on('error', reject);

    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        port: typeof addr === 'object' && addr ? addr.port : port,
        host,
        close: () =>
          new Promise((done) => {
            // keep-alive 接続が残っていると close() が解決しないため明示的に切断する。
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
