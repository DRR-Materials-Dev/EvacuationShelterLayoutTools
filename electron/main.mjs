/**
 * 避難所レイアウトツール（コラボ）— Electron メインプロセス。設計書 §9.15。
 *
 * 一般利用者がアイコン起動するホスト用アプリ。内部で「同期ハブ＋静的配信」を同一ポートで
 * 起動し、ホスト自身はウィンドウで編集、参加者は表示される URL/QR をブラウザで開く。
 */
import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startHub } from '../collab-server/hub.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ルーム ID（推測されにくい乱数）。1 起動 = 1 セッション。
const ROOM = `room-${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 6)}`;

let hub = null;
let sessionInfo = null;

const buildParticipantUrls = (port, lanIps) =>
  lanIps.map((ip) => `http://${ip}:${port}/?room=${ROOM}#/layout`);

const createWindow = async () => {
  // dist-collab の場所：パッケージ版は app ルート直下、開発版（electron .）はプロジェクト直下。
  // どちらの起動形態でも見つかるようフォールバックする。
  const staticDir =
    [
      path.join(app.getAppPath(), 'dist-collab'),
      path.join(__dirname, '..', 'dist-collab'),
    ].find((p) => existsSync(p)) ?? path.join(app.getAppPath(), 'dist-collab');

  hub = await startHub({
    port: 0, // 空きポート自動割当
    host: '0.0.0.0',
    staticDir,
    onConn: (room, peer, kind) => {
      console.log(`${kind === 'join' ? '[+] 参加' : '[-] 退出'}  room="${room}"  from ${peer}`);
    },
  });

  sessionInfo = {
    port: hub.port,
    room: ROOM,
    lanIps: hub.lanIps,
    participantUrls: buildParticipantUrls(hub.port, hub.lanIps),
  };

  const win = new BrowserWindow({
    width: 1366,
    height: 900,
    title: '避難所レイアウト（コラボ）',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'ファイル',
        submenu: [{ role: 'quit', label: '終了' }],
      },
      {
        label: '表示',
        submenu: [
          { role: 'reload', label: '再読み込み' },
          { role: 'resetZoom', label: '拡大率をリセット' },
          { role: 'zoomIn', label: '拡大' },
          { role: 'zoomOut', label: '縮小' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: '全画面表示' },
        ],
      },
    ]),
  );

  // ホストは ?host=1 で初期データの提供元になる。
  await win.loadURL(`http://127.0.0.1:${hub.port}/?host=1&room=${ROOM}#/layout`);
};

ipcMain.handle('collab:get-session-info', () => sessionInfo);

// 多重起動を禁止（ハブの多重起動・ポート競合を防ぐ）。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady()
    .then(createWindow)
    .catch((err) => {
      dialog.showErrorBox(
        '起動に失敗しました',
        `同期サーバの起動でエラーが発生しました。\n\n${String(err?.stack ?? err)}`,
      );
      app.quit();
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });

  app.on('window-all-closed', () => {
    void hub?.close();
    app.quit();
  });
}
