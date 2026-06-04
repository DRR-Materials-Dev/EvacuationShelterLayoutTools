import { get, set, del } from 'idb-keyval';
import type { Floor, ResidentType, UserSettings, ZoneList } from './types.ts';
import { DEFAULT_USER_SETTINGS } from './types.ts';
import { DEFAULT_RESIDENT_TYPES, DEFAULT_ZONE_LIST } from './constants.ts';

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

/* ---------- 避難所レイアウト固有ステート（複数階層 / IndexedDB） ---------- */

// v2 の自動復元ステートは階層ごとに背景画像（base64）を含むため、
// LocalStorage の 5MB 上限を避けて IndexedDB に保存する（設計書 §8.1.5）。
const KEY_LAYOUT_STATE_V2 = 'evac-tool/layout/state-v2';
// v1（単一階層）の旧ステート（LocalStorage）。一度だけ読み込んで移行する。
const KEY_LAYOUT_STATE_LEGACY = 'evac-tool/layout/state';

export type StoredLayoutState = {
  floors: Floor[];
  activeFloorId: string;
  residentTypes: ResidentType[];
  zoneListName: string;
};

export const getStoredLayoutState = (): Promise<StoredLayoutState | undefined> =>
  get(KEY_LAYOUT_STATE_V2);

export const setStoredLayoutState = (s: StoredLayoutState): Promise<void> =>
  set(KEY_LAYOUT_STATE_V2, s);

export const clearStoredLayoutState = (): Promise<void> => del(KEY_LAYOUT_STATE_V2);

/**
 * 旧 v1 ステート（LocalStorage の scaleRatio/placed + IndexedDB の単一背景）を
 * v2 の単一階層へ移行する。移行後は旧キーを削除する。該当データが無ければ null。
 */
export const migrateLegacyLayoutState = async (): Promise<StoredLayoutState | null> => {
  try {
    const raw = localStorage.getItem(KEY_LAYOUT_STATE_LEGACY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || typeof parsed.scaleRatio !== 'number' || !Array.isArray(parsed.placed)) {
      return null;
    }
    const bg = await getStoredBackground();
    const floor: Floor = {
      id: 'floor-legacy-0',
      name: '1F',
      scaleRatio: parsed.scaleRatio,
      placed: parsed.placed as Floor['placed'],
    };
    if (bg) floor.background = bg;
    const migrated: StoredLayoutState = {
      floors: [floor],
      activeFloorId: floor.id,
      residentTypes: Array.isArray(parsed.residentTypes)
        ? (parsed.residentTypes as ResidentType[])
        : DEFAULT_RESIDENT_TYPES,
      zoneListName: DEFAULT_ZONE_LIST.name,
    };
    // 旧キーを掃除（背景の単一キーも v2 では floor に内包するため削除）
    localStorage.removeItem(KEY_LAYOUT_STATE_LEGACY);
    await clearStoredBackground();
    await setStoredLayoutState(migrated);
    return migrated;
  } catch {
    return null;
  }
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
