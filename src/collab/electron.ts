/**
 * Electron ホストアプリ（preload で公開された API）へのアクセス。設計書 §9.15。
 * ブラウザ（GitHub Pages 版・dev:collab）では electronAPI は存在せず null を返す。
 */
export type CollabSessionInfo = {
  port: number;
  room: string;
  /** 参加者に提示できる LAN アドレス（優先順）。VPN・リンクローカルは除外済み。設計書 §9.21。 */
  lanIps: string[];
  /** 上記に対応するインターフェース名付きの一覧（UI の選択肢ラベル用）。 */
  lanNetworks?: { address: string; iface: string }[];
  participantUrls: string[];
};

type ElectronAPI = {
  getSessionInfo: () => Promise<CollabSessionInfo | null>;
};

export const getElectronAPI = (): ElectronAPI | null => {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
  return api ?? null;
};
