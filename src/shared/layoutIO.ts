import type {
  LayoutFile,
  PlacedItem,
  PlacedZone,
  PolygonZone,
  ResidentType,
  TextBlock,
} from './types.ts';
import { DEFAULT_POLYGON_STYLE } from './constants.ts';
import { parseZoneList, ZoneListParseError } from './zoneListIO.ts';

export const LAYOUT_VERSION = 1;
export const LAYOUT_EXTENSION = '.layout.json';

export class LayoutParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutParseError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const parsePlacedZone = (raw: Record<string, unknown>, index: number): PlacedZone => {
  const { id, typeId, x, y, rotation } = raw;
  if (typeof id !== 'string') {
    throw new LayoutParseError(`placed[${index}].id が不正です`);
  }
  if (typeof typeId !== 'string') {
    throw new LayoutParseError(`placed[${index}].typeId が不正です`);
  }
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new LayoutParseError(`placed[${index}].x/y が不正です`);
  }
  if (typeof rotation !== 'number') {
    throw new LayoutParseError(`placed[${index}].rotation が不正です`);
  }
  const out: PlacedZone = { kind: 'zone', id, typeId, x, y, rotation };
  if (typeof raw.width === 'number') out.width = raw.width;
  if (typeof raw.height === 'number') out.height = raw.height;
  if (isObject(raw.residents)) {
    const residents: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.residents)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) residents[k] = v;
    }
    if (Object.keys(residents).length > 0) out.residents = residents;
  }
  return out;
};

/** residentTypes フィールドを検証して返す。不正・未定義なら undefined。 */
const parseResidentTypes = (raw: unknown): ResidentType[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const out: ResidentType[] = [];
  for (const item of raw) {
    if (!isObject(item)) continue;
    if (typeof item.id !== 'string' || typeof item.name !== 'string') continue;
    out.push({
      id: item.id,
      name: item.name,
      color: typeof item.color === 'string' ? item.color : '#888888',
    });
  }
  return out.length > 0 ? out : undefined;
};

const parseTextBlock = (raw: Record<string, unknown>, index: number): TextBlock => {
  const { id, text, x, y, fontSize, scaleX, scaleY, rotation, color } = raw;
  if (typeof id !== 'string') {
    throw new LayoutParseError(`placed[${index}].id が不正です`);
  }
  if (typeof text !== 'string') {
    throw new LayoutParseError(`placed[${index}].text が不正です`);
  }
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new LayoutParseError(`placed[${index}].x/y が不正です`);
  }
  if (typeof fontSize !== 'number') {
    throw new LayoutParseError(`placed[${index}].fontSize が不正です`);
  }
  if (typeof scaleX !== 'number' || typeof scaleY !== 'number') {
    throw new LayoutParseError(`placed[${index}].scaleX/Y が不正です`);
  }
  if (typeof rotation !== 'number') {
    throw new LayoutParseError(`placed[${index}].rotation が不正です`);
  }
  if (typeof color !== 'string') {
    throw new LayoutParseError(`placed[${index}].color が不正です`);
  }
  return { kind: 'text', id, text, x, y, fontSize, scaleX, scaleY, rotation, color };
};

const parsePolygonZone = (raw: Record<string, unknown>, index: number): PolygonZone => {
  const { id, points } = raw;
  if (typeof id !== 'string') {
    throw new LayoutParseError(`placed[${index}].id が不正です`);
  }
  if (!Array.isArray(points) || points.length < 3) {
    throw new LayoutParseError(`placed[${index}].points が不正です（3 点以上必要）`);
  }
  const parsedPoints = points.map((p, pi) => {
    if (!isObject(p) || typeof p.x !== 'number' || typeof p.y !== 'number') {
      throw new LayoutParseError(`placed[${index}].points[${pi}] が不正です`);
    }
    return { x: p.x, y: p.y };
  });
  const strokeStyle =
    raw.strokeStyle === 'dashed' || raw.strokeStyle === 'dotted' || raw.strokeStyle === 'solid'
      ? raw.strokeStyle
      : DEFAULT_POLYGON_STYLE.strokeStyle;
  const out: PolygonZone = {
    kind: 'polygon',
    id,
    points: parsedPoints,
    strokeStyle,
    strokeColor:
      typeof raw.strokeColor === 'string' ? raw.strokeColor : DEFAULT_POLYGON_STYLE.strokeColor,
    strokeWidthPx:
      typeof raw.strokeWidthPx === 'number' && raw.strokeWidthPx >= 0
        ? raw.strokeWidthPx
        : DEFAULT_POLYGON_STYLE.strokeWidthPx,
    fillColor: typeof raw.fillColor === 'string' ? raw.fillColor : DEFAULT_POLYGON_STYLE.fillColor,
    fillOpacity:
      typeof raw.fillOpacity === 'number' && raw.fillOpacity >= 0 && raw.fillOpacity <= 1
        ? raw.fillOpacity
        : DEFAULT_POLYGON_STYLE.fillOpacity,
    showCount: typeof raw.showCount === 'boolean' ? raw.showCount : DEFAULT_POLYGON_STYLE.showCount,
  };
  if (typeof raw.label === 'string') out.label = raw.label;
  return out;
};

const parsePlacedItem = (raw: unknown, index: number): PlacedItem => {
  if (!isObject(raw)) {
    throw new LayoutParseError(`placed[${index}] がオブジェクトではありません`);
  }
  if (raw.kind === 'zone') return parsePlacedZone(raw, index);
  if (raw.kind === 'text') return parseTextBlock(raw, index);
  if (raw.kind === 'polygon') return parsePolygonZone(raw, index);
  throw new LayoutParseError(`placed[${index}].kind が不明です: ${String(raw.kind)}`);
};

export const parseLayout = (json: string): LayoutFile => {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new LayoutParseError(
      `JSON のパースに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!isObject(data)) {
    throw new LayoutParseError('レイアウトファイルの形式が不正です（ルートがオブジェクトではありません）');
  }
  if (data.version !== LAYOUT_VERSION) {
    throw new LayoutParseError(
      `未対応のバージョン: ${String(data.version)}（このツールが対応するバージョン: ${LAYOUT_VERSION}）`,
    );
  }
  if (typeof data.scaleRatio !== 'number' || data.scaleRatio <= 0) {
    throw new LayoutParseError('レイアウトファイルの scaleRatio が不正です');
  }

  let background: LayoutFile['background'];
  if (data.background !== undefined && data.background !== null) {
    if (!isObject(data.background)) {
      throw new LayoutParseError('レイアウトファイルの background が不正です');
    }
    const bg = data.background;
    if (
      typeof bg.dataUrl !== 'string' ||
      typeof bg.width !== 'number' ||
      typeof bg.height !== 'number'
    ) {
      throw new LayoutParseError('レイアウトファイルの background の中身が不正です');
    }
    background = { dataUrl: bg.dataUrl, width: bg.width, height: bg.height };
  }

  // zoneList は文字列化して zoneListIO に委譲する
  let zoneList;
  try {
    zoneList = parseZoneList(JSON.stringify(data.zoneList));
  } catch (e) {
    if (e instanceof ZoneListParseError) {
      throw new LayoutParseError(`zoneList が不正です: ${e.message}`);
    }
    throw e;
  }

  if (!Array.isArray(data.placed)) {
    throw new LayoutParseError('レイアウトファイルの placed が配列ではありません');
  }
  const placed = data.placed.map(parsePlacedItem);

  const layout: LayoutFile = {
    version: LAYOUT_VERSION,
    scaleRatio: data.scaleRatio,
    background,
    zoneList,
    placed,
  };
  const residentTypes = parseResidentTypes(data.residentTypes);
  if (residentTypes) layout.residentTypes = residentTypes;
  return layout;
};

export const serializeLayout = (layout: LayoutFile): string => JSON.stringify(layout, null, 2);

export const downloadLayout = (layout: LayoutFile, filename?: string): void => {
  const json = serializeLayout(layout);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `layout${LAYOUT_EXTENSION}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const readLayoutFile = (file: File): Promise<LayoutFile> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        resolve(parseLayout(text));
      } catch (e) {
        reject(e instanceof Error ? e : new LayoutParseError(String(e)));
      }
    };
    reader.onerror = () => reject(new LayoutParseError('ファイル読み込みに失敗しました'));
    reader.readAsText(file);
  });
