/**
 * レイアウト文書（全階層 floors ＋区画リスト＋居住者種類）の Yjs 層。設計書 §14。
 *
 * スタンドアロン版・Pages 版・マルチ操作版の 3 つで共通に使う。通信（y-websocket）と
 * プレゼンスは持たず、マルチ操作版では `collab/session.ts` が本モジュールの `doc` を接続する。
 *
 * 文書の形（§9.4 と同じ。並び順 `order` のみ v2.8.0 で追加）:
 * - `floors`：`Y.Array<Y.Map>`（各階層 = Y.Map：id/name/scaleRatio/background/order ＋ placed(Y.Array<Y.Map>)）。
 *   placed は 1 配置物 = 1 Y.Map（別要素の同時移動は自動マージ、同一要素同一プロパティは LWW）。
 *   階層の表示順は `order`（数値）の昇順。`order` の無い階層は配列の位置で補う。
 * - `meta`：`Y.Map`（zoneList / zoneListName / residentTypes / initialized / epoch）。
 *
 * 元に戻す（§14.5）:
 * - 自分の編集は `ORIGIN_EDIT` を付けて transact し、`Y.UndoManager` はこの origin だけを追う。
 *   起動時の復元・初期シード・全体置き換え・区画リストの変更は `ORIGIN_SYSTEM` で行い、履歴に入れない。
 *   他の参加者の変更は通信層の origin で届くため対象外になる。
 * - 全体置き換えでは `meta.epoch` を進める。各端末はその変化を見て自分の履歴を消す。
 */
import * as Y from 'yjs';
import { DEFAULT_POLYGON_STYLE, INITIAL_SCALE_RATIO } from './constants.ts';
import type {
  Floor,
  PlacedItem,
  PlacedZone,
  PolygonZone,
  ResidentType,
  TextBlock,
  ZoneList,
} from './types.ts';

/** 自分の編集（元に戻すの対象）。 */
export const ORIGIN_EDIT = 'evac/edit';
/** 復元・初期シード・全体置き換え・区画リストの変更（元に戻すの対象外）。 */
export const ORIGIN_SYSTEM = 'evac/system';

/** 元に戻せる履歴の上限（§14.2）。 */
export const HISTORY_LIMIT = 100;
/** この時間内に続いた「まとめてよい変更」は 1 件の履歴にする（ms）。 */
export const CAPTURE_TIMEOUT_MS = 500;

export type LayoutSnapshot = {
  floors: Floor[];
  zoneList: ZoneList | null;
  zoneListName: string | null;
  residentTypes: ResidentType[] | null;
};

export type HistoryState = { canUndo: boolean; canRedo: boolean };

/**
 * 履歴 1 件ごとに記録する画面の状態（§14.5）。その操作をした時点の表示中の階層と選択。
 * 取り消し・やり直しのあと、この階層に切り替えて選び直す。
 */
export type HistoryView = {
  floorId: string;
  selectedIds: string[];
  innerZoneId: string | null;
};

/** 取り消し・やり直しの結果。何も戻さなかったときは null。 */
export type UndoResult = { view: HistoryView | null };

/**
 * 編集のオプション。
 * merge: 直前の変更と 1 件の履歴にまとめてよい（人数入力・スライダーなど細かく続く変更）。
 *        既定 false＝この操作の前で履歴を区切る（ドラッグ・追加・削除など）。
 */
export type EditOptions = { merge?: boolean };

type Pt = { x: number; y: number };

export type LayoutDoc = {
  /** 通信層が接続する Y.Doc。 */
  doc: Y.Doc;
  getSnapshot: () => LayoutSnapshot;
  /** 文書が変わるたび（自分・他の参加者とも）に呼ばれる。 */
  onChange: (cb: (snap: LayoutSnapshot) => void) => () => void;
  isInitialized: () => boolean;
  /** まだ初期化されていなければ initial でシードする（履歴に入れない）。 */
  seedIfEmpty: (initial: LayoutSnapshot) => void;
  /** 文書を丸ごと置き換える（レイアウト読込・起動時の復元）。履歴は全員分消える。 */
  replaceDocument: (snap: LayoutSnapshot) => void;
  /* ---- 配置物（floorId 指定） ---- */
  updatePlaced: (floorId: string, id: string, attrs: Partial<PlacedItem>, opts?: EditOptions) => void;
  /** 複数配置物の更新を 1 トランザクション（＝1 件の履歴）で行う。 */
  updatePlacedMany: (
    floorId: string,
    updates: { id: string; attrs: Partial<PlacedItem> }[],
    opts?: EditOptions,
  ) => void;
  /** 区画の居住者人数を設定する（0 以下の種類は除く。全種類 0 ならキーを消す）。 */
  setZoneResidents: (
    floorId: string,
    id: string,
    residents: Record<string, number>,
    opts?: EditOptions,
  ) => void;
  addItem: (floorId: string, item: PlacedItem) => void;
  addItems: (floorId: string, items: PlacedItem[]) => void;
  removeItem: (floorId: string, id: string) => void;
  removeItems: (floorId: string, ids: string[]) => void;
  /** 区画を配置し、その ID を返す。 */
  addPlacedZone: (floorId: string, typeId: string, xMeters: number, yMeters: number) => string;
  /** テキストを配置し、その ID を返す。 */
  addText: (
    floorId: string,
    xMeters: number,
    yMeters: number,
    text: string,
    fontSize: number,
    color: string,
  ) => string;
  /** ゾーン（多角形）を追加し、その ID を返す。3 点未満なら何もせず null。 */
  addPolygon: (floorId: string, points: Pt[]) => string | null;
  /* ---- 階層 ---- */
  setBackground: (floorId: string, bg: Floor['background'] | null) => void;
  setScaleRatio: (floorId: string, r: number) => void;
  renameFloor: (floorId: string, name: string) => void;
  /** 階層を末尾に追加し、その ID を返す。名前は「(階層数+1)F」。 */
  addFloor: () => string;
  /** 階層を削除する（最低 1 階層は残す）。 */
  removeFloor: (floorId: string) => void;
  /** 階層を表示順で前後に動かす（`order` の入れ替え。§14.5）。 */
  moveFloor: (floorId: string, dir: -1 | 1) => void;
  /** 全削除：指定階層の配置物を消し背景を外す。 */
  clearFloor: (floorId: string) => void;
  /* ---- 文書全体 ---- */
  /** 居住者種類を置き換え、削除された種類の人数を全階層の区画から除く。 */
  setResidentTypes: (types: ResidentType[]) => void;
  /** 区画リストを更新する（配置物は維持。元に戻すの対象外）。 */
  setZoneList: (zoneList: ZoneList, zoneListName: string) => void;
  /** 区画リストを差し替え、全階層の配置物を消す（元に戻すの対象外。履歴は全員分消える）。 */
  replaceZoneListClearPlaced: (zoneList: ZoneList, zoneListName: string) => void;
  /* ---- 元に戻す ---- */
  /** 自分の直前の操作を取り消す。戻したらその操作の時点の画面の状態を返す。 */
  undo: () => UndoResult | null;
  /** 取り消した操作をやり直す。やり直したら取り消した時点の画面の状態を返す。 */
  redo: () => UndoResult | null;
  /** 履歴に記録する画面の状態の取得元を登録する（履歴が増えるたびに呼ばれる）。 */
  setViewProvider: (provider: (() => HistoryView) | null) => void;
  getHistoryState: () => HistoryState;
  onHistoryChange: (cb: (state: HistoryState) => void) => () => void;
  clearHistory: () => void;
  /** 次の編集を必ず別の履歴にする。 */
  stopCapturing: () => void;
  destroy: () => void;
};

type YMapU = Y.Map<unknown>;

export const genId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const itemToYMap = (item: PlacedItem): YMapU => {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(item)) {
    if (v !== undefined) m.set(k, v);
  }
  return m;
};

const floorToYMap = (floor: Floor, order: number): YMapU => {
  const m = new Y.Map<unknown>();
  m.set('id', floor.id);
  m.set('name', floor.name);
  m.set('scaleRatio', floor.scaleRatio);
  m.set('background', floor.background ?? null);
  m.set('order', order);
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

export const createLayoutDoc = (doc: Y.Doc = new Y.Doc()): LayoutDoc => {
  const floors = doc.getArray<YMapU>('floors');
  const meta = doc.getMap<unknown>('meta');

  const undoManager = new Y.UndoManager([floors, meta], {
    trackedOrigins: new Set([ORIGIN_EDIT]),
    captureTimeout: CAPTURE_TIMEOUT_MS,
  });

  /**
   * 直前の編集が「まとめてよい変更」だったときの対象（例: 'f1/z1'）。それ以外の編集のあとは null。
   * まとめるのは、同じ対象への細かい入力が続いたときだけにする（ドラッグ直後の色変更などは別の履歴）。
   */
  let lastMergeTarget: string | null = null;

  /**
   * 自分の編集。mergeTarget を指定し opts.merge のときは、直前も同じ対象への merge なら履歴をまとめる
   * （まとめるかどうかの時間判定は UndoManager の captureTimeout）。それ以外は直前の変更と履歴を区切る。
   */
  const edit = (fn: () => void, opts?: EditOptions, mergeTarget?: string): void => {
    const target = opts?.merge && mergeTarget ? mergeTarget : null;
    if (target === null || target !== lastMergeTarget) undoManager.stopCapturing();
    doc.transact(fn, ORIGIN_EDIT);
    lastMergeTarget = target;
  };
  const system = (fn: () => void): void => {
    doc.transact(fn, ORIGIN_SYSTEM);
  };

  /** 表示順に並べた階層。`order` の無い階層・同値は配列の位置で補う。 */
  const sortedFloorMaps = (): YMapU[] =>
    floors
      .toArray()
      .map((m, index) => {
        const o = m.get('order');
        return { m, index, order: typeof o === 'number' ? o : index };
      })
      .sort((a, b) => a.order - b.order || a.index - b.index)
      .map((e) => e.m);

  const findFloor = (floorId: string): YMapU | null => {
    for (const m of floors.toArray()) {
      if (m.get('id') === floorId) return m;
    }
    return null;
  };
  const floorPlaced = (floorId: string): Y.Array<YMapU> | null =>
    (findFloor(floorId)?.get('placed') as Y.Array<YMapU> | undefined) ?? null;

  const getSnapshot = (): LayoutSnapshot => ({
    floors: sortedFloorMaps().map(floorFromYMap),
    zoneList: (meta.get('zoneList') as ZoneList | undefined) ?? null,
    zoneListName: (meta.get('zoneListName') as string | undefined) ?? null,
    residentTypes: (meta.get('residentTypes') as ResidentType[] | undefined) ?? null,
  });

  const onChange = (cb: (snap: LayoutSnapshot) => void): (() => void) => {
    const handler = (): void => cb(getSnapshot());
    doc.on('update', handler);
    return () => doc.off('update', handler);
  };

  const applyMeta = (snap: LayoutSnapshot): void => {
    if (snap.zoneList) meta.set('zoneList', snap.zoneList);
    if (snap.zoneListName != null) meta.set('zoneListName', snap.zoneListName);
    if (snap.residentTypes) meta.set('residentTypes', snap.residentTypes);
  };

  const bumpEpoch = (): void => {
    const cur = meta.get('epoch');
    meta.set('epoch', (typeof cur === 'number' ? cur : 0) + 1);
  };

  // 全体置き換え（自分・他の参加者とも）で履歴を消す。
  const onMetaChange = (e: Y.YMapEvent<unknown>): void => {
    if (e.keysChanged.has('epoch')) undoManager.clear();
  };
  meta.observe(onMetaChange);

  const isInitialized = (): boolean => meta.get('initialized') === true;

  const seedIfEmpty = (initial: LayoutSnapshot): void => {
    if (isInitialized()) return;
    system(() => {
      if (floors.length === 0) floors.push(initial.floors.map((f, i) => floorToYMap(f, i)));
      applyMeta(initial);
      meta.set('initialized', true);
    });
  };

  const replaceDocument = (snap: LayoutSnapshot): void => {
    system(() => {
      floors.delete(0, floors.length);
      floors.push(snap.floors.map((f, i) => floorToYMap(f, i)));
      applyMeta(snap);
      meta.set('initialized', true);
      bumpEpoch();
    });
  };

  /* ---- 配置物 ---- */

  const updatePlacedMany = (
    floorId: string,
    updates: { id: string; attrs: Partial<PlacedItem> }[],
    opts?: EditOptions,
  ): void => {
    const arr = floorPlaced(floorId);
    if (!arr || updates.length === 0) return;
    const byId = new Map(arr.toArray().map((m) => [m.get('id') as string, m]));
    edit(() => {
      for (const { id, attrs } of updates) {
        const m = byId.get(id);
        if (!m) continue; // 他の参加者が削除済み
        for (const [k, v] of Object.entries(attrs)) {
          if (v === undefined) m.delete(k);
          else m.set(k, v);
        }
      }
    }, opts, `${floorId}/${updates.map((u) => u.id).join(',')}`);
  };

  const updatePlaced = (
    floorId: string,
    id: string,
    attrs: Partial<PlacedItem>,
    opts?: EditOptions,
  ): void => {
    updatePlacedMany(floorId, [{ id, attrs }], opts);
  };

  const setZoneResidents = (
    floorId: string,
    id: string,
    residents: Record<string, number>,
    opts?: EditOptions,
  ): void => {
    const cleaned: Record<string, number> = {};
    for (const [typeId, n] of Object.entries(residents)) {
      if (n > 0) cleaned[typeId] = n;
    }
    updatePlaced(
      floorId,
      id,
      { residents: Object.keys(cleaned).length > 0 ? cleaned : undefined } as Partial<PlacedItem>,
      opts,
    );
  };

  const addItems = (floorId: string, items: PlacedItem[]): void => {
    const arr = floorPlaced(floorId);
    if (!arr || items.length === 0) return;
    edit(() => arr.push(items.map(itemToYMap)));
  };

  const addItem = (floorId: string, item: PlacedItem): void => {
    addItems(floorId, [item]);
  };

  const removeItems = (floorId: string, ids: string[]): void => {
    const arr = floorPlaced(floorId);
    if (!arr || ids.length === 0) return;
    const target = new Set(ids);
    const list = arr.toArray();
    if (!list.some((m) => target.has(m.get('id') as string))) return;
    edit(() => {
      // 後ろから消してインデックスずれを避ける
      for (let i = list.length - 1; i >= 0; i--) {
        if (target.has(list[i].get('id') as string)) arr.delete(i, 1);
      }
    });
  };

  const removeItem = (floorId: string, id: string): void => {
    removeItems(floorId, [id]);
  };

  const addPlacedZone = (floorId: string, typeId: string, xMeters: number, yMeters: number): string => {
    const zone: PlacedZone = {
      kind: 'zone',
      id: genId('zone'),
      typeId,
      x: xMeters,
      y: yMeters,
      rotation: 0,
    };
    addItem(floorId, zone);
    return zone.id;
  };

  const addText = (
    floorId: string,
    xMeters: number,
    yMeters: number,
    text: string,
    fontSize: number,
    color: string,
  ): string => {
    const block: TextBlock = {
      kind: 'text',
      id: genId('text'),
      text,
      x: xMeters,
      y: yMeters,
      fontSize,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      color,
    };
    addItem(floorId, block);
    return block.id;
  };

  const addPolygon = (floorId: string, points: Pt[]): string | null => {
    if (points.length < 3) return null;
    const polygon: PolygonZone = {
      kind: 'polygon',
      id: genId('polygon'),
      points: points.map((p) => ({ x: p.x, y: p.y })),
      ...DEFAULT_POLYGON_STYLE,
    };
    addItem(floorId, polygon);
    return polygon.id;
  };

  /* ---- 階層 ---- */

  const setBackground = (floorId: string, bg: Floor['background'] | null): void => {
    const f = findFloor(floorId);
    if (!f) return;
    edit(() => f.set('background', bg ?? null));
  };

  const setScaleRatio = (floorId: string, r: number): void => {
    if (!(r > 0 && Number.isFinite(r))) return;
    const f = findFloor(floorId);
    if (!f) return;
    edit(() => f.set('scaleRatio', r));
  };

  const renameFloor = (floorId: string, name: string): void => {
    const f = findFloor(floorId);
    if (!f || f.get('name') === name) return;
    edit(() => f.set('name', name));
  };

  const addFloor = (): string => {
    const sorted = sortedFloorMaps();
    let maxOrder = -1;
    sorted.forEach((m, i) => {
      const o = m.get('order');
      maxOrder = Math.max(maxOrder, typeof o === 'number' ? o : i);
    });
    const floor: Floor = {
      id: genId('floor'),
      name: `${sorted.length + 1}F`,
      scaleRatio: INITIAL_SCALE_RATIO,
      placed: [],
    };
    edit(() => floors.push([floorToYMap(floor, maxOrder + 1)]));
    return floor.id;
  };

  const removeFloor = (floorId: string): void => {
    if (floors.length <= 1) return; // 最低 1 階層を維持
    const idx = floors.toArray().findIndex((m) => m.get('id') === floorId);
    if (idx < 0) return;
    edit(() => floors.delete(idx, 1));
  };

  const moveFloor = (floorId: string, dir: -1 | 1): void => {
    const sorted = sortedFloorMaps();
    const idx = sorted.findIndex((m) => m.get('id') === floorId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= sorted.length) return;
    const next = [...sorted];
    [next[idx], next[target]] = [next[target], next[idx]];
    // 階層を作り直さず、表示順 order だけを書き換える（変わる階層だけ書く）。
    // 作り直すと、取り消したときにその間の他の参加者の編集が失われる（§14.5）。
    edit(() => {
      next.forEach((m, i) => {
        if (m.get('order') !== i) m.set('order', i);
      });
    });
  };

  const clearFloor = (floorId: string): void => {
    const f = findFloor(floorId);
    if (!f) return;
    const arr = f.get('placed') as Y.Array<YMapU> | undefined;
    edit(() => {
      if (arr && arr.length > 0) arr.delete(0, arr.length);
      if (f.get('background') != null) f.set('background', null);
    });
  };

  /* ---- 文書全体 ---- */

  const setResidentTypes = (types: ResidentType[]): void => {
    const validIds = new Set(types.map((t) => t.id));
    edit(() => {
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

  const setZoneList = (zoneList: ZoneList, zoneListName: string): void => {
    system(() => {
      meta.set('zoneList', zoneList);
      meta.set('zoneListName', zoneListName);
    });
  };

  const replaceZoneListClearPlaced = (zoneList: ZoneList, zoneListName: string): void => {
    system(() => {
      meta.set('zoneList', zoneList);
      meta.set('zoneListName', zoneListName);
      for (const fm of floors.toArray()) {
        const arr = fm.get('placed') as Y.Array<YMapU> | undefined;
        if (arr && arr.length > 0) arr.delete(0, arr.length);
      }
      bumpEpoch();
    });
  };

  /* ---- 元に戻す ---- */

  const getHistoryState = (): HistoryState => ({
    canUndo: undoManager.canUndo(),
    canRedo: undoManager.canRedo(),
  });

  let viewProvider: (() => HistoryView) | null = null;
  const setViewProvider = (provider: (() => HistoryView) | null): void => {
    viewProvider = provider;
  };

  // 履歴が増えたら、その時点の画面の状態を記録し、上限を超えた古い履歴を捨てる。
  // 新しい編集・やり直し → 取り消し用の履歴、取り消し → やり直し用の履歴、のどちらも
  // 「その変更の直前の画面」を記録することになる。まとめられた変更（stack-item-updated）は最初の記録を保つ。
  const onStackItemAdded = (event: { stackItem: { meta: Map<string, unknown> } }): void => {
    if (viewProvider) event.stackItem.meta.set('view', viewProvider());
    const over = undoManager.undoStack.length - HISTORY_LIMIT;
    if (over > 0) undoManager.undoStack.splice(0, over);
  };
  undoManager.on('stack-item-added', onStackItemAdded);

  const viewOf = (item: { meta: Map<string, unknown> } | null): UndoResult | null =>
    item ? { view: (item.meta.get('view') as HistoryView | undefined) ?? null } : null;

  const HISTORY_EVENTS = ['stack-item-added', 'stack-item-popped', 'stack-cleared'] as const;

  const onHistoryChange = (cb: (state: HistoryState) => void): (() => void) => {
    // 取り消し 1 回で popped と（やり直し側への）added が続けて来るため、変化したときだけ通知する
    let last = getHistoryState();
    const handler = (): void => {
      const next = getHistoryState();
      if (next.canUndo === last.canUndo && next.canRedo === last.canRedo) return;
      last = next;
      cb(next);
    };
    for (const ev of HISTORY_EVENTS) undoManager.on(ev, handler);
    return () => {
      for (const ev of HISTORY_EVENTS) undoManager.off(ev, handler);
    };
  };

  const undo = (): UndoResult | null => {
    const item = undoManager.undo();
    undoManager.stopCapturing();
    lastMergeTarget = null;
    return viewOf(item);
  };

  const redo = (): UndoResult | null => {
    const item = undoManager.redo();
    undoManager.stopCapturing();
    lastMergeTarget = null;
    return viewOf(item);
  };

  const clearHistory = (): void => undoManager.clear();
  const stopCapturing = (): void => {
    undoManager.stopCapturing();
    lastMergeTarget = null;
  };

  const destroy = (): void => {
    meta.unobserve(onMetaChange);
    undoManager.destroy();
    doc.destroy();
  };

  return {
    doc,
    getSnapshot,
    onChange,
    isInitialized,
    seedIfEmpty,
    replaceDocument,
    updatePlaced,
    updatePlacedMany,
    setZoneResidents,
    addItem,
    addItems,
    removeItem,
    removeItems,
    addPlacedZone,
    addText,
    addPolygon,
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
    undo,
    redo,
    setViewProvider,
    getHistoryState,
    onHistoryChange,
    clearHistory,
    stopCapturing,
    destroy,
  };
};
