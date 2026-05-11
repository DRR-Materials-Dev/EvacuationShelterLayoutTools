export type PaperPreset = 'A3' | 'A4' | 'B5';
export type PaperSizeName = PaperPreset | 'custom';
export type Orientation = 'portrait' | 'landscape';
export type ScaleUnit = 'm' | 'cm';
export type LayoutAlgorithm = 'tile' | 'group' | 'one-per-page';

export type PaperSetting = {
  size: PaperSizeName;
  customWidthCm: number;
  customHeightCm: number;
  orientation: Orientation;
};

export type Margins = {
  top: number; // mm
  right: number;
  bottom: number;
  left: number;
};

export type ScaleSetting = {
  drawingLength: number; // 図面上の長さ
  drawingUnit: ScaleUnit;
  printLengthCm: number; // 印刷上の長さ（cm）
};

export type ZoneCounts = Record<string, number>;

export type PrintSettings = {
  paper: PaperSetting;
  margins: Margins;
  scale: ScaleSetting;
  counts: ZoneCounts;
  showZoneName: boolean;
  algorithm: LayoutAlgorithm;
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paper: {
    size: 'A4',
    customWidthCm: 21,
    customHeightCm: 29.7,
    orientation: 'portrait',
  },
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  scale: { drawingLength: 1, drawingUnit: 'm', printLengthCm: 5 },
  counts: {},
  showZoneName: true,
  algorithm: 'tile',
};

export type ValidationError = {
  zoneId: string;
  zoneName: string;
  zoneSizeMm: { width: number; height: number };
  usableMm: { width: number; height: number };
};

export type ValidationResult = {
  ok: boolean;
  errors: ValidationError[];
};
