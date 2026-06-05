// Electron preload（CommonJS）。レンダラへ最小 API を公開する。設計書 §9.15。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** 参加用 URL・QR 表示に使うセッション情報（port / room / lanIps / participantUrls）を取得する。 */
  getSessionInfo: () => ipcRenderer.invoke('collab:get-session-info'),
});
