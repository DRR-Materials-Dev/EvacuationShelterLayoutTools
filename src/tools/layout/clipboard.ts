/**
 * 配置物のコピー＆ペースト（アプリ内クリップボード）と、配置物の平行移動ヘルパー。
 *
 * - クリップボードはモジュール変数で保持する（OS のクリップボードは使わない）。
 *   ページ遷移・階層切替をまたいでも残り、別階層へ貼り付けられる。
 * - コピーするのはその時点の内容のディープコピー。貼り付けるたびに新しい ID を振り、
 *   元の位置から step × 貼り付け回数 だけ右下へずらす。
 */
import type { PlacedItem } from '../../shared/types.ts';

const genId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

type ClipboardData = {
  /** コピーした配置物（ディープコピー。ID は元のまま）。 */
  items: PlacedItem[];
  /** ゾーン内選択をコピーしたときのゾーンの元 ID。それ以外は null。 */
  innerZoneId: string | null;
  /** これまでに貼り付けた回数（ずらし量の計算用）。 */
  pasteCount: number;
};

let clipboard: ClipboardData | null = null;

/** 配置物をメートル単位で平行移動したときの更新属性を返す。 */
export const translateAttrs = (item: PlacedItem, dx: number, dy: number): Partial<PlacedItem> => {
  if (item.kind === 'polygon') {
    return { points: item.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
  return { x: item.x + dx, y: item.y + dy };
};

/** 選択中の配置物をクリップボードへコピーする。 */
export const copyItems = (items: PlacedItem[], innerZoneId: string | null): void => {
  if (items.length === 0) return;
  clipboard = { items: structuredClone(items), innerZoneId, pasteCount: 0 };
};

export const hasClipboard = (): boolean => clipboard !== null;

export type PasteResult = {
  /** 新しい ID を振った貼り付け用の配置物。 */
  items: PlacedItem[];
  /** 貼り付け後に選択する ID（ゾーン内選択ならゾーン自身を含む）。 */
  selectedIds: string[];
  /** 貼り付け後にゾーン内選択にするゾーンの新 ID。 */
  innerZoneId: string | null;
  /** 区画の種類が区画リストに無いため貼り付けなかった件数。 */
  skipped: number;
};

/**
 * クリップボードの内容を複製して返す（状態への追加は呼び出し側）。
 * @param step 1 回の貼り付けでずらす量（メートル）
 * @param isTypeAvailable 区画の種類が現在の区画リストにあるか
 */
export const pasteItems = (
  step: number,
  isTypeAvailable: (typeId: string) => boolean,
): PasteResult | null => {
  if (!clipboard) return null;
  clipboard.pasteCount += 1;
  const offset = step * clipboard.pasteCount;

  const items: PlacedItem[] = [];
  let innerZoneId: string | null = null;
  let skipped = 0;
  for (const src of clipboard.items) {
    if (src.kind === 'zone' && !isTypeAvailable(src.typeId)) {
      skipped += 1;
      continue;
    }
    const copy = structuredClone(src);
    copy.id = genId(src.kind);
    Object.assign(copy, translateAttrs(src, offset, offset));
    if (src.id === clipboard.innerZoneId) innerZoneId = copy.id;
    items.push(copy);
  }
  if (items.length === 0) return { items, selectedIds: [], innerZoneId: null, skipped };
  return { items, selectedIds: items.map((i) => i.id), innerZoneId, skipped };
};
