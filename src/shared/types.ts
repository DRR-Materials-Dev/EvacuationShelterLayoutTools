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
  /** 配置・印刷時に区画表示名を表示するか。未定義は true として扱う（後方互換）。 */
  showName?: boolean;
  /** 区画名と区画表示名を同じにするか。未定義は true として扱う。false の場合は displayName を使用。 */
  displayNameSameAsName?: boolean;
  /** displayNameSameAsName が false のときに使用される表示名。未定義は '' 扱い。 */
  displayName?: string;
  /** 表示名の文字色 (#RRGGBB)。未定義は '#000000'。 */
  nameColor?: string;
  /** 表示名のフォントサイズ（メートル単位、テキストの高さ）。未定義は自動サイズ。 */
  nameFontSize?: number;
  /** 表示名の横位置。未定義は 'center'。 */
  nameAlignH?: 'left' | 'center' | 'right';
  /** 表示名の縦位置。未定義は 'middle'。 */
  nameAlignV?: 'top' | 'middle' | 'bottom';
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
/**
 * 区画を利用する居住者の性質（種類）。
 * デフォルト 5 種類に加え、ユーザーが最大 MAX_ADDITIONAL_RESIDENT_TYPES 件まで追加できる。
 * デフォルト種類は削除不可（表示名・色は変更可）。設計書 §8.1.1 を参照。
 */
export type ResidentType = {
  id: string;
  name: string;
  color: string; // #RRGGBB（凡例・カウント表示の色分け用）
};

export type PlacedZone = {
  kind: 'zone';
  id: string;
  typeId: string;
  x: number; // メートル
  y: number;
  rotation: number; // 度
  width?: number; // 上書き時のみ（resizable=true の場合）
  height?: number;
  /** 居住者の種類ID -> 人数。未定義・0 は「設定なし」。設計書 §8.1.2。 */
  residents?: Record<string, number>;
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

/**
 * ゾーン（多角形範囲）。区画 (PlacedZone) とは別概念で、3 点以上の多角形で
 * 範囲を囲み、内包される区画の居住者人数を集計する。設計書 §8.1.3。
 */
export type PolygonZone = {
  kind: 'polygon';
  id: string;
  /** 頂点（メートル単位）。3 点以上。 */
  points: { x: number; y: number }[];
  label?: string;
  /** 枠線の種類 */
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  strokeColor: string; // #RRGGBB
  strokeWidthPx: number;
  /** 塗りつぶし色と透明度 */
  fillColor: string; // #RRGGBB
  fillOpacity: number; // 0.0 〜 1.0
  /** ゾーン内居住者カウントを表示するか */
  showCount: boolean;
};

export type PlacedItem = PlacedZone | TextBlock | PolygonZone;

/**
 * 区画リストファイル (.list.json) のスキーマ。
 */
export type ZoneList = {
  version: 1;
  name: string;
  zones: ZoneType[];
};

/**
 * 施設の階層（フロア）。設計書 §8.1.5。
 * 各階層が独立した背景画像・縮尺・配置物を持つ。
 */
export type Floor = {
  id: string;
  name: string; // 例: "1F"
  scaleRatio: number; // px per meter（階層ごと）
  background?: {
    dataUrl: string;
    width: number; // 画像の元ピクセル幅
    height: number;
  };
  placed: PlacedItem[];
};

/**
 * レイアウトファイル (.layout.json) のスキーマ（version 2 / 複数階層対応）。
 *
 * 設計書 §8.1.5。version 1（単一階層）の旧ファイルは読込時に単一 Floor へ変換する。
 */
export type LayoutFile = {
  version: 2;
  /** 参照する区画リスト名（共有リスト保存時に追従して更新）。 */
  zoneListName: string;
  /** 居住者の種類定義。 */
  residentTypes: ResidentType[];
  /** 区画リスト本体（自己完結のため丸ごと内包）。 */
  zoneList: ZoneList;
  /** 階層。最低 1 つ。 */
  floors: Floor[];
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

/**
 * 配置・印刷時に区画上へ描画するテキストを返す。
 * - displayNameSameAsName が false なら displayName を使用（未定義時は空文字）
 * - そうでなければ name を使用
 */
export const getZoneDisplayText = (z: ZoneType): string =>
  z.displayNameSameAsName === false ? (z.displayName ?? '') : z.name;

/** 表示名の文字色。未定義時は '#000000'。 */
export const getZoneNameColor = (z: ZoneType): string => z.nameColor ?? '#000000';

/** 表示名の横位置。未定義時は 'center'。 */
export const getZoneNameAlignH = (z: ZoneType): 'left' | 'center' | 'right' =>
  z.nameAlignH ?? 'center';

/** 表示名の縦位置。未定義時は 'middle'。 */
export const getZoneNameAlignV = (z: ZoneType): 'top' | 'middle' | 'bottom' =>
  z.nameAlignV ?? 'middle';

/** 配置済み区画に設定された居住者の合計人数。residents 未定義時は 0。 */
export const getZoneResidentTotal = (z: PlacedZone): number =>
  z.residents ? Object.values(z.residents).reduce((sum, n) => sum + (n > 0 ? n : 0), 0) : 0;

/**
 * 配置済み区画の、指定した居住者種類の合計を集計して返す。
 * 戻り値は residentTypeId -> 合計人数（0 の種類は含めない）。
 */
export const sumResidentsByType = (zones: PlacedZone[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const z of zones) {
    if (!z.residents) continue;
    for (const [typeId, n] of Object.entries(z.residents)) {
      if (n > 0) out[typeId] = (out[typeId] ?? 0) + n;
    }
  }
  return out;
};
