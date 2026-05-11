import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_ZONE_LIST } from '../../shared/constants.ts';
import type { ZoneList } from '../../shared/types.ts';
import {
  clearStoredZoneList,
  getStoredPrintSettingsRaw,
  getStoredZoneList,
  setStoredPrintSettingsRaw,
} from '../../shared/storage.ts';
import {
  DEFAULT_PRINT_SETTINGS,
  type Orientation,
  type PaperSetting,
  type PaperSizeName,
  type PrintSettings,
  type ScaleSetting,
  type ScaleUnit,
} from './types.ts';

export type PrintState = {
  zoneList: ZoneList;
  isListLoaded: boolean;
  settings: PrintSettings;
};

export type PrintActions = {
  loadZoneList: (list: ZoneList) => void;
  /** 共有区画リスト（IndexedDB）を再読み込みする */
  reloadSharedList: () => Promise<void>;
  /** 区画リストをデフォルトに戻す（共有 IndexedDB もクリア、枚数指定もリセット） */
  resetZoneListToDefault: () => void;
  updateSettings: (patch: Partial<PrintSettings>) => void;
};

const cloneList = (list: ZoneList): ZoneList => ({
  ...list,
  zones: list.zones.map((z) => ({ ...z, image: z.image ? { ...z.image } : undefined })),
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const PAPER_SIZE_NAMES: readonly PaperSizeName[] = ['A3', 'A4', 'B5', 'custom'];
const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape'];
const SCALE_UNITS: readonly ScaleUnit[] = ['m', 'cm'];

const parseStoredPaper = (raw: unknown, fallback: PaperSetting): PaperSetting => {
  if (!isObject(raw)) return fallback;
  const size = PAPER_SIZE_NAMES.includes(raw.size as PaperSizeName)
    ? (raw.size as PaperSizeName)
    : fallback.size;
  const orientation = ORIENTATIONS.includes(raw.orientation as Orientation)
    ? (raw.orientation as Orientation)
    : fallback.orientation;
  const customWidthCm =
    typeof raw.customWidthCm === 'number' && raw.customWidthCm > 0
      ? raw.customWidthCm
      : fallback.customWidthCm;
  const customHeightCm =
    typeof raw.customHeightCm === 'number' && raw.customHeightCm > 0
      ? raw.customHeightCm
      : fallback.customHeightCm;
  return { size, orientation, customWidthCm, customHeightCm };
};

const parseStoredScale = (raw: unknown, fallback: ScaleSetting): ScaleSetting => {
  if (!isObject(raw)) return fallback;
  const drawingLength =
    typeof raw.drawingLength === 'number' && raw.drawingLength > 0
      ? raw.drawingLength
      : fallback.drawingLength;
  const drawingUnit = SCALE_UNITS.includes(raw.drawingUnit as ScaleUnit)
    ? (raw.drawingUnit as ScaleUnit)
    : fallback.drawingUnit;
  const printLengthCm =
    typeof raw.printLengthCm === 'number' && raw.printLengthCm > 0
      ? raw.printLengthCm
      : fallback.printLengthCm;
  return { drawingLength, drawingUnit, printLengthCm };
};

const loadInitialSettings = (): PrintSettings => {
  const raw = getStoredPrintSettingsRaw();
  if (!raw) return DEFAULT_PRINT_SETTINGS;
  return {
    ...DEFAULT_PRINT_SETTINGS,
    paper: parseStoredPaper(raw.paper, DEFAULT_PRINT_SETTINGS.paper),
    scale: parseStoredScale(raw.scale, DEFAULT_PRINT_SETTINGS.scale),
  };
};

export const usePrintState = (): PrintState & PrintActions => {
  const [zoneList, setZoneList] = useState<ZoneList>(() => cloneList(DEFAULT_ZONE_LIST));
  const [isListLoaded, setIsListLoaded] = useState<boolean>(false);
  const [settings, setSettings] = useState<PrintSettings>(() => loadInitialSettings());

  // 共有区画リストを初期マウント時に読み込む
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void getStoredZoneList().then((stored) => {
      if (stored) setZoneList(cloneList(stored));
      setIsListLoaded(true);
    });
  }, []);

  // counts は zoneList に無い id を含む可能性があるが、
  // 出力アルゴリズム側で zoneList.zones を起点に参照するため害はない（ゴミは黙ってスキップされる）。

  // 用紙設定・縮尺の永続化（paper / scale のみ）
  useEffect(() => {
    setStoredPrintSettingsRaw({ paper: settings.paper, scale: settings.scale });
  }, [settings.paper, settings.scale]);

  const loadZoneList = useCallback((list: ZoneList) => {
    setZoneList(cloneList(list));
  }, []);

  const reloadSharedList = useCallback(async () => {
    const stored = await getStoredZoneList();
    if (stored) setZoneList(cloneList(stored));
  }, []);

  const resetZoneListToDefault = useCallback(() => {
    setZoneList(cloneList(DEFAULT_ZONE_LIST));
    void clearStoredZoneList();
    // 旧 zoneList に依存していた枚数指定はリセット
    setSettings((s) => ({ ...s, counts: {} }));
  }, []);

  const updateSettings = useCallback((patch: Partial<PrintSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  return {
    zoneList,
    isListLoaded,
    settings,
    loadZoneList,
    reloadSharedList,
    resetZoneListToDefault,
    updateSettings,
  };
};
