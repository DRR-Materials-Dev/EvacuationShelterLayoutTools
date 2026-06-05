/**
 * マルチ操作の同期セッション層。設計書 §9.4 / §9.16 / §9.17。
 *
 * 同期対象は「レイアウト文書（全階層）」：
 * - `floors`：`Y.Array<Y.Map>`（各階層 = Y.Map：id/name/scaleRatio/background ＋ placed(Y.Array<Y.Map>)）。
 *   placed は 1 配置物 = 1 Y.Map（別要素の同時移動は自動マージ、同一要素同一プロパティは LWW）。
 * - `meta`：`Y.Map`（zoneList / zoneListName / residentTypes / initialized）。
 *
 * UI 状態（アクティブ階層・選択・ビュー）は各ユーザーのローカルのまま（プレゼンス共有は将来）。
 *
 * 本モジュールは yjs を静的 import するため、`useCollabLayer` から `import.meta.env.VITE_COLLAB`
 * ガード下の動的 import でのみ読み込む（Pages ビルドには非混入）。
 */
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { Floor, PlacedItem, ResidentType, ZoneList } from '../shared/types.ts';
import { PRESENCE_COLORS, type PresenceUser } from './presence.ts';

export { PRESENCE_COLORS };
export type { PresenceUser };

export type CollabStatus = 'connecting' | 'connected' | 'disconnected';

export type CollabSnapshot = {
  floors: Floor[];
  zoneList: ZoneList | null;
  zoneListName: string | null;
  residentTypes: ResidentType[] | null;
};

/** 他ユーザーのプレゼンス（カーソル・選択）。 */
export type RemotePresence = {
  clientId: number;
  user: PresenceUser;
  /** そのユーザーが表示中の階層 ID。 */
  floorId?: string;
  /** カーソル位置（メートル）。null/未定義は非表示。 */
  cursor?: { x: number; y: number } | null;
  /** 選択中の配置物 ID。 */
  selectedId?: string | null;
};

/** 自分のプレゼンスとして更新できる部分。 */
export type LocalPresence = {
  floorId?: string;
  cursor?: { x: number; y: number } | null;
  selectedId?: string | null;
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
  getSnapshot: () => CollabSnapshot;
  onChange: (cb: (snap: CollabSnapshot) => void) => () => void;
  onStatus: (cb: (status: CollabStatus) => void) => () => void;
  onSynced: (cb: () => void) => () => void;
  /** まだ初期化されていなければ host の現在の文書でシードする。 */
  seedIfEmpty: (initial: CollabSnapshot) => void;
  /* ---- placed 操作（floorId 指定） ---- */
  updatePlaced: (floorId: string, id: string, attrs: Partial<PlacedItem>) => void;
  addItem: (floorId: string, item: PlacedItem) => void;
  removeItem: (floorId: string, id: string) => void;
  /* ---- 階層レベル操作 ---- */
  setBackground: (floorId: string, bg: Floor['background'] | null) => void;
  setScaleRatio: (floorId: string, r: number) => void;
  renameFloor: (floorId: string, name: string) => void;
  addFloor: (floor: Floor) => void;
  removeFloor: (floorId: string) => void;
  moveFloor: (floorId: string, dir: -1 | 1) => void;
  /** 全削除：指定階層の placed を消し背景を null にする。 */
  clearFloor: (floorId: string) => void;
  /* ---- 文書レベル操作 ---- */
  setResidentTypes: (types: ResidentType[]) => void;
  /** 区画リストを更新（placed は維持）。 */
  setZoneList: (zoneList: ZoneList, zoneListName: string) => void;
  /** 区画リストを差し替え、全階層の placed をクリア（区画タイプが変わるため）。 */
  replaceZoneListClearPlaced: (zoneList: ZoneList, zoneListName: string) => void;
  replaceDocument: (snap: CollabSnapshot) => void;
  /* ---- プレゼンス（カーソル・選択） ---- */
  updatePresence: (partial: LocalPresence) => void;
  onPresence: (cb: (others: RemotePresence[]) => void) => () => void;
  /** 自分の表示名・色を取得する。 */
  getLocalUser: () => PresenceUser;
  /** 自分の表示名・色を変更し、端末に永続化して他ユーザーへ配信する。 */
  setLocalUser: (user: PresenceUser) => void;
  destroy: () => void;
};

type YMapU = Y.Map<unknown>;

const itemToYMap = (item: PlacedItem): YMapU => {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(item)) {
    if (v !== undefined) m.set(k, v);
  }
  return m;
};

const floorToYMap = (floor: Floor): YMapU => {
  const m = new Y.Map<unknown>();
  m.set('id', floor.id);
  m.set('name', floor.name);
  m.set('scaleRatio', floor.scaleRatio);
  m.set('background', floor.background ?? null);
  const arr = new Y.Array<YMapU>();
  arr.push(floor.placed.map(itemToYMap));
  m.set('placed', arr);
  return m;
};

const floorFromYMap = (m: YMapU): Floor => {
  const placedArr = m.get('placed') as Y.Array<YMapU> | undefined;
  const bg = m.get('background') as Floor['background'] | null | undefined;
  const floor: Floor = {
    id: m.get('id') as string,
    name: m.get('name') as string,
    scaleRatio: m.get('scaleRatio') as number,
    placed: placedArr ? placedArr.toArray().map((p) => p.toJSON() as PlacedItem) : [],
  };
  if (bg) floor.background = bg;
  return floor;
};

export const createSession = (): CollabSession => {
  const doc = new Y.Doc();
  const floors = doc.getArray<YMapU>('floors');
  const meta = doc.getMap<unknown>('meta');

  const params = new URLSearchParams(window.location.search);
  const room = params.get('room') ?? 'poc1';
  const isHost = params.get('host') === '1';
  // 既定は「アプリを配信しているのと同一オリジン」をハブとする（Electron ホストは
  // 埋め込みサーバが HTTP 配信と WS ハブを同一ポートで兼ねる）。開発時のみ env で上書き。
  const wsUrl = import.meta.env.VITE_COLLAB_WS_URL ?? `ws://${window.location.host}`;

  const provider = new WebsocketProvider(wsUrl, room, doc);

  const findFloor = (floorId: string): YMapU | null => {
    for (const m of floors.toArray()) {
      if (m.get('id') === floorId) return m;
    }
    return null;
  };
  const floorPlaced = (floorId: string): Y.Array<YMapU> | null =>
    (findFloor(floorId)?.get('placed') as Y.Array<YMapU> | undefined) ?? null;

  const getSnapshot = (): CollabSnapshot => ({
    floors: floors.toArray().map(floorFromYMap),
    zoneList: (meta.get('zoneList') as ZoneList | undefined) ?? null,
    zoneListName: (meta.get('zoneListName') as string | undefined) ?? null,
    residentTypes: (meta.get('residentTypes') as ResidentType[] | undefined) ?? null,
  });

  const onChange = (cb: (snap: CollabSnapshot) => void): (() => void) => {
    const handler = (): void => cb(getSnapshot());
    doc.on('update', handler);
    return () => doc.off('update', handler);
  };

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

  const applyMeta = (snap: CollabSnapshot): void => {
    if (snap.zoneList) meta.set('zoneList', snap.zoneList);
    if (snap.zoneListName != null) meta.set('zoneListName', snap.zoneListName);
    if (snap.residentTypes) meta.set('residentTypes', snap.residentTypes);
  };

  const seedIfEmpty = (initial: CollabSnapshot): void => {
    if (meta.get('initialized')) return;
    doc.transact(() => {
      if (floors.length === 0) floors.push(initial.floors.map(floorToYMap));
      applyMeta(initial);
      meta.set('initialized', true);
    });
  };

  const updatePlaced = (floorId: string, id: string, attrs: Partial<PlacedItem>): void => {
    const arr = floorPlaced(floorId);
    if (!arr) return;
    const items = arr.toArray();
    const idx = items.findIndex((m) => m.get('id') === id);
    if (idx < 0) return;
    const m = items[idx];
    doc.transact(() => {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined) m.delete(k);
        else m.set(k, v);
      }
    });
  };

  const addItem = (floorId: string, item: PlacedItem): void => {
    const arr = floorPlaced(floorId);
    if (!arr) return;
    doc.transact(() => arr.push([itemToYMap(item)]));
  };

  const removeItem = (floorId: string, id: string): void => {
    const arr = floorPlaced(floorId);
    if (!arr) return;
    const idx = arr.toArray().findIndex((m) => m.get('id') === id);
    if (idx < 0) return;
    doc.transact(() => arr.delete(idx, 1));
  };

  const setBackground = (floorId: string, bg: Floor['background'] | null): void => {
    const f = findFloor(floorId);
    if (!f) return;
    doc.transact(() => f.set('background', bg ?? null));
  };

  const setScaleRatio = (floorId: string, r: number): void => {
    if (!(r > 0 && Number.isFinite(r))) return;
    const f = findFloor(floorId);
    if (!f) return;
    doc.transact(() => f.set('scaleRatio', r));
  };

  const renameFloor = (floorId: string, name: string): void => {
    const f = findFloor(floorId);
    if (!f) return;
    doc.transact(() => f.set('name', name));
  };

  const addFloor = (floor: Floor): void => {
    doc.transact(() => floors.push([floorToYMap(floor)]));
  };

  const removeFloor = (floorId: string): void => {
    if (floors.length <= 1) return; // 最低 1 階層を維持
    const idx = floors.toArray().findIndex((m) => m.get('id') === floorId);
    if (idx < 0) return;
    doc.transact(() => floors.delete(idx, 1));
  };

  const moveFloor = (floorId: string, dir: -1 | 1): void => {
    const arr = floors.toArray();
    const idx = arr.findIndex((m) => m.get('id') === floorId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= arr.length) return;
    // Yjs は統合済み要素の再挿入を許さないため、移動対象を JSON から作り直す。
    const moved = floorFromYMap(arr[idx]);
    doc.transact(() => {
      floors.delete(idx, 1);
      floors.insert(target, [floorToYMap(moved)]);
    });
  };

  const clearFloor = (floorId: string): void => {
    const f = findFloor(floorId);
    if (!f) return;
    const arr = f.get('placed') as Y.Array<YMapU> | undefined;
    doc.transact(() => {
      if (arr) arr.delete(0, arr.length);
      f.set('background', null);
    });
  };

  const setResidentTypes = (types: ResidentType[]): void => {
    const validIds = new Set(types.map((t) => t.id));
    doc.transact(() => {
      meta.set('residentTypes', types);
      // 削除された種類の人数を全階層の placed から除去
      for (const fm of floors.toArray()) {
        const arr = fm.get('placed') as Y.Array<YMapU> | undefined;
        if (!arr) continue;
        for (const m of arr.toArray()) {
          if (m.get('kind') !== 'zone') continue;
          const residents = m.get('residents') as Record<string, number> | undefined;
          if (!residents) continue;
          const filtered: Record<string, number> = {};
          let changed = false;
          for (const [typeId, n] of Object.entries(residents)) {
            if (validIds.has(typeId)) filtered[typeId] = n;
            else changed = true;
          }
          if (changed) {
            if (Object.keys(filtered).length > 0) m.set('residents', filtered);
            else m.delete('residents');
          }
        }
      }
    });
  };

  const replaceDocument = (snap: CollabSnapshot): void => {
    doc.transact(() => {
      floors.delete(0, floors.length);
      floors.push(snap.floors.map(floorToYMap));
      applyMeta(snap);
      meta.set('initialized', true);
    });
  };

  const setZoneList = (zoneList: ZoneList, zoneListName: string): void => {
    doc.transact(() => {
      meta.set('zoneList', zoneList);
      meta.set('zoneListName', zoneListName);
    });
  };

  const replaceZoneListClearPlaced = (zoneList: ZoneList, zoneListName: string): void => {
    doc.transact(() => {
      meta.set('zoneList', zoneList);
      meta.set('zoneListName', zoneListName);
      for (const fm of floors.toArray()) {
        const arr = fm.get('placed') as Y.Array<YMapU> | undefined;
        if (arr) arr.delete(0, arr.length);
      }
    });
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
        });
      });
      cb(others);
    };
    awareness.on('change', emit);
    return () => awareness.off('change', emit);
  };

  const destroy = (): void => {
    provider.destroy();
    doc.destroy();
  };

  return {
    getSnapshot,
    onChange,
    onStatus,
    onSynced,
    seedIfEmpty,
    updatePlaced,
    addItem,
    removeItem,
    setBackground,
    setScaleRatio,
    renameFloor,
    addFloor,
    removeFloor,
    moveFloor,
    clearFloor,
    setResidentTypes,
    setZoneList,
    replaceZoneListClearPlaced,
    replaceDocument,
    updatePresence,
    onPresence,
    getLocalUser,
    setLocalUser,
    destroy,
  };
};
