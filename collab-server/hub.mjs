/**
 * マルチ操作（同時編集）同期ハブ＋静的配信の共通実装。設計書 §9.3 / §9.15。
 *
 * - `staticDir` を渡すとそのディレクトリ（コラボビルド dist-collab）を HTTP 配信する。
 * - 同一ポートで WebSocket の Upgrade を受け、Yjs 更新を全参加者へ中継する（同期ハブ）。
 *
 * Electron メインプロセス（electron/main.mjs）と CLI（collab-server/server.mjs）の双方から使う。
 *
 * 【重要】同期ハンドラはクライアントと同一の classic `yjs`(v13) ＋ `y-protocols` で内製している。
 * `@y/websocket-server` は yjs v14 プレリリース（`@y/y`）依存で v13 クライアントと非互換のため不採用。
 * 実装は y-websocket 公式 `bin/utils.js` の最小移植（sync + awareness + keepalive）。
 *
 * ⚠ ws://（非TLS・平文）。信頼できる LAN 内でのみ使用すること（§9.13 / README 免責）。
 */
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import sirv from 'sirv';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const WS_OPEN = 1;
const PING_TIMEOUT = 30000;

/** docName -> WSSharedDoc */
const docs = new Map();

class WSSharedDoc extends Y.Doc {
  constructor(name) {
    super({ gc: true });
    this.name = name;
    /** conn -> Set<clientID> */
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    this.awareness.on('update', ({ added, updated, removed }, conn) => {
      const changed = added.concat(updated, removed);
      if (conn !== null) {
        const ids = this.conns.get(conn);
        if (ids) {
          added.forEach((id) => ids.add(id));
          removed.forEach((id) => ids.delete(id));
        }
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed),
      );
      const buf = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => send(this, c, buf));
    });

    this.on('update', (update, _origin, doc) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const buf = encoding.toUint8Array(encoder);
      doc.conns.forEach((_, conn) => send(doc, conn, buf));
    });
  }
}

const getYDoc = (docName) => {
  let doc = docs.get(docName);
  if (!doc) {
    doc = new WSSharedDoc(docName);
    docs.set(docName, doc);
  }
  return doc;
};

const send = (doc, conn, message) => {
  if (conn.readyState !== WS_OPEN) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(message, (err) => err && closeConn(doc, conn));
  } catch {
    closeConn(doc, conn);
  }
};

const closeConn = (doc, conn) => {
  if (doc.conns.has(conn)) {
    const controlled = doc.conns.get(conn);
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlled), null);
    if (doc.conns.size === 0) {
      // 参加者ゼロでも doc は保持（ホストが再接続したとき状態を引き継ぐ）。
    }
  }
  try {
    conn.close();
  } catch {
    /* noop */
  }
};

const messageListener = (conn, doc, message) => {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const type = decoding.readVarUint(decoder);
    switch (type) {
      case MESSAGE_SYNC:
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        if (encoding.length(encoder) > 1) send(doc, conn, encoding.toUint8Array(encoder));
        break;
      case MESSAGE_AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn,
        );
        break;
    }
  } catch (err) {
    console.error('Yjs message handling error:', err);
  }
};

const setupConnection = (conn, docName) => {
  conn.binaryType = 'arraybuffer';
  const doc = getYDoc(docName);
  doc.conns.set(conn, new Set());

  conn.on('message', (msg) => messageListener(conn, doc, new Uint8Array(msg)));

  // keepalive（切断検知）
  let alive = true;
  const pingTimer = setInterval(() => {
    if (!alive) {
      closeConn(doc, conn);
      clearInterval(pingTimer);
      return;
    }
    if (doc.conns.has(conn)) {
      alive = false;
      try {
        conn.ping();
      } catch {
        closeConn(doc, conn);
        clearInterval(pingTimer);
      }
    }
  }, PING_TIMEOUT);
  conn.on('pong', () => {
    alive = true;
  });
  conn.on('close', () => {
    closeConn(doc, conn);
    clearInterval(pingTimer);
  });

  // 初期同期（sync step 1）＋ awareness 現状送信
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));

    const states = doc.awareness.getStates();
    if (states.size > 0) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(states.keys())),
      );
      send(doc, conn, encoding.toUint8Array(enc));
    }
  }
};

/** このマシンの LAN 向け IPv4 アドレス一覧を返す。 */
export const getLanIps = () => {
  const ips = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
    }
  }
  return ips;
};

/**
 * ハブを起動する。
 * @param {object} opts
 * @param {number} [opts.port=0] 0 で空きポート自動割当。
 * @param {string} [opts.host='0.0.0.0']
 * @param {string} [opts.staticDir] 指定時はこのディレクトリを SPA 配信する。
 * @param {(room: string, peer: string, kind: 'join'|'leave') => void} [opts.onConn] 接続ログ用。
 * @returns {Promise<{ port: number, host: string, lanIps: string[], close: () => Promise<void> }>}
 */
export const startHub = ({ port = 0, host = '0.0.0.0', staticDir, onConn } = {}) =>
  new Promise((resolve) => {
    const serve = staticDir ? sirv(staticDir, { single: true, dev: false, etag: true }) : null;

    const server = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
        return;
      }
      if (serve) {
        serve(req, res, () => {
          res.writeHead(404, { 'content-type': 'text/plain' });
          res.end('Not found');
        });
      } else {
        res.writeHead(426, { 'content-type': 'text/plain' });
        res.end('Upgrade Required');
      }
    });

    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (ws, req) => {
      const room = (req.url ?? '/').slice(1).split('?')[0] || 'default';
      const peer = req.socket.remoteAddress ?? '?';
      onConn?.(room, peer, 'join');
      ws.on('close', () => onConn?.(room, peer, 'leave'));
      setupConnection(ws, room);
    });

    server.on('upgrade', (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    });

    server.listen(port, host, () => {
      const addr = server.address();
      const boundPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: boundPort,
        host,
        lanIps: getLanIps(),
        close: () =>
          new Promise((done) => {
            for (const ws of wss.clients) {
              try {
                ws.terminate();
              } catch {
                /* noop */
              }
            }
            wss.close();
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
