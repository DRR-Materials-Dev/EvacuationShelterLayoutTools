import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_POLYGON_STYLE,
  DEFAULT_RESIDENT_TYPES,
  DEFAULT_ZONE_LIST,
  INITIAL_SCALE_RATIO,
} from '../../shared/constants.ts';
import type {
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
  clearStoredLayoutState,
  clearStoredZoneList,
  getStoredBackground,
  getStoredLayoutState,
  getStoredZoneList,
  setStoredBackground,
  setStoredLayoutState,
  setStoredZoneList,
  type StoredBackground,
} from '../../shared/storage.ts';
import type { Point } from './types.ts';

export type LayoutState = {
  background: StoredBackground | null;
  scaleRatio: number; // px / m
  viewScale: number;
  stagePos: Point;
  zoneList: ZoneList;
  placed: PlacedItem[];
  residentTypes: ResidentType[];
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
  /** ゾーン（多角形）を追加する。points はメートル座標、3 点以上。 */
  addPolygon: (points: Point[]) => void;
  addPlacedZone: (typeId: string, xMeters: number, yMeters: number) => void;
  addText: (xMeters: number, yMeters: number, text: string, fontSize: number, color: string) => void;
  updatePlaced: (id: string, attrs: Partial<PlacedItem>) => void;
  /** 居住者種類定義を置き換える（編集モーダルからの保存）。削除された種類の人数も配置済み区画から除去する。 */
  setResidentTypes: (types: ResidentType[]) => void;
  /** 指定した配置済み区画の居住者人数を設定する。 */
  setZoneResidents: (id: string, residents: Record<string, number>) => void;
  removePlaced: (id: string) => void;
  clearPlaced: () => void;
  clearAll: () => void;
  replaceZoneList: (list: ZoneList) => void;
  /** 区画リストをデフォルトに戻す（配置済みもクリア、共有 IndexedDB もクリア） */
  resetZoneListToDefault: () => void;
  loadLayout: (layout: LayoutFile) => void;
  buildLayoutFile: () => LayoutFile;
};

export const useLayoutState = (): LayoutState & LayoutActions => {
  // 初期値は LocalStorage から（同期）。IndexedDB の値はマウント後に読み込む。
  const storedLayout = getStoredLayoutState();

  const [background, setBackgroundState] = useState<StoredBackground | null>(null);
  const [scaleRatio, setScaleRatioState] = useState<number>(
    storedLayout?.scaleRatio ?? INITIAL_SCALE_RATIO,
  );
  const [viewScale, setViewScale] = useState<number>(1);
  const [stagePos, setStagePos] = useState<Point>({ x: 0, y: 0 });
  const [zoneList, setZoneListState] = useState<ZoneList>(DEFAULT_ZONE_LIST);
  const [placed, setPlaced] = useState<PlacedItem[]>(storedLayout?.placed ?? []);
  const [residentTypes, setResidentTypesState] = useState<ResidentType[]>(
    storedLayout?.residentTypes ?? DEFAULT_RESIDENT_TYPES,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isScaleMode, setIsScaleMode] = useState<boolean>(false);
  const [scalePoints, setScalePoints] = useState<Point[]>([]);
  const [isAddingText, setIsAddingText] = useState<boolean>(false);
  const [isAddingPolygon, setIsAddingPolygon] = useState<boolean>(false);
  const [showZones, setShowZones] = useState<boolean>(true);

  // IndexedDB から非同期に読み込み
  useEffect(() => {
    void getStoredBackground().then((bg) => {
      if (bg) setBackgroundState(bg);
    });
    void getStoredZoneList().then((list) => {
      if (list) setZoneListState(list);
    });
  }, []);

  // 配置済み + 縮尺 + 居住者種類の永続化
  useEffect(() => {
    setStoredLayoutState({ scaleRatio, placed, residentTypes });
  }, [scaleRatio, placed, residentTypes]);

  /* ---------- 個別アクション ---------- */

  const setBackground = useCallback((bg: StoredBackground | null) => {
    setBackgroundState(bg);
    if (bg) {
      void setStoredBackground(bg);
    } else {
      void clearStoredBackground();
    }
  }, []);

  const setScaleRatio = useCallback((r: number) => {
    if (r > 0 && Number.isFinite(r)) setScaleRatioState(r);
  }, []);

  const addPlacedZone = useCallback(
    (typeId: string, xMeters: number, yMeters: number) => {
      setPlaced((prev) => {
        const newZone: PlacedZone = {
          kind: 'zone',
          id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          typeId,
          x: xMeters,
          y: yMeters,
          rotation: 0,
        };
        const next = [...prev, newZone];
        setSelectedId(newZone.id);
        return next;
      });
    },
    [],
  );

  const addText = useCallback(
    (xMeters: number, yMeters: number, text: string, fontSize: number, color: string) => {
      setPlaced((prev) => {
        const newText: TextBlock = {
          kind: 'text',
          id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text,
          x: xMeters,
          y: yMeters,
          fontSize,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          color,
        };
        setSelectedId(newText.id);
        return [...prev, newText];
      });
    },
    [],
  );

  const addPolygon = useCallback((points: Point[]) => {
    if (points.length < 3) return;
    setPlaced((prev) => {
      const newPolygon: PolygonZone = {
        kind: 'polygon',
        id: `polygon-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        points: points.map((p) => ({ x: p.x, y: p.y })),
        ...DEFAULT_POLYGON_STYLE,
      };
      setSelectedId(newPolygon.id);
      return [...prev, newPolygon];
    });
  }, []);

  const updatePlaced = useCallback((id: string, attrs: Partial<PlacedItem>) => {
    setPlaced((prev) =>
      prev.map((p) => (p.id === id ? ({ ...p, ...attrs } as PlacedItem) : p)),
    );
  }, []);

  const setResidentTypes = useCallback((types: ResidentType[]) => {
    setResidentTypesState(types);
    // 削除された種類の人数を配置済み区画から除去する
    const validIds = new Set(types.map((t) => t.id));
    setPlaced((prev) =>
      prev.map((p) => {
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
    );
  }, []);

  const setZoneResidents = useCallback((id: string, residents: Record<string, number>) => {
    // 0 以下を除去して保持。空になったら residents 自体を外す。
    const cleaned: Record<string, number> = {};
    for (const [typeId, n] of Object.entries(residents)) {
      if (n > 0) cleaned[typeId] = n;
    }
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.id !== id || p.kind !== 'zone') return p;
        const next: PlacedZone = { ...p };
        if (Object.keys(cleaned).length > 0) next.residents = cleaned;
        else delete next.residents;
        return next;
      }),
    );
  }, []);

  const removePlaced = useCallback((id: string) => {
    setPlaced((prev) => prev.filter((p) => p.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const clearPlaced = useCallback(() => {
    setPlaced([]);
    setSelectedId(null);
  }, []);

  const clearAll = useCallback(() => {
    setPlaced([]);
    setSelectedId(null);
    setBackgroundState(null);
    void clearStoredBackground();
    clearStoredLayoutState();
  }, []);

  const replaceZoneList = useCallback((list: ZoneList) => {
    setZoneListState(list);
    void setStoredZoneList(list);
    setPlaced([]);
    setSelectedId(null);
  }, []);

  const resetZoneListToDefault = useCallback(() => {
    setZoneListState(DEFAULT_ZONE_LIST);
    void clearStoredZoneList();
    setPlaced([]);
    setSelectedId(null);
  }, []);

  const loadLayout = useCallback((layout: LayoutFile) => {
    setScaleRatioState(layout.scaleRatio);
    setZoneListState(layout.zoneList);
    void setStoredZoneList(layout.zoneList);
    if (layout.background) {
      setBackgroundState(layout.background);
      void setStoredBackground(layout.background);
    } else {
      setBackgroundState(null);
      void clearStoredBackground();
    }
    setPlaced(layout.placed);
    setResidentTypesState(layout.residentTypes ?? DEFAULT_RESIDENT_TYPES);
    setSelectedId(null);
    setViewScale(1);
    setStagePos({ x: 0, y: 0 });
  }, []);

  const buildLayoutFile = useCallback((): LayoutFile => {
    const layout: LayoutFile = {
      version: 1,
      scaleRatio,
      zoneList,
      placed,
      residentTypes,
    };
    if (background) {
      layout.background = background;
    }
    return layout;
  }, [scaleRatio, zoneList, placed, background, residentTypes]);

  return {
    background,
    scaleRatio,
    viewScale,
    stagePos,
    zoneList,
    placed,
    residentTypes,
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
    loadLayout,
    buildLayoutFile,
  };
};
