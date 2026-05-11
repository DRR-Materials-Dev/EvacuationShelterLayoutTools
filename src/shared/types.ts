/**
 * 共通データモデル定義
 *
 * 設計書 §4 を参照。
 */

export type ImageFitMode =
  | 'fill' // 区画サイズに合わせる（縦横別々にスケール）
  | 'contain' // 縦横比維持: 長辺フィット
  | 'manual'; // 縮尺設定（縦横別）

export type ZoneImage = {
  dataUrl: string; // base64 (data URL)
  fitMode: ImageFitMode;
  scaleX?: number; // fitMode === 'manual' のとき有効（1.0 = 等倍）
  scaleY?: number;
  rotation: number; // -180 〜 180、1° 刻み
};

/**
 * 区画タイプの定義。区画リストはこの配列で構成される。
 */
export type ZoneType = {
  id: string;
  name: string;
  width: number; // メートル単位
  height: number; // メートル単位
  color: string; // #RRGGBB
  resizable: boolean;
  /** 配置・印刷時に区画名を表示するか。未定義は true として扱う（後方互換）。 */
  showName?: boolean;
  /** 枠線を描画するか。未定義は true として扱う。 */
  showBorder?: boolean;
  /** 枠線の色 (#RRGGBB)。未定義は '#333333'。 */
  borderColor?: string;
  /** 枠線の幅（区画エディタ画面上でのピクセル数）。未定義は 1。 */
  borderWidthPx?: number;
  image?: ZoneImage;
};

/**
 * 避難所レイアウトに配置された個別インスタンス（区画）。
 * 座標・寸法はすべてメートル単位で保持し、表示時に scaleRatio を掛けて px に変換する。
 */
export type PlacedZone = {
  kind: 'zone';
  id: string;
  typeId: string;
  x: number; // メートル
  y: number;
  rotation: number; // 度
  width?: number; // 上書き時のみ（resizable=true の場合）
  height?: number;
};

export type TextBlock = {
  kind: 'text';
  id: string;
  text: string;
  x: number; // メートル
  y: number;
  fontSize: number; // px（画面上のフォントサイズ。仕様改善後に文字単位を再検討）
  scaleX: number;
  scaleY: number;
  rotation: number; // 度
  color: string;
};

export type PlacedItem = PlacedZone | TextBlock;

/**
 * 区画リストファイル (.list.json) のスキーマ。
 */
export type ZoneList = {
  version: 1;
  name: string;
  zones: ZoneType[];
};

/**
 * レイアウトファイル (.layout.json) のスキーマ。
 */
export type LayoutFile = {
  version: 1;
  scaleRatio: number; // px per meter
  background?: {
    dataUrl: string;
    width: number; // 画像の元ピクセル幅
    height: number;
  };
  zoneList: ZoneList;
  placed: PlacedItem[];
};

/**
 * ユーザー設定（LocalStorage に保存される）。
 */
export type UserSettings = {
  snap: {
    enabled: boolean;
    sizeMeters: number; // 例: 0.1 = 10cm
  };
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  snap: {
    enabled: true,
    sizeMeters: 0.1,
  },
};

/** 区画の枠線設定を、未定義部分にデフォルトを補って返す。 */
export const getZoneBorder = (z: ZoneType): { show: boolean; color: string; widthPx: number } => ({
  show: z.showBorder !== false,
  color: z.borderColor ?? '#333333',
  widthPx: typeof z.borderWidthPx === 'number' && z.borderWidthPx >= 0 ? z.borderWidthPx : 1,
});
