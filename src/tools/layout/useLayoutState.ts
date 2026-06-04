import { useCallback, useEffect, useState } from 'react';
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
  clearStoredZoneList,
  getStoredLayoutState,
  getStoredZoneList,
  migrateLegacyLayoutState,
  setStoredLayoutState,
  setStoredZoneList,
  type StoredBackground,
} from '../../shared/storage.ts';
import type { Point } from './types.ts';

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
  residentTypes: ResidentType[];
  /* ---- ビュー / UI 状態 ---- */
  viewScale: number;
  stagePos: Point;
  selectedId: string | null;
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
  setSelectedId: (id: string | null) => void;
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
  /** 居住者種類定義を置き換える（編集モーダルからの保存）。削除された種類の人数も全階層の区画から除去する。 */
  setResidentTypes: (types: ResidentType[]) => void;
  /** 指定した配置済み区画の居住者人数を設定する。 */
  setZoneResidents: (id: string, residents: Record<string, number>) => void;
  removePlaced: (id: string) => void;
  clearPlaced: () => void;
  clearAll: () => void;
  replaceZoneList: (list: ZoneList) => void;
  /** 区画リストをデフォルトに戻す（全階層の配置済みもクリア、共有 IndexedDB もクリア） */
  resetZoneListToDefault: () => void;
  /** 共有区画リストを保存し、レイアウトの参照リスト名も追従させる（設計書 §8.2）。 */
  saveZoneListAs: (name: string) => void;
  loadLayout: (layout: LayoutFile) => void;
  buildLayoutFile: () => LayoutFile;
};

export const useLayoutState = (): LayoutState & LayoutActions => {
  const [floors, setFloors] = useState<Floor[]>(() => [createDefaultFloor()]);
  const [activeFloorId, setActiveFloorId] = useState<string>(() => floors[0].id);
  const [zoneList, setZoneListState] = useState<ZoneList>(DEFAULT_ZONE_LIST);
  const [zoneListName, setZoneListName] = useState<string>(DEFAULT_ZONE_LIST.name);
  const [residentTypes, setResidentTypesState] = useState<ResidentType[]>(DEFAULT_RESIDENT_TYPES);

  const [viewScale, setViewScale] = useState<number>(1);
  const [stagePos, setStagePos] = useState<Point>({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    [mutatePlaced],
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
    [mutatePlaced],
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
    [mutatePlaced],
  );

  const updatePlaced = useCallback(
    (id: string, attrs: Partial<PlacedItem>) => {
      mutatePlaced((prev) =>
        prev.map((p) => (p.id === id ? ({ ...p, ...attrs } as PlacedItem) : p)),
      );
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
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [mutatePlaced],
  );

  const clearPlaced = useCallback(() => {
    mutatePlaced(() => []);
    setSelectedId(null);
  }, [mutatePlaced]);

  const clearAll = useCallback(() => {
    // アクティブ階層の配置物と背景をクリアする
    mutateActiveFloor((f) => ({ ...f, placed: [], background: undefined }));
    setSelectedId(null);
  }, [mutateActiveFloor]);

  /* ---------- 階層操作 ---------- */

  const addFloor = useCallback(() => {
    setFloors((prev) => {
      const newFloor = createDefaultFloor(`${prev.length + 1}F`);
      setActiveFloorId(newFloor.id);
      return [...prev, newFloor];
    });
    setSelectedId(null);
  }, []);

  const removeFloor = useCallback((id: string) => {
    setFloors((prev) => {
      if (prev.length <= 1) return prev; // 最低 1 階層を維持
      const next = prev.filter((f) => f.id !== id);
      setActiveFloorId((cur) => (cur === id ? next[0].id : cur));
      return next;
    });
    setSelectedId(null);
  }, []);

  const renameFloor = useCallback((id: string, name: string) => {
    setFloors((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }, []);

  const setActiveFloor = useCallback((id: string) => {
    setActiveFloorId(id);
    setSelectedId(null);
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
    void setStoredZoneList(list);
    // 区画タイプが変わるため全階層の配置物をクリア
    setFloors((prev) => prev.map((f) => ({ ...f, placed: [] })));
    setSelectedId(null);
  }, []);

  const resetZoneListToDefault = useCallback(() => {
    setZoneListState(DEFAULT_ZONE_LIST);
    setZoneListName(DEFAULT_ZONE_LIST.name);
    void clearStoredZoneList();
    setFloors((prev) => prev.map((f) => ({ ...f, placed: [] })));
    setSelectedId(null);
  }, []);

  const saveZoneListAs = useCallback(
    (name: string) => {
      const named: ZoneList = { ...zoneList, name };
      setZoneListState(named);
      setZoneListName(name);
      void setStoredZoneList(named);
    },
    [zoneList],
  );

  /* ---------- レイアウト読み書き ---------- */

  const loadLayout = useCallback((layout: LayoutFile) => {
    setZoneListState(layout.zoneList);
    setZoneListName(layout.zoneListName);
    void setStoredZoneList(layout.zoneList);
    setResidentTypesState(layout.residentTypes);
    const loadedFloors = layout.floors.length > 0 ? layout.floors : [createDefaultFloor()];
    setFloors(loadedFloors);
    setActiveFloorId(loadedFloors[0].id);
    setSelectedId(null);
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
    residentTypes,
    viewScale,
    stagePos,
    selectedId,
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
    setResidentTypes,
    setZoneResidents,
    removePlaced,
    clearPlaced,
    clearAll,
    replaceZoneList,
    resetZoneListToDefault,
    saveZoneListAs,
    loadLayout,
    buildLayoutFile,
  };
};
