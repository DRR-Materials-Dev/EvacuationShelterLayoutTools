import type { UserSettings } from './types.ts';

/**
 * 値（メートル単位想定）をユーザー設定に従ってスナップする。
 * スナップが無効ならそのまま返す。
 *
 * 戻り値は浮動小数点誤差を 10 桁で丸めて整形済み。
 * （例: 1.4 + 0.1 が 1.5000000000000002 になる問題を回避）
 */
export const snapValue = (value: number, settings: UserSettings): number => {
  if (!settings.snap.enabled) return cleanupFloat(value);
  const size = settings.snap.sizeMeters;
  if (size <= 0) return cleanupFloat(value);
  return cleanupFloat(Math.round(value / size) * size);
};

/** 浮動小数点演算で生じる末尾のゴミ桁を除去する */
const cleanupFloat = (v: number): number => {
  if (!Number.isFinite(v)) return v;
  return Number.parseFloat(v.toFixed(10));
};

/**
 * Ctrl キーを押しているとき用に、位置スナップの ON/OFF を反転した設定を返す。
 * invert が false ならそのまま返す。
 */
export const withSnapInverted = (settings: UserSettings, invert: boolean): UserSettings =>
  invert ? { ...settings, snap: { ...settings.snap, enabled: !settings.snap.enabled } } : settings;

/**
 * Konva Transformer に渡す回転スナップ角の一覧と許容差を返す。
 * 許容差を刻みの半分にすることで、常にいちばん近い刻みへ吸着させる。
 * invert（Ctrl 押下）なら角度スナップの ON/OFF を反転する。スナップしない場合は空配列。
 */
export const rotationSnapConfig = (
  settings: UserSettings,
  invert: boolean,
): { snaps: number[]; tolerance: number } => {
  const { enabled, degrees } = settings.rotationSnap;
  const on = invert ? !enabled : enabled;
  if (!on || !(degrees > 0)) return { snaps: [], tolerance: 0 };
  const snaps: number[] = [];
  for (let a = 0; a < 360 - 1e-9; a += degrees) snaps.push(cleanupFloat(a));
  return { snaps, tolerance: degrees / 2 };
};

/**
 * 2 次元の値（座標または寸法）をスナップする。
 */
export const snapPoint = (
  point: { x: number; y: number },
  settings: UserSettings,
): { x: number; y: number } => ({
  x: snapValue(point.x, settings),
  y: snapValue(point.y, settings),
});
