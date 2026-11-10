/**
 * マルチ操作の通信・プレゼンス層。設計書 §9.4 / §9.16 / §9.17 / §14.4。
 *
 * レイアウト文書そのもの（Y.Doc と文書操作・元に戻す）は `shared/layoutDoc.ts` が持つ。
 * 本モジュールはその `doc` を y-websocket でハブへ接続し、接続状態とプレゼンス（カーソル・選択・
 * 表示名・色）を扱う。UI 状態（アクティブ階層・選択・ビュー）は各ユーザーのローカルのまま。
 *
 * 本モジュールは y-websocket を静的 import するため、`useCollabLayer` から `import.meta.env.VITE_COLLAB`
 * ガード下の動的 import でのみ読み込む（Pages ビルドには非混入）。
 */
import { WebsocketProvider } from 'y-websocket';
import type { LayoutDoc, LayoutSnapshot } from '../shared/layoutDoc.ts';
import { PRESENCE_COLORS, type PresenceUser } from './presence.ts';

export { PRESENCE_COLORS };
export type { PresenceUser };

export type CollabStatus = 'connecting' | 'connected' | 'disconnected';

/** 同期するレイアウト文書のスナップショット（`LayoutSnapshot` と同じ）。 */
export type CollabSnapshot = LayoutSnapshot;

/** 他ユーザーのプレゼンス（カーソル・選択）。 */
export type RemotePresence = {
  clientId: number;
  user: PresenceUser;
  /** そのユーザーが表示中の階層 ID。 */
  floorId?: string;
  /** カーソル位置（メートル）。null/未定義は非表示。 */
  cursor?: { x: number; y: number } | null;
  /** 選択中の配置物 ID（代表 1 件。旧バージョンとの互換用）。 */
  selectedId?: string | null;
  /** 選択中の配置物 ID 全件（複数選択・ゾーン内選択）。未定義なら selectedId のみ。 */
  selectedIds?: string[];
};

/** 自分のプレゼンスとして更新できる部分。 */
export type LocalPresence = {
  floorId?: string;
  cursor?: { x: number; y: number } | null;
  selectedId?: string | null;
  selectedIds?: string[];
};

/** 自分の表示名・色は端末に保存し、再参加・再読込でも引き継ぐ。 */
const PRESENCE_USER_STORAGE_KEY = 'evac-collab/presence-user';

const loadStoredUser = (): Partial<PresenceUser> | null => {
  try {
    const raw = window.localStorage.getItem(PRESENCE_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PresenceUser>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveStoredUser = (user: PresenceUser): void => {
  try {
    window.localStorage.setItem(PRESENCE_USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    /* localStorage 不可環境では永続化を諦める（プレゼンス自体は動く） */
  }
};

export type CollabSession = {
  onStatus: (cb: (status: CollabStatus) => void) => () => void;
  /** ハブとの初回同期が終わったときに呼ばれる。 */
  onSynced: (cb: () => void) => () => void;
  /* ---- プレゼンス（カーソル・選択） ---- */
  updatePresence: (partial: LocalPresence) => void;
  onPresence: (cb: (others: RemotePresence[]) => void) => () => void;
  /** 自分の表示名・色を取得する。 */
  getLocalUser: () => PresenceUser;
  /** 自分の表示名・色を変更し、端末に永続化して他ユーザーへ配信する。 */
  setLocalUser: (user: PresenceUser) => void;
  /** 通信を切る（文書 `layoutDoc` は呼び出し側が破棄する）。 */
  destroy: () => void;
};

/** レイアウト文書をハブへ接続する。 */
export const createSession = (layoutDoc: LayoutDoc): CollabSession => {
  const { doc } = layoutDoc;

  const params = new URLSearchParams(window.location.search);
  const room = params.get('room') ?? 'poc1';
  const isHost = params.get('host') === '1';
  // 既定は「アプリを配信しているのと同一オリジン」をハブとする（Electron ホストは
  // 埋め込みサーバが HTTP 配信と WS ハブを同一ポートで兼ねる）。開発時のみ env で上書き。
  const wsUrl = import.meta.env.VITE_COLLAB_WS_URL ?? `ws://${window.location.host}`;

  const provider = new WebsocketProvider(wsUrl, room, doc);

  const onStatus = (cb: (status: CollabStatus) => void): (() => void) => {
    const handler = (e: { status: string }): void => {
      cb(e.status === 'connected' ? 'connected' : 'disconnected');
    };
    provider.on('status', handler);
    return () => provider.off('status', handler);
  };

  const onSynced = (cb: () => void): (() => void) => {
    const handler = (isSynced: boolean): void => {
      if (isSynced) cb();
    };
    provider.on('sync', handler);
    return () => provider.off('sync', handler);
  };

  /* ---- プレゼンス（カーソル・選択） ---- */
  const awareness = provider.awareness;
  const colorIndex = doc.clientID % PRESENCE_COLORS.length;
  const stored = loadStoredUser();
  let localUser: PresenceUser = {
    color: stored?.color ?? PRESENCE_COLORS[colorIndex],
    name: stored?.name ?? (isHost ? 'ホスト' : `参加者${colorIndex + 1}`),
  };
  awareness.setLocalStateField('user', localUser);

  const getLocalUser = (): PresenceUser => localUser;

  const setLocalUser = (next: PresenceUser): void => {
    const name = next.name.trim() || localUser.name;
    const color = next.color || localUser.color;
    localUser = { name, color };
    awareness.setLocalStateField('user', localUser);
    saveStoredUser(localUser);
  };

  const updatePresence = (partial: LocalPresence): void => {
    for (const [k, v] of Object.entries(partial)) {
      awareness.setLocalStateField(k, v);
    }
  };

  const onPresence = (cb: (others: RemotePresence[]) => void): (() => void) => {
    const emit = (): void => {
      const others: RemotePresence[] = [];
      awareness.getStates().forEach((st, clientId) => {
        if (clientId === doc.clientID) return;
        const u = st.user as PresenceUser | undefined;
        if (!u) return;
        others.push({
          clientId,
          user: u,
          floorId: st.floorId as string | undefined,
          cursor: st.cursor as { x: number; y: number } | null | undefined,
          selectedId: st.selectedId as string | null | undefined,
          selectedIds: Array.isArray(st.selectedIds) ? (st.selectedIds as string[]) : undefined,
        });
      });
      cb(others);
    };
    awareness.on('change', emit);
    return () => awareness.off('change', emit);
  };

  const destroy = (): void => {
    provider.destroy();
  };

  return {
    onStatus,
    onSynced,
    updatePresence,
    onPresence,
    getLocalUser,
    setLocalUser,
    destroy,
  };
};
