/// <reference types="vite/client" />

/** ビルド時に vite.config.ts の define で注入される、package.json の version。 */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** マルチ操作（同時編集）コラボ機能を有効化するビルドフラグ。'true' で有効。設計書 §9.9。 */
  readonly VITE_COLLAB?: string;
  /** 同期ハブ（y-websocket）の WebSocket URL。未指定時は ws://<現在ホスト>:1234。 */
  readonly VITE_COLLAB_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
