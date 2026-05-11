import type { PaperPreset, PaperSetting, ScaleSetting } from './types.ts';

export const PAPER_PRESETS_MM: Record<PaperPreset, { width: number; height: number }> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  B5: { width: 182, height: 257 },
};

/**
 * 用紙の物理サイズ (mm) を、向きを反映して返す。
 */
export const getPaperSizeMm = (paper: PaperSetting): { width: number; height: number } => {
  let w: number;
  let h: number;
  if (paper.size === 'custom') {
    w = paper.customWidthCm * 10;
    h = paper.customHeightCm * 10;
  } else {
    const p = PAPER_PRESETS_MM[paper.size];
    w = p.width;
    h = p.height;
  }
  if (paper.orientation === 'landscape') {
    return { width: h, height: w };
  }
  return { width: w, height: h };
};

/**
 * 縮尺 (mm / m) を計算する。0 以下なら不正値として 0 を返す。
 */
export const getPrintScaleMmPerMeter = (scale: ScaleSetting): number => {
  const drawingMeters =
    scale.drawingUnit === 'cm' ? scale.drawingLength / 100 : scale.drawingLength;
  const printMm = scale.printLengthCm * 10;
  if (drawingMeters <= 0 || printMm <= 0) return 0;
  return printMm / drawingMeters;
};
