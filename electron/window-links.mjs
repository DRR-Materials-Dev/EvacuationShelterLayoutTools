/**
 * Electron ウィンドウのリンクの扱い（v2.8.0、ユーザーマニュアル用）。
 *
 * - アプリ自身のサーバ（localOrigin）のページ（マニュアル等）は、アプリ内の別ウィンドウで開く。
 * - それ以外（GitHub のリリースページ等）は、OS の既定のブラウザで開く。
 */
import { BrowserWindow, shell } from 'electron';

/** マニュアル用のウィンドウの大きさ。 */
const MANUAL_WINDOW = { width: 1100, height: 900 };

/**
 * @param {BrowserWindow} win
 * @param {string} localOrigin 例: http://127.0.0.1:52845
 */
export const routeWindowOpen = (win, localOrigin) => {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${localOrigin}/`)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { ...MANUAL_WINDOW, autoHideMenuBar: true },
      };
    }
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // 開いた別ウィンドウ（マニュアル）の中のリンクにも同じ規則を当てる
  win.webContents.on('did-create-window', (child) => routeWindowOpen(child, localOrigin));
};

/**
 * 「ヘルプ」メニュー。
 * @param {string} localOrigin
 */
export const helpMenu = (localOrigin) => ({
  label: 'ヘルプ',
  submenu: [
    {
      label: '使い方マニュアル',
      click: () => {
        const w = new BrowserWindow({ ...MANUAL_WINDOW, autoHideMenuBar: true });
        routeWindowOpen(w, localOrigin);
        void w.loadURL(`${localOrigin}/manual/index.html`);
      },
    },
  ],
});
