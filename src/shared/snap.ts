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
 * 2 次元の値（座標または寸法）をスナップする。
 */
export const snapPoint = (
  point: { x: number; y: number },
  settings: UserSettings,
): { x: number; y: number } => ({
  x: snapValue(point.x, settings),
  y: snapValue(point.y, settings),
});
