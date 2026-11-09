import { useCallback, useEffect, useState } from 'react';
import { persistPresetAsShared, type ZoneListPresetId } from '../../shared/zoneListPresets.ts';
import {
  DEFAULT_POLYGON_STYLE,
  DEFAULT_RESIDENT_TYPES,
  DEFAULT_ZONE_LIST,
  INITIAL_SCALE_RATIO,
} from '../../shared/constants.ts';
import type {
  Floor,
  LayoutFile,
  PlacedItem,
  PlacedZone,
  PolygonZone,
  ResidentType,
  TextBlock,
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
import type { Point } from './types.ts';

const EMPTY_SELECTION: { ids: string[]; innerZoneId: string | null } = { ids: [], innerZoneId: null };

const genId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const createDefaultFloor = (name = '1F'): Floor => ({
  id: genId('floor'),
  name,
  scaleRatio: INITIAL_SCALE_RATIO,
  placed: [],
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
  /** ゾーン（多角形）を追加する。points はメートル座標、3 点以上。 */
  addPolygon: (points: Point[]) => void;
  addPlacedZone: (typeId: string, xMeters: number, yMeters: number) => void;
  addText: (xMeters: number, yMeters: number, text: string, fontSize: number, color: string) => void;
  updatePlaced: (id: string, attrs: Partial<PlacedItem>) => void;
  /** 複数配置物をまとめて更新する（一括移動）。 */
  updatePlacedMany: (updates: { id: string; attrs: Partial<PlacedItem> }[]) => void;
  /** 配置物をまとめて追加する（貼り付け）。選択は呼び出し側で設定する。 */
  addItems: (items: PlacedItem[]) => void;
  /** 居住者種類定義を置き換える（編集モーダルからの保存）。削除された種類の人数も全階層の区画から除去する。 */
  setResidentTypes: (types: ResidentType[]) => void;
  /** 指定した配置済み区画の居住者人数を設定する。 */
  setZoneResidents: (id: string, residents: Record<string, number>) => void;
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

export const useLayoutState = (): LayoutState & LayoutActions => {
  const [floors, setFloors] = useState<Floor[]>(() => [createDefaultFloor()]);
  const [activeFloorId, setActiveFloorId] = useState<string>(() => floors[0].id);
  const [zoneList, setZoneListState] = useState<ZoneList>(DEFAULT_ZONE_LIST);
  const [zoneListName, setZoneListName] = useState<string>(DEFAULT_ZONE_LIST.name);
  const [zoneListDirty, setZoneListDirty] = useState<boolean>(false);
  const [residentTypes, setResidentTypesState] = useState<ResidentType[]>(DEFAULT_RESIDENT_TYPES);

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

  // 初回ハイドレーション完了まで永続化を抑止し、初期空状態での上書きを防ぐ
  const [hydrated, setHydrated] = useState<boolean>(false);

  /* ---------- 派生値（アクティブ階層） ---------- */
  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? floors[0];
  const scaleRatio = activeFloor.scaleRatio;
  const background = activeFloor.background ?? null;
  const placed = activeFloor.placed;

  /* ---------- マウント時の読み込み ---------- */
  useEffect(() => {
    void (async () => {
      const list = await getStoredZoneList();
      if (list) {
        setZoneListState(list);
        setZoneListName((cur) => (cur === DEFAULT_ZONE_LIST.name ? list.name : cur));
      }
      const stored = (await getStoredLayoutState()) ?? (await migrateLegacyLayoutState());
      if (stored && stored.floors.length > 0) {
        setFloors(stored.floors);
        setActiveFloorId(stored.activeFloorId || stored.floors[0].id);
        setResidentTypesState(stored.residentTypes);
        setZoneListName(stored.zoneListName);
      }
      setHydrated(true);
    })();
  }, []);

  /* ---------- 永続化（ハイドレーション後のみ。背景 base64 を含むため debounce） ---------- */
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      void setStoredLayoutState({ floors, activeFloorId, residentTypes, zoneListName });
    }, 400);
    return () => clearTimeout(t);
  }, [hydrated, floors, activeFloorId, residentTypes, zoneListName]);

  /* ---------- アクティブ階層を更新するヘルパー ---------- */
  const mutateActiveFloor = useCallback(
    (updater: (f: Floor) => Floor) => {
      setFloors((prev) => prev.map((f) => (f.id === activeFloorId ? updater(f) : f)));
    },
    [activeFloorId],
  );

  const mutatePlaced = useCallback(
    (updater: (placed: PlacedItem[]) => PlacedItem[]) => {
      mutateActiveFloor((f) => ({ ...f, placed: updater(f.placed) }));
    },
    [mutateActiveFloor],
  );

  /* ---------- 個別アクション ---------- */

  const setBackground = useCallback(
    (bg: StoredBackground | null) => {
      mutateActiveFloor((f) => {
        const next: Floor = { ...f };
        if (bg) next.background = bg;
        else delete next.background;
        return next;
      });
    },
    [mutateActiveFloor],
  );

  const setScaleRatio = useCallback(
    (r: number) => {
      if (r > 0 && Number.isFinite(r)) mutateActiveFloor((f) => ({ ...f, scaleRatio: r }));
    },
    [mutateActiveFloor],
  );

  const addPlacedZone = useCallback(
    (typeId: string, xMeters: number, yMeters: number) => {
      const newZone: PlacedZone = {
        kind: 'zone',
        id: genId('zone'),
        typeId,
        x: xMeters,
        y: yMeters,
        rotation: 0,
      };
      mutatePlaced((prev) => [...prev, newZone]);
      setSelectedId(newZone.id);
    },
    [mutatePlaced, setSelectedId],
  );

  const addText = useCallback(
    (xMeters: number, yMeters: number, text: string, fontSize: number, color: string) => {
      const newText: TextBlock = {
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
      mutatePlaced((prev) => [...prev, newText]);
      setSelectedId(newText.id);
    },
    [mutatePlaced, setSelectedId],
  );

  const addPolygon = useCallback(
    (points: Point[]) => {
      if (points.length < 3) return;
      const newPolygon: PolygonZone = {
        kind: 'polygon',
        id: genId('polygon'),
        points: points.map((p) => ({ x: p.x, y: p.y })),
        ...DEFAULT_POLYGON_STYLE,
      };
      mutatePlaced((prev) => [...prev, newPolygon]);
      setSelectedId(newPolygon.id);
    },
    [mutatePlaced, setSelectedId],
  );

  const updatePlaced = useCallback(
    (id: string, attrs: Partial<PlacedItem>) => {
      mutatePlaced((prev) =>
        prev.map((p) => (p.id === id ? ({ ...p, ...attrs } as PlacedItem) : p)),
      );
    },
    [mutatePlaced],
  );

  const updatePlacedMany = useCallback(
    (updates: { id: string; attrs: Partial<PlacedItem> }[]) => {
      if (updates.length === 0) return;
      const byId = new Map(updates.map((u) => [u.id, u.attrs]));
      mutatePlaced((prev) =>
        prev.map((p) => {
          const attrs = byId.get(p.id);
          return attrs ? ({ ...p, ...attrs } as PlacedItem) : p;
        }),
      );
    },
    [mutatePlaced],
  );

  const addItems = useCallback(
    (items: PlacedItem[]) => {
      if (items.length === 0) return;
      mutatePlaced((prev) => [...prev, ...items]);
    },
    [mutatePlaced],
  );

  const setResidentTypes = useCallback((types: ResidentType[]) => {
    setResidentTypesState(types);
    // 削除された種類の人数を全階層の配置済み区画から除去する
    const validIds = new Set(types.map((t) => t.id));
    setFloors((prev) =>
      prev.map((f) => ({
        ...f,
        placed: f.placed.map((p) => {
          if (p.kind !== 'zone' || !p.residents) return p;
          const filtered: Record<string, number> = {};
          let changed = false;
          for (const [typeId, n] of Object.entries(p.residents)) {
            if (validIds.has(typeId)) filtered[typeId] = n;
            else changed = true;
          }
          if (!changed) return p;
          const next: PlacedZone = { ...p };
          if (Object.keys(filtered).length > 0) next.residents = filtered;
          else delete next.residents;
          return next;
        }),
      })),
    );
  }, []);

  const setZoneResidents = useCallback(
    (id: string, residents: Record<string, number>) => {
      const cleaned: Record<string, number> = {};
      for (const [typeId, n] of Object.entries(residents)) {
        if (n > 0) cleaned[typeId] = n;
      }
      mutatePlaced((prev) =>
        prev.map((p) => {
          if (p.id !== id || p.kind !== 'zone') return p;
          const next: PlacedZone = { ...p };
          if (Object.keys(cleaned).length > 0) next.residents = cleaned;
          else delete next.residents;
          return next;
        }),
      );
    },
    [mutatePlaced],
  );

  const removePlaced = useCallback(
    (id: string) => {
      mutatePlaced((prev) => prev.filter((p) => p.id !== id));
      dropFromSelection([id]);
    },
    [mutatePlaced, dropFromSelection],
  );

  const removePlacedMany = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const drop = new Set(ids);
      mutatePlaced((prev) => prev.filter((p) => !drop.has(p.id)));
      dropFromSelection(ids);
    },
    [mutatePlaced, dropFromSelection],
  );

  const clearPlaced = useCallback(() => {
    mutatePlaced(() => []);
    setSelectionState(EMPTY_SELECTION);
  }, [mutatePlaced]);

  const clearAll = useCallback(() => {
    // アクティブ階層の配置物と背景をクリアする
    mutateActiveFloor((f) => ({ ...f, placed: [], background: undefined }));
    setSelectionState(EMPTY_SELECTION);
  }, [mutateActiveFloor]);

  /* ---------- 階層操作 ---------- */

  const addFloor = useCallback(() => {
    setFloors((prev) => {
      const newFloor = createDefaultFloor(`${prev.length + 1}F`);
      setActiveFloorId(newFloor.id);
      return [...prev, newFloor];
    });
    setSelectionState(EMPTY_SELECTION);
  }, []);

  const removeFloor = useCallback((id: string) => {
    setFloors((prev) => {
      if (prev.length <= 1) return prev; // 最低 1 階層を維持
      const next = prev.filter((f) => f.id !== id);
      setActiveFloorId((cur) => (cur === id ? next[0].id : cur));
      return next;
    });
    setSelectionState(EMPTY_SELECTION);
  }, []);

  const renameFloor = useCallback((id: string, name: string) => {
    setFloors((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }, []);

  const setActiveFloor = useCallback((id: string) => {
    setActiveFloorId(id);
    setSelectionState(EMPTY_SELECTION);
  }, []);

  const moveFloor = useCallback((id: string, dir: -1 | 1) => {
    setFloors((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  /* ---------- 区画リスト ---------- */

  const replaceZoneList = useCallback((list: ZoneList) => {
    setZoneListState(list);
    setZoneListName(list.name);
    setZoneListDirty(false);
    void setStoredZoneList(list);
    // 区画タイプが変わるため全階層の配置物をクリア
    setFloors((prev) => prev.map((f) => ({ ...f, placed: [] })));
    setSelectionState(EMPTY_SELECTION);
  }, []);

  const resetZoneListToDefault = useCallback(
    (list: ZoneList = DEFAULT_ZONE_LIST, presetId: ZoneListPresetId = 'standard') => {
    setZoneListState(list);
    setZoneListName(list.name);
    setZoneListDirty(false);
    void persistPresetAsShared(presetId, list);
    setFloors((prev) => prev.map((f) => ({ ...f, placed: [] })));
    setSelectionState(EMPTY_SELECTION);
  },
    [],
  );

  // モーダル区画エディタの編集を適用（パレット反映）。配置物はクリアしない。
  const applyZoneListEdits = useCallback((list: ZoneList) => {
    setZoneListState(list);
    setZoneListName(list.name);
    setZoneListDirty(true);
  }, []);

  const saveSharedZoneList = useCallback((list: ZoneList) => {
    setZoneListState(list);
    setZoneListName(list.name);
    void setStoredZoneList(list);
    setZoneListDirty(false);
  }, []);

  const markZoneListSaved = useCallback(() => {
    void setStoredZoneList(zoneList);
    setZoneListDirty(false);
  }, [zoneList]);

  /* ---------- レイアウト読み書き ---------- */

  const loadLayout = useCallback((layout: LayoutFile) => {
    setZoneListState(layout.zoneList);
    setZoneListName(layout.zoneListName);
    setZoneListDirty(false);
    void setStoredZoneList(layout.zoneList);
    setResidentTypesState(layout.residentTypes);
    const loadedFloors = layout.floors.length > 0 ? layout.floors : [createDefaultFloor()];
    setFloors(loadedFloors);
    setActiveFloorId(loadedFloors[0].id);
    setSelectionState(EMPTY_SELECTION);
    setViewScale(1);
    setStagePos({ x: 0, y: 0 });
    // 旧 IndexedDB の単一背景キーは使わないため掃除
    void clearStoredBackground();
  }, []);

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
  };
};
