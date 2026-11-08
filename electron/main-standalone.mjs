/**
 * 避難所レイアウトツール（単体動作版）— Electron メインプロセス。設計書 §9.20。
 *
 * コラボ版（electron/main.mjs）と対になるビルド。同期ハブを起動せず、LAN 公開もしない。
 * ネットワークに繋がっていない PC でも、アイコン起動だけで 3 ツール（レイアウト / 区画エディタ /
 * 区画印刷）をそのまま使える。データは従来どおり端末内（IndexedDB / LocalStorage）に保存される。
 *
 * SPA は 127.0.0.1 のローカル HTTP で配信する（理由は static-server.mjs のコメント参照）。
 */
import { app, BrowserWindow, Menu, dialog } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.mjs';
import { listenOnPreferredPort, STANDALONE_PORTS } from './preferred-port.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- アプリ識別（設計書 §9.22） ---
// パッケージ内 package.json に productName が無いため、既定では単体動作版とコラボ版が
// 同じ userData（evacuation-shelter-layout-tools）と単一インスタンスロックを共有してしまい、
// 2 つを同時に起動できない。ここで明示的に分離する（app.whenReady() より前に行う必要がある）。
app.setName('避難所レイアウト');
app.setPath('userData', path.join(app.getPath('appData'), 'EvacuationShelterLayout'));

let server = null;

const createWindow = async () => {
  // dist-standalone の場所：パッケージ版は app ルート直下、開発版（electron .）はプロジェクト直下。
  const staticDir =
    [
      path.join(app.getAppPath(), 'dist-standalone'),
      path.join(__dirname, '..', 'dist-standalone'),
    ].find((p) => existsSync(p)) ?? path.join(app.getAppPath(), 'dist-standalone');

  // 固定ポート優先（保存データを引き継ぐため。理由は preferred-port.mjs を参照）。
  server = await listenOnPreferredPort(STANDALONE_PORTS, (port) =>
    startStaticServer({ staticDir, port, host: '127.0.0.1' }),
  );

  const win = new BrowserWindow({
    width: 1366,
    height: 900,
    title: `避難所レイアウト  Ver. ${app.getVersion()}`,
    webPreferences: {
      // 単体動作版は preload で公開する API を持たない（コラボのセッション情報が不要なため）。
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ページの <title> でウィンドウタイトルが上書きされないようにする（バージョン表示を残すため）
  win.on('page-title-updated', (e) => e.preventDefault());

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

  // 単体動作版はメニュー画面から開始する（コラボ版はレイアウト画面へ直行）。
  await win.loadURL(`http://127.0.0.1:${server.port}/#/`);
};

// 多重起動を禁止（ローカルサーバの多重起動を防ぐ）。
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
        `アプリの起動でエラーが発生しました。\n\n${String(err?.stack ?? err)}`,
      );
      app.quit();
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });

  app.on('window-all-closed', () => {
    void server?.close();
    app.quit();
  });
}
