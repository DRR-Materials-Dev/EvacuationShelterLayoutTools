import type { ImageFitMode } from './types.ts';

/**
 * 画像の表示サイズを計算する。
 *  - fill: 区画サイズに合わせる（縦横比破壊あり）
 *  - contain: 縦横比を維持して長辺フィット
 *  - manual: 区画サイズに対する比率（scaleX/Y = 1.0 で区画ぴったり）
 *
 * 単位は呼び出し側で揃える（プレビューは px、印刷は viewBox 単位など）。
 */
export const computeImageDisplaySize = (
  fitMode: ImageFitMode,
  naturalW: number,
  naturalH: number,
  zoneW: number,
  zoneH: number,
  scaleX: number,
  scaleY: number,
): { width: number; height: number } => {
  if (naturalW <= 0 || naturalH <= 0) return { width: 0, height: 0 };
  if (fitMode === 'fill') {
    return { width: zoneW, height: zoneH };
  }
  if (fitMode === 'contain') {
    const s = Math.min(zoneW / naturalW, zoneH / naturalH);
    return { width: naturalW * s, height: naturalH * s };
  }
  // manual: 区画サイズに対する縦横比
  return { width: zoneW * scaleX, height: zoneH * scaleY };
};
