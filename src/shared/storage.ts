import { get, set, del } from 'idb-keyval';
import type { PlacedItem, ResidentType, UserSettings, ZoneList } from './types.ts';
import { DEFAULT_USER_SETTINGS } from './types.ts';

/**
 * IndexedDB に保存される背景画像。
 */
export type StoredBackground = {
  dataUrl: string;
  width: number;
  height: number;
};

// IndexedDB キー
const KEY_ZONE_LIST = 'evac-tool/zone-list';
const KEY_BACKGROUND = 'evac-tool/background';

// LocalStorage キー
const KEY_USER_SETTINGS = 'evac-tool/user-settings';

/* ---------- 共有区画リスト（IndexedDB） ---------- */

export const getStoredZoneList = (): Promise<ZoneList | undefined> => get(KEY_ZONE_LIST);

export const setStoredZoneList = (list: ZoneList): Promise<void> => set(KEY_ZONE_LIST, list);

export const clearStoredZoneList = (): Promise<void> => del(KEY_ZONE_LIST);

/* ---------- 背景画像（IndexedDB） ---------- */

export const getStoredBackground = (): Promise<StoredBackground | undefined> => get(KEY_BACKGROUND);

export const setStoredBackground = (bg: StoredBackground): Promise<void> => set(KEY_BACKGROUND, bg);

export const clearStoredBackground = (): Promise<void> => del(KEY_BACKGROUND);

/* ---------- ユーザー設定（LocalStorage） ---------- */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const getStoredUserSettings = (): UserSettings => {
  try {
    const raw = localStorage.getItem(KEY_USER_SETTINGS);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return DEFAULT_USER_SETTINGS;

    const snapRaw = isObject(parsed.snap) ? parsed.snap : {};
    return {
      snap: {
        enabled:
          typeof snapRaw.enabled === 'boolean'
            ? snapRaw.enabled
            : DEFAULT_USER_SETTINGS.snap.enabled,
        sizeMeters:
          typeof snapRaw.sizeMeters === 'number' && snapRaw.sizeMeters > 0
            ? snapRaw.sizeMeters
            : DEFAULT_USER_SETTINGS.snap.sizeMeters,
      },
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
};

export const setStoredUserSettings = (s: UserSettings): void => {
  localStorage.setItem(KEY_USER_SETTINGS, JSON.stringify(s));
};

/* ---------- 避難所レイアウト固有ステート（LocalStorage） ---------- */

const KEY_LAYOUT_STATE = 'evac-tool/layout/state';

export type StoredLayoutState = {
  scaleRatio: number;
  placed: PlacedItem[];
  /** 居住者の種類定義（設計書 §8.1.1）。旧データには無いため任意。 */
  residentTypes?: ResidentType[];
};

export const getStoredLayoutState = (): StoredLayoutState | null => {
  try {
    const raw = localStorage.getItem(KEY_LAYOUT_STATE);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    if (typeof parsed.scaleRatio !== 'number' || !Array.isArray(parsed.placed)) return null;
    const out: StoredLayoutState = {
      scaleRatio: parsed.scaleRatio,
      placed: parsed.placed as PlacedItem[],
    };
    if (Array.isArray(parsed.residentTypes)) {
      out.residentTypes = parsed.residentTypes as ResidentType[];
    }
    return out;
  } catch {
    return null;
  }
};

export const setStoredLayoutState = (s: StoredLayoutState): void => {
  localStorage.setItem(KEY_LAYOUT_STATE, JSON.stringify(s));
};

export const clearStoredLayoutState = (): void => {
  localStorage.removeItem(KEY_LAYOUT_STATE);
};

/* ---------- 区画印刷の用紙・縮尺設定（LocalStorage） ---------- */

const KEY_PRINT_SETTINGS = 'evac-tool/print/settings';

/**
 * 印刷設定のうち、永続化対象（用紙設定と縮尺設定）の生 JSON を返す。
 * 形式検査は呼び出し側で行う前提（型不一致は無視される）。
 */
export const getStoredPrintSettingsRaw = (): Record<string, unknown> | null => {
  try {
    const raw = localStorage.getItem(KEY_PRINT_SETTINGS);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const setStoredPrintSettingsRaw = (data: Record<string, unknown>): void => {
  localStorage.setItem(KEY_PRINT_SETTINGS, JSON.stringify(data));
};
