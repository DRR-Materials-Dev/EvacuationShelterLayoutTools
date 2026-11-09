import { DEFAULT_ZONE_LIST } from './constants.ts';
import { clearStoredZoneList, setStoredZoneList } from './storage.ts';
import { parseZoneList } from './zoneListIO.ts';
import type { ZoneList } from './types.ts';

/**
 * 「初期化（デフォルトに戻す）」で選べる既定の区画リスト（v2.7.0）。
 *
 * - standard: 従来からの標準区画リスト（constants.ts に定義）
 * - jichitai: 自治体研究会用区画リスト（画像入りで約 1.7MB あるため、選択時に別チャンクとして遅延読込）
 */
export type ZoneListPresetId = 'standard' | 'jichitai';

export type ZoneListPreset = {
  id: ZoneListPresetId;
  label: string;
  description: string;
};

export const ZONE_LIST_PRESETS: ZoneListPreset[] = [
  {
    id: 'standard',
    label: '標準区画リスト',
    description: '従来のデフォルト（居住スペース・受付・談話室・食堂など 8 種）',
  },
  {
    id: 'jichitai',
    label: '自治体研究会用区画リスト',
    description: 'コット等の居住区画を含む、自治体研究会向けの区画（画像付き）',
  },
];

export const DEFAULT_PRESET_ID: ZoneListPresetId = 'standard';

/** 既定区画リストを取得する。自治体研究会用は初回のみファイルを読み込む。 */
export const loadZoneListPreset = async (id: ZoneListPresetId): Promise<ZoneList> => {
  if (id === 'jichitai') {
    const mod = await import('./presets/jichitai-kenkyukai.list.json?raw');
    return parseZoneList(mod.default);
  }
  return DEFAULT_ZONE_LIST;
};

/**
 * 既定区画リストを共有区画リスト（IndexedDB）に反映する。
 * 標準は従来どおり削除（＝未保存扱い。再読込で標準に戻る）、それ以外は保存して再読込後も維持する。
 */
export const persistPresetAsShared = (id: ZoneListPresetId, list: ZoneList): Promise<void> =>
  id === 'standard' ? clearStoredZoneList() : setStoredZoneList(list);
