/**
 * 避難所レイアウト画面の状態と操作。設計書 §8 / §10 / §14.4。
 *
 * - レイアウト文書（全階層・区画リスト・居住者種類）は `LayoutDoc`（Yjs）が正本。
 *   スタンドアロン版・Pages 版・マルチ操作版で同じ操作を使う（v2.8.0 で 1 系統に統一）。
 * - 画面の状態（表示中の階層・選択・ビュー・各種モード・区画リストの未保存フラグ）は React 側で持つ。
 * - スタンドアロン版・Pages 版は IndexedDB の自動復元（`state-v2`）から文書を作り、変更を 400ms 遅延で保存する。
 *   マルチ操作版は保存データをホストの初期シードにだけ使い、共有文書は保存しない（従来どおり）。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { persistPresetAsShared, type ZoneListPresetId } from '../../shared/zoneListPresets.ts';
import {
  DEFAULT_RESIDENT_TYPES,
  DEFAULT_ZONE_LIST,
  INITIAL_SCALE_RATIO,
} from '../../shared/constants.ts';
import type { LayoutSnapshot } from '../../shared/layoutDoc.ts';
import { genId } from '../../shared/layoutDoc.ts';
import type {
  Floor,
  LayoutFile,
  PlacedItem,
  ResidentType,
  ZoneList,
} from '../../shared/types.ts';
import {
  clearStoredBackground,
  getStoredLayoutState,
  getStoredZoneList,
  migrateLegacyLayoutState,
  setStoredLayoutState,
  setStoredZoneList,
  type StoredBackground,
} from '../../shared/storage.ts';
import { COLLAB_ENABLED } from '../../collab/flag.ts';
import { useCollabConnection, type CollabConnection } from '../../collab/useCollabConnection.ts';
import type {
  EditOptions,
  HistoryState,
  HistoryView,
  UndoResult,
} from '../../shared/layoutDoc.ts';
import { useLayoutDocument } from './useLayoutDocument.ts';
import type { Point } from './types.ts';

/** 階層が無いときの配置物（毎回新しい配列を作らないための定数）。 */
const NO_PLACED: PlacedItem[] = [];

const EMPTY_SELECTION: { ids: string[]; innerZoneId: string | null } = { ids: [], innerZoneId: null };

const createDefaultFloor = (name = '1F'): Floor => ({
  id: genId('floor'),
  name,
  scaleRatio: INITIAL_SCALE_RATIO,
  placed: [],
});

const createDefaultSnapshot = (): LayoutSnapshot => ({
  floors: [createDefaultFloor()],
  zoneList: DEFAULT_ZONE_LIST,
  zoneListName: DEFAULT_ZONE_LIST.name,
  residentTypes: DEFAULT_RESIDENT_TYPES,
});

export type LayoutState = {
  /** 全階層 */
  floors: Floor[];
  activeFloorId: string;
  /* ---- 以下はアクティブ階層の値（互換のため展開） ---- */
  background: StoredBackground | null;
  scaleRatio: number; // px / m
  placed: PlacedItem[];
  /* ---- レイアウト全体の値 ---- */
  zoneList: ZoneList;
  zoneListName: string;
  /** 区画リストを編集したが共有リストへ保存していない場合 true（離脱警告に使用）。 */
  zoneListDirty: boolean;
  residentTypes: ResidentType[];
  /* ---- ビュー / UI 状態 ---- */
  viewScale: number;
  stagePos: Point;
  /**
   * 代表の選択 ID。1 件選択中はその ID、ゾーン内選択中はゾーンの ID、複数選択中・未選択は null。
   * 人数パネル・ゾーンパネル等「単体選択」を前提とする UI はこれを見る。
   */
  selectedId: string | null;
  /** 選択中の配置物 ID 全件（ゾーン内選択中はゾーン自身＋内部の区画）。 */
  selectedIds: string[];
  /** ゾーン内選択中のゾーン ID。ゾーン内選択でなければ null。 */
  innerZoneId: string | null;
  isScaleMode: boolean;
  scalePoints: Point[]; // world-px coords for scale calibration markers
  isAddingText: boolean; // テキスト配置モード（ボタン → クリックで配置）
  isAddingPolygon: boolean; // ゾーン作図モード（クリックで頂点追加）
  showZones: boolean; // ゾーン表示の ON/OFF（全ゾーン一括）
};

export type LayoutActions = {
  setBackground: (bg: StoredBackground | null) => void;
  setScaleRatio: (r: number) => void;
  setViewScale: (s: number) => void;
  setStagePos: (p: Point) => void;
  /** 単体選択にする（null で選択解除）。 */
  setSelectedId: (id: string | null) => void;
  /** 選択を丸ごと設定する。innerZoneId を渡すとゾーン内選択になる（ids にゾーン自身も含める）。 */
  setSelection: (ids: string[], innerZoneId?: string | null) => void;
  setIsScaleMode: (m: boolean) => void;
  setScalePoints: (p: Point[]) => void;
  setIsAddingText: (v: boolean) => void;
  setIsAddingPolygon: (v: boolean) => void;
  setShowZones: (v: boolean) => void;
  /* ---- 階層操作 ---- */
  addFloor: () => void;
  removeFloor: (id: string) => void;
  renameFloor: (id: string, name: string) => void;
  setActiveFloor: (id: string) => void;
  moveFloor: (id: string, dir: -1 | 1) => void;
  /* ---- 配置物（アクティブ階層） ---- */
  /** ゾーン（多角形）を追加して選択し、その ID を返す。points はメートル座標、3 点以上（未満なら null）。 */
  addPolygon: (points: Point[]) => string | null;
  addPlacedZone: (typeId: string, xMeters: number, yMeters: number) => void;
  addText: (xMeters: number, yMeters: number, text: string, fontSize: number, color: string) => void;
  /** 配置物を更新する。細かく続く入力（ゾーンの見た目など）は opts.merge で 1 件の履歴にまとめる。 */
  updatePlaced: (id: string, attrs: Partial<PlacedItem>, opts?: EditOptions) => void;
  /** 複数配置物をまとめて更新する（一括移動）。 */
  updatePlacedMany: (updates: { id: string; attrs: Partial<PlacedItem> }[]) => void;
  /** 配置物をまとめて追加する（貼り付け）。選択は呼び出し側で設定する。 */
  addItems: (items: PlacedItem[]) => void;
  /** 居住者種類定義を置き換える（編集モーダルからの保存）。削除された種類の人数も全階層の区画から除去する。 */
  setResidentTypes: (types: ResidentType[]) => void;
  /** 指定した配置済み区画の居住者人数を設定する。人数入力は opts.merge で 1 件の履歴にまとめる。 */
  setZoneResidents: (id: string, residents: Record<string, number>, opts?: EditOptions) => void;
  /** 自分の直前の操作を取り消し、その時点の階層・選択に戻す。戻したら true。 */
  undo: () => boolean;
  /** 取り消した操作をやり直す。やり直したら true。 */
  redo: () => boolean;
  removePlaced: (id: string) => void;
  /** 複数配置物をまとめて削除する。 */
  removePlacedMany: (ids: string[]) => void;
  clearPlaced: () => void;
  clearAll: () => void;
  replaceZoneList: (list: ZoneList) => void;
  /** 区画リストをデフォルトに戻す（全階層の配置済みもクリア、共有 IndexedDB もクリア） */
  /** 区画リストを既定（プリセット）に戻す。省略時は標準区画リスト。 */
  resetZoneListToDefault: (list?: ZoneList, presetId?: ZoneListPresetId) => void;
  /** モーダル区画エディタの編集をレイアウトへ適用（パレット反映）。共有には未保存（dirty）にする。設計書 §8.2。 */
  applyZoneListEdits: (list: ZoneList) => void;
  /** モーダル区画エディタの編集をレイアウトへ適用し、共有区画リストへ保存（dirty 解除）。 */
  saveSharedZoneList: (list: ZoneList) => void;
  /** 現在の区画リストを共有 IndexedDB へ保存し dirty を解除（離脱警告の「保存」用）。 */
  markZoneListSaved: () => void;
  loadLayout: (layout: LayoutFile) => void;
  buildLayoutFile: () => LayoutFile;
};


/** 文書の外側の情報（マルチ操作の接続・元に戻すの状態）。 */
export type LayoutDocumentInfo = {
  collab: CollabConnection;
  history: HistoryState;
};

export const useLayoutState = (): LayoutState & LayoutActions & LayoutDocumentInfo => {
  const { doc, snapshot, history } = useLayoutDocument();

  /* ---------- 端末の保存データ（起動時に 1 回読む） ---------- */
  // スタンドアロン版はこれで文書を作り、マルチ操作版はホストの初期シードに使う。
  const [seed, setSeed] = useState<LayoutSnapshot | null>(null);
  // 読み込み前・接続前に表示する既定値（ID を固定するため 1 回だけ作る）
  const [fallback] = useState<LayoutSnapshot>(createDefaultSnapshot);
  const [activeFloorIdState, setActiveFloorId] = useState<string>(() => fallback.floors[0].id);
  const [zoneListDirty, setZoneListDirty] = useState<boolean>(false);

  const collab = useCollabConnection(doc, seed);

  /** 文書を表示・編集できる状態か（スタンドアロン版は読み込み後、マルチ操作版は接続後）。 */
  const docReady = COLLAB_ENABLED ? collab.ready : seed !== null;
  /** 編集先の文書。準備前は null（接続前の空の文書へ書き込まないため）。 */
  const live = docReady ? doc : null;
  const view: LayoutSnapshot = docReady ? snapshot : (seed ?? fallback);

  const floors = view.floors;
  const zoneList = view.zoneList ?? DEFAULT_ZONE_LIST;
  const zoneListName = view.zoneListName ?? zoneList.name;
  const residentTypes = view.residentTypes ?? DEFAULT_RESIDENT_TYPES;

  /* ---------- 派生値（アクティブ階層） ---------- */
  // 表示中の階層が無くなった（削除・読込・他ユーザーの操作）ときは先頭の階層にする
  const activeFloor: Floor | undefined = floors.find((f) => f.id === activeFloorIdState) ?? floors[0];
  const activeFloorId = activeFloor?.id ?? activeFloorIdState;
  const scaleRatio = activeFloor?.scaleRatio ?? INITIAL_SCALE_RATIO;
  const background = activeFloor?.background ?? null;
  const placed = activeFloor?.placed ?? NO_PLACED;

  /* ---------- ビュー・選択・モード ---------- */
  const [viewScale, setViewScale] = useState<number>(1);
  const [stagePos, setStagePos] = useState<Point>({ x: 0, y: 0 });
  const [selection, setSelectionState] = useState<{ ids: string[]; innerZoneId: string | null }>({
    ids: [],
    innerZoneId: null,
  });
  const selectedIds = selection.ids;
  const innerZoneId = selection.innerZoneId;
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : innerZoneId;

  const setSelectedId = useCallback((id: string | null) => {
    setSelectionState({ ids: id ? [id] : [], innerZoneId: null });
  }, []);

  const setSelection = useCallback((ids: string[], inner: string | null = null) => {
    setSelectionState({ ids: [...new Set(ids)], innerZoneId: inner });
  }, []);

  /** 指定 ID を選択から外す（削除時）。ゾーン内選択のゾーンが消えたら通常の選択に戻す。 */
  const dropFromSelection = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    setSelectionState((cur) => {
      if (!cur.ids.some((id) => drop.has(id))) return cur;
      return {
        ids: cur.ids.filter((id) => !drop.has(id)),
        innerZoneId: cur.innerZoneId && drop.has(cur.innerZoneId) ? null : cur.innerZoneId,
      };
    });
  }, []);
  const [isScaleMode, setIsScaleMode] = useState<boolean>(false);
  const [scalePoints, setScalePoints] = useState<Point[]>([]);
  const [isAddingText, setIsAddingText] = useState<boolean>(false);
  const [isAddingPolygon, setIsAddingPolygon] = useState<boolean>(false);
  const [showZones, setShowZones] = useState<boolean>(true);

  /* ---------- マウント時の読み込み ---------- */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await getStoredZoneList();
      const stored = (await getStoredLayoutState()) ?? (await migrateLegacyLayoutState());
      if (cancelled) return;
      const zl = list ?? DEFAULT_ZONE_LIST;
      const loaded: LayoutSnapshot =
        stored && stored.floors.length > 0
          ? {
              floors: stored.floors,
              zoneList: zl,
              zoneListName: stored.zoneListName,
              residentTypes: stored.residentTypes,
            }
          : { ...fallback, zoneList: zl, zoneListName: zl.name };
      if (stored && stored.floors.length > 0) {
        setActiveFloorId(stored.activeFloorId || stored.floors[0].id);
      }
      // 起動時の復元は元に戻すの対象外（replaceDocument は履歴に入れない）
      if (!COLLAB_ENABLED) doc.replaceDocument(loaded);
      setSeed(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, fallback]);

  /* ---------- 永続化（スタンドアロン版のみ。背景 base64 を含むため debounce） ---------- */
  useEffect(() => {
    if (COLLAB_ENABLED || !docReady) return;
    const t = setTimeout(() => {
      void setStoredLayoutState({ floors, activeFloorId, residentTypes, zoneListName });
    }, 400);
    return () => clearTimeout(t);
  }, [docReady, floors, activeFloorId, residentTypes, zoneListName]);

  /* ---------- 個別アクション（アクティブ階層） ---------- */

  const setBackground = useCallback(
    (bg: StoredBackground | null) => live?.setBackground(activeFloorId, bg),
    [live, activeFloorId],
  );

  const setScaleRatio = useCallback(
    (r: number) => live?.setScaleRatio(activeFloorId, r),
    [live, activeFloorId],
  );

  const addPlacedZone = useCallback(
    (typeId: string, xMeters: number, yMeters: number) => {
      if (!live) return;
      setSelectedId(live.addPlacedZone(activeFloorId, typeId, xMeters, yMeters));
    },
    [live, activeFloorId, setSelectedId],
  );

  const addText = useCallback(
    (xMeters: number, yMeters: number, text: string, fontSize: number, color: string) => {
      if (!live) return;
      setSelectedId(live.addText(activeFloorId, xMeters, yMeters, text, fontSize, color));
    },
    [live, activeFloorId, setSelectedId],
  );

  const addPolygon = useCallback(
    (points: Point[]): string | null => {
      const id = live?.addPolygon(activeFloorId, points) ?? null;
      if (id) setSelectedId(id);
      return id;
    },
    [live, activeFloorId, setSelectedId],
  );

  const updatePlaced = useCallback(
    (id: string, attrs: Partial<PlacedItem>, opts?: EditOptions) =>
      live?.updatePlaced(activeFloorId, id, attrs, opts),
    [live, activeFloorId],
  );

  const updatePlacedMany = useCallback(
    (updates: { id: string; attrs: Partial<PlacedItem> }[]) =>
      live?.updatePlacedMany(activeFloorId, updates),
    [live, activeFloorId],
  );

  const addItems = useCallback(
    (items: PlacedItem[]) => live?.addItems(activeFloorId, items),
    [live, activeFloorId],
  );

  const setResidentTypes = useCallback(
    (types: ResidentType[]) => live?.setResidentTypes(types),
    [live],
  );

  const setZoneResidents = useCallback(
    (id: string, residents: Record<string, number>, opts?: EditOptions) =>
      live?.setZoneResidents(activeFloorId, id, residents, opts),
    [live, activeFloorId],
  );

  /* ---------- 元に戻す・やり直し（§14.5） ---------- */

  // 履歴 1 件ごとに「その操作の直前の階層と選択」を記録する。操作は描画後のイベントで起きるため、
  // 描画が確定するたびに最新の値を入れておけば、記録の時点では操作前の画面になる。
  const viewRef = useRef<HistoryView>({ floorId: activeFloorId, selectedIds, innerZoneId });
  useLayoutEffect(() => {
    viewRef.current = { floorId: activeFloorId, selectedIds, innerZoneId };
  }, [activeFloorId, selectedIds, innerZoneId]);
  useEffect(() => {
    doc.setViewProvider(() => viewRef.current);
    return () => doc.setViewProvider(null);
  }, [doc]);

  /** 取り消し・やり直しのあと、記録した階層に切り替えて選び直す（無くなった ID は LayoutPage の掃除で外れる）。 */
  const applyUndoResult = useCallback((result: UndoResult | null): boolean => {
    if (!result) return false;
    if (result.view) {
      setActiveFloorId(result.view.floorId);
      setSelectionState({ ids: result.view.selectedIds, innerZoneId: result.view.innerZoneId });
    }
    return true;
  }, []);

  const undo = useCallback(
    (): boolean => (live ? applyUndoResult(live.undo()) : false),
    [live, applyUndoResult],
  );

  const redo = useCallback(
    (): boolean => (live ? applyUndoResult(live.redo()) : false),
    [live, applyUndoResult],
  );

  const removePlaced = useCallback(
    (id: string) => {
      live?.removeItem(activeFloorId, id);
      dropFromSelection([id]);
    },
    [live, activeFloorId, dropFromSelection],
  );

  const removePlacedMany = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      live?.removeItems(activeFloorId, ids);
      dropFromSelection(ids);
    },
    [live, activeFloorId, dropFromSelection],
  );

  const clearPlaced = useCallback(() => {
    live?.removeItems(
      activeFloorId,
      placed.map((p) => p.id),
    );
    setSelectionState(EMPTY_SELECTION);
  }, [live, activeFloorId, placed]);

  const clearAll = useCallback(() => {
    // アクティブ階層の配置物と背景をクリアする
    live?.clearFloor(activeFloorId);
    setSelectionState(EMPTY_SELECTION);
  }, [live, activeFloorId]);

  /* ---------- 階層操作 ---------- */

  const addFloor = useCallback(() => {
    if (!live) return;
    setActiveFloorId(live.addFloor());
    setSelectionState(EMPTY_SELECTION);
  }, [live]);

  const removeFloor = useCallback(
    (id: string) => {
      if (!live || floors.length <= 1) return; // 最低 1 階層を維持
      live.removeFloor(id);
      if (activeFloorId === id) {
        const next = floors.find((f) => f.id !== id);
        if (next) setActiveFloorId(next.id);
      }
      setSelectionState(EMPTY_SELECTION);
    },
    [live, floors, activeFloorId],
  );

  const renameFloor = useCallback(
    (id: string, name: string) => live?.renameFloor(id, name),
    [live],
  );

  const setActiveFloor = useCallback((id: string) => {
    setActiveFloorId(id);
    setSelectionState(EMPTY_SELECTION);
  }, []);

  const moveFloor = useCallback(
    (id: string, dir: -1 | 1) => live?.moveFloor(id, dir),
    [live],
  );

  /* ---------- 区画リスト ---------- */

  const replaceZoneList = useCallback(
    (list: ZoneList) => {
      // 区画タイプが変わるため全階層の配置物をクリア（元に戻すの対象外。履歴も消える）
      live?.replaceZoneListClearPlaced(list, list.name);
      setZoneListDirty(false);
      void setStoredZoneList(list);
      setSelectionState(EMPTY_SELECTION);
    },
    [live],
  );

  const resetZoneListToDefault = useCallback(
    (list: ZoneList = DEFAULT_ZONE_LIST, presetId: ZoneListPresetId = 'standard') => {
      live?.replaceZoneListClearPlaced(list, list.name);
      setZoneListDirty(false);
      void persistPresetAsShared(presetId, list);
      setSelectionState(EMPTY_SELECTION);
    },
    [live],
  );

  // モーダル区画エディタの編集を適用（パレット反映）。配置物はクリアしない。
  const applyZoneListEdits = useCallback(
    (list: ZoneList) => {
      live?.setZoneList(list, list.name);
      setZoneListDirty(true);
    },
    [live],
  );

  const saveSharedZoneList = useCallback(
    (list: ZoneList) => {
      live?.setZoneList(list, list.name);
      void setStoredZoneList(list);
      setZoneListDirty(false);
    },
    [live],
  );

  const markZoneListSaved = useCallback(() => {
    void setStoredZoneList(zoneList);
    setZoneListDirty(false);
  }, [zoneList]);

  /* ---------- レイアウト読み書き ---------- */

  const loadLayout = useCallback(
    (layout: LayoutFile) => {
      if (!live) return;
      const loadedFloors = layout.floors.length > 0 ? layout.floors : [createDefaultFloor()];
      live.replaceDocument({
        floors: loadedFloors,
        zoneList: layout.zoneList,
        zoneListName: layout.zoneListName,
        residentTypes: layout.residentTypes,
      });
      setActiveFloorId(loadedFloors[0].id);
      setSelectionState(EMPTY_SELECTION);
      setZoneListDirty(false);
      if (!COLLAB_ENABLED) {
        // 共有区画リスト（IndexedDB）とビューは端末ローカル。マルチ操作版では従来どおり触らない。
        void setStoredZoneList(layout.zoneList);
        setViewScale(1);
        setStagePos({ x: 0, y: 0 });
        // 旧 IndexedDB の単一背景キーは使わないため掃除
        void clearStoredBackground();
      }
    },
    [live],
  );

  const buildLayoutFile = useCallback(
    (): LayoutFile => ({
      version: 2,
      zoneListName,
      residentTypes,
      zoneList,
      floors,
    }),
    [zoneListName, residentTypes, zoneList, floors],
  );

  return {
    floors,
    activeFloorId,
    background,
    scaleRatio,
    placed,
    zoneList,
    zoneListName,
    zoneListDirty,
    residentTypes,
    viewScale,
    stagePos,
    selectedId,
    selectedIds,
    innerZoneId,
    isScaleMode,
    scalePoints,
    isAddingText,
    isAddingPolygon,
    showZones,
    setBackground,
    setScaleRatio,
    setViewScale,
    setStagePos,
    setSelectedId,
    setSelection,
    setIsScaleMode,
    setScalePoints,
    setIsAddingText,
    setIsAddingPolygon,
    setShowZones,
    addFloor,
    removeFloor,
    renameFloor,
    setActiveFloor,
    moveFloor,
    addPolygon,
    addPlacedZone,
    addText,
    updatePlaced,
    updatePlacedMany,
    addItems,
    setResidentTypes,
    setZoneResidents,
    removePlaced,
    removePlacedMany,
    clearPlaced,
    clearAll,
    replaceZoneList,
    resetZoneListToDefault,
    applyZoneListEdits,
    saveSharedZoneList,
    markZoneListSaved,
    loadLayout,
    buildLayoutFile,
    undo,
    redo,
    collab,
    history,
  };
};
