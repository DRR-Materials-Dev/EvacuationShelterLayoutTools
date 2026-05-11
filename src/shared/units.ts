/**
 * 単位変換ユーティリティ。
 *
 * 設計方針:
 *  - ドメインモデル（区画サイズ・配置座標）は常にメートル単位で保持
 *  - キャンバス描画時は scaleRatio (px/m) を掛けて px に変換
 *  - 印刷では mm / cm の物理単位を CSS の `mm` / `cm` 単位として使う
 */

export const mToCm = (m: number): number => m * 100;
export const cmToM = (cm: number): number => cm / 100;

export const mmToCm = (mm: number): number => mm / 10;
export const cmToMm = (cm: number): number => cm * 10;

export const mToMm = (m: number): number => m * 1000;
export const mmToM = (mm: number): number => mm / 1000;

/**
 * メートルをピクセルに変換する。
 * @param meters 値（メートル）
 * @param scaleRatio 縮尺（px/m）
 */
export const mToPx = (meters: number, scaleRatio: number): number => meters * scaleRatio;

/**
 * ピクセルをメートルに変換する。
 */
export const pxToM = (pixels: number, scaleRatio: number): number => pixels / scaleRatio;
