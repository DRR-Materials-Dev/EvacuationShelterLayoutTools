import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_ZONE_LIST } from '../../shared/constants.ts';
import type { ZoneList, ZoneType } from '../../shared/types.ts';
import {
  clearStoredZoneList,
  getStoredZoneList,
  setStoredZoneList,
} from '../../shared/storage.ts';

export type EditorState = {
  zoneList: ZoneList;
  selectedId: string | null;
  isDirty: boolean;
  isLoaded: boolean; // 初期読み込みが完了したか
};

export type EditorActions = {
  selectZone: (id: string | null) => void;
  addZone: () => void;
  duplicateZone: (id: string) => void;
  removeZone: (id: string) => void;
  updateZone: (id: string, attrs: Partial<ZoneType>) => void;
  renameList: (name: string) => void;
  newList: () => void;
  loadList: (list: ZoneList) => void;
  /** 現在のリストを IndexedDB に保存し、isDirty を解除する。`.list.json` のダウンロードは呼び出し側で行う */
  markSaved: () => void;
  /** デフォルトの区画リストに戻す（IndexedDB も同時に更新し、isDirty 解除） */
  resetToDefault: () => void;
};

const generateId = () => `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const cloneList = (list: ZoneList): ZoneList => ({
  ...list,
  zones: list.zones.map((z) => ({
    ...z,
    image: z.image ? { ...z.image } : undefined,
  })),
});

export const useEditorState = (): EditorState & EditorActions => {
  const [zoneList, setZoneList] = useState<ZoneList>(() => cloneList(DEFAULT_ZONE_LIST));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // 初期マウント時に IndexedDB から読み込む。dirty には影響させない（ロード = クリーン）
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void getStoredZoneList().then((stored) => {
      if (stored) {
        setZoneList(cloneList(stored));
      }
      setIsLoaded(true);
    });
  }, []);

  /* ---------- 内部ユーティリティ ---------- */

  const mutateList = useCallback((mutator: (list: ZoneList) => ZoneList) => {
    setZoneList((prev) => mutator(prev));
    setIsDirty(true);
  }, []);

  /* ---------- アクション ---------- */

  const selectZone = useCallback((id: string | null) => setSelectedId(id), []);

  const addZone = useCallback(() => {
    const newZone: ZoneType = {
      id: generateId(),
      name: '新規区画',
      width: 1,
      height: 1,
      color: '#cccccc',
      resizable: true,
    };
    mutateList((list) => ({ ...list, zones: [...list.zones, newZone] }));
    setSelectedId(newZone.id);
  }, [mutateList]);

  const duplicateZone = useCallback(
    (id: string) => {
      mutateList((list) => {
        const src = list.zones.find((z) => z.id === id);
        if (!src) return list;
        const copy: ZoneType = {
          ...src,
          id: generateId(),
          name: `${src.name} のコピー`,
          image: src.image ? { ...src.image } : undefined,
        };
        const idx = list.zones.findIndex((z) => z.id === id);
        const next = [...list.zones];
        next.splice(idx + 1, 0, copy);
        return { ...list, zones: next };
      });
    },
    [mutateList],
  );

  const removeZone = useCallback(
    (id: string) => {
      mutateList((list) => ({ ...list, zones: list.zones.filter((z) => z.id !== id) }));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [mutateList],
  );

  const updateZone = useCallback(
    (id: string, attrs: Partial<ZoneType>) => {
      mutateList((list) => ({
        ...list,
        zones: list.zones.map((z) => (z.id === id ? { ...z, ...attrs } : z)),
      }));
    },
    [mutateList],
  );

  const renameList = useCallback(
    (name: string) => {
      mutateList((list) => ({ ...list, name }));
    },
    [mutateList],
  );

  const newList = useCallback(() => {
    setZoneList({ version: 1, name: '新規区画リスト', zones: [] });
    setSelectedId(null);
    setIsDirty(true);
  }, []);

  const loadList = useCallback((list: ZoneList) => {
    setZoneList(cloneList(list));
    setSelectedId(null);
    setIsDirty(false);
  }, []);

  const markSaved = useCallback(() => {
    void setStoredZoneList(zoneList);
    setIsDirty(false);
  }, [zoneList]);

  const resetToDefault = useCallback(() => {
    setZoneList(cloneList(DEFAULT_ZONE_LIST));
    setSelectedId(null);
    setIsDirty(false);
    // 他ツールへの伝播のため、IndexedDB 上の共有リストも初期化（= 削除して未保存扱い）
    void clearStoredZoneList();
  }, []);

  return {
    zoneList,
    selectedId,
    isDirty,
    isLoaded,
    selectZone,
    addZone,
    duplicateZone,
    removeZone,
    updateZone,
    renameList,
    newList,
    loadList,
    markSaved,
    resetToDefault,
  };
};
