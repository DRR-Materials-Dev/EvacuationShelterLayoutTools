/**
 * Electron ホストアプリ（preload で公開された API）へのアクセス。設計書 §9.15。
 * ブラウザ（GitHub Pages 版・dev:collab）では electronAPI は存在せず null を返す。
 */
export type CollabSessionInfo = {
  port: number;
  room: string;
  lanIps: string[];
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
