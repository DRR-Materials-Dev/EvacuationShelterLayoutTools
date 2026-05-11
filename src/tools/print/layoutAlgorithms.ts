import type { ZoneList, ZoneType } from '../../shared/types.ts';
import { getPaperSizeMm, getPrintScaleMmPerMeter } from './paperSizes.ts';
import type {
  LayoutAlgorithm,
  Margins,
  PrintSettings,
  ValidationError,
  ValidationResult,
} from './types.ts';

const ITEM_GAP_MM = 5;

/** 各ページ上部にヘッダ（リスト名 + 縮尺）を描画する分の予約高さ (mm)。 */
export const PAGE_HEADER_HEIGHT_MM = 10;

export type PrintItem = {
  zone: ZoneType;
  widthMm: number;
  heightMm: number;
  copyIndex: number; // 区画内コピー番号 (0-based)
};

export type Placement = {
  item: PrintItem;
  xMm: number;
  yMm: number;
};

export type Page = {
  index: number;
  items: Placement[];
};

const buildItems = (list: ZoneList, settings: PrintSettings, mmPerMeter: number): PrintItem[] => {
  const items: PrintItem[] = [];
  for (const zone of list.zones) {
    const n = settings.counts[zone.id] ?? 0;
    for (let i = 0; i < Math.floor(n); i++) {
      items.push({
        zone,
        widthMm: zone.width * mmPerMeter,
        heightMm: zone.height * mmPerMeter,
        copyIndex: i,
      });
    }
  }
  return items;
};

/**
 * グリーディな棚詰め配置。
 * `forceNewPageOnTypeChange` = true なら、`zone.id` が変わるたびに新ページを開始する。
 */
const packItems = (
  items: PrintItem[],
  pageWidthMm: number,
  pageHeightMm: number,
  margins: Margins,
  forceNewPageOnTypeChange: boolean,
): Page[] => {
  const pages: Page[] = [];
  let current: Page = { index: 0, items: [] };
  let cursorX = margins.left;
  let cursorY = margins.top;
  let rowMaxHeight = 0;
  let currentTypeId: string | null = null;

  const finishPage = () => {
    if (current.items.length > 0) {
      pages.push(current);
    }
    current = { index: pages.length, items: [] };
    cursorX = margins.left;
    cursorY = margins.top;
    rowMaxHeight = 0;
  };

  for (const item of items) {
    if (
      forceNewPageOnTypeChange &&
      currentTypeId !== null &&
      item.zone.id !== currentTypeId
    ) {
      finishPage();
    }
    currentTypeId = item.zone.id;

    // 行末を超えるなら行送り
    if (cursorX + item.widthMm > pageWidthMm - margins.right + 0.001) {
      cursorY += rowMaxHeight + ITEM_GAP_MM;
      cursorX = margins.left;
      rowMaxHeight = 0;
    }
    // ページ末を超えるなら改ページ
    if (cursorY + item.heightMm > pageHeightMm - margins.bottom + 0.001) {
      finishPage();
    }

    current.items.push({ item, xMm: cursorX, yMm: cursorY });
    cursorX += item.widthMm + ITEM_GAP_MM;
    rowMaxHeight = Math.max(rowMaxHeight, item.heightMm);
  }

  if (current.items.length > 0) {
    pages.push(current);
  }
  return pages;
};

const sortByType = (items: PrintItem[]): PrintItem[] => {
  return [...items].sort((a, b) => {
    if (a.zone.id < b.zone.id) return -1;
    if (a.zone.id > b.zone.id) return 1;
    return a.copyIndex - b.copyIndex;
  });
};

const orderItems = (items: PrintItem[], algorithm: LayoutAlgorithm): PrintItem[] => {
  if (algorithm === 'tile') return items;
  return sortByType(items);
};

export const computePages = (list: ZoneList, settings: PrintSettings): Page[] => {
  const mmPerMeter = getPrintScaleMmPerMeter(settings.scale);
  if (mmPerMeter <= 0) return [];
  const paper = getPaperSizeMm(settings.paper);
  const items = orderItems(buildItems(list, settings, mmPerMeter), settings.algorithm);
  // 上部マージンはヘッダ分を上乗せする
  const effectiveMargins: Margins = {
    ...settings.margins,
    top: settings.margins.top + PAGE_HEADER_HEIGHT_MM,
  };
  return packItems(
    items,
    paper.width,
    paper.height,
    effectiveMargins,
    settings.algorithm === 'one-per-page',
  );
};

/**
 * 印刷可能領域に収まらない区画を検出する。
 */
export const validatePrint = (list: ZoneList, settings: PrintSettings): ValidationResult => {
  const mmPerMeter = getPrintScaleMmPerMeter(settings.scale);
  const paper = getPaperSizeMm(settings.paper);
  const usableW = paper.width - settings.margins.left - settings.margins.right;
  const usableH =
    paper.height - settings.margins.top - settings.margins.bottom - PAGE_HEADER_HEIGHT_MM;

  const errors: ValidationError[] = [];
  for (const zone of list.zones) {
    const count = settings.counts[zone.id] ?? 0;
    if (count <= 0 || mmPerMeter <= 0) continue;
    const w = zone.width * mmPerMeter;
    const h = zone.height * mmPerMeter;
    if (w > usableW + 0.001 || h > usableH + 0.001) {
      errors.push({
        zoneId: zone.id,
        zoneName: zone.name,
        zoneSizeMm: { width: w, height: h },
        usableMm: { width: usableW, height: usableH },
      });
    }
  }
  return { ok: errors.length === 0, errors };
};
