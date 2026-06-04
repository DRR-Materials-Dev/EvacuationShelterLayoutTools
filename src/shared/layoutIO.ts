import type {
  Floor,
  LayoutFile,
  PlacedItem,
  PlacedZone,
  PolygonZone,
  ResidentType,
  TextBlock,
} from './types.ts';
import { DEFAULT_POLYGON_STYLE, DEFAULT_RESIDENT_TYPES } from './constants.ts';
import { parseZoneList, ZoneListParseError } from './zoneListIO.ts';

export const LAYOUT_VERSION = 2;
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

const parseBackground = (raw: unknown): Floor['background'] => {
  if (raw === undefined || raw === null) return undefined;
  if (!isObject(raw)) {
    throw new LayoutParseError('background が不正です');
  }
  if (typeof raw.dataUrl !== 'string' || typeof raw.width !== 'number' || typeof raw.height !== 'number') {
    throw new LayoutParseError('background の中身が不正です');
  }
  return { dataUrl: raw.dataUrl, width: raw.width, height: raw.height };
};

const parseFloor = (raw: unknown, index: number): Floor => {
  if (!isObject(raw)) {
    throw new LayoutParseError(`floors[${index}] がオブジェクトではありません`);
  }
  if (typeof raw.scaleRatio !== 'number' || raw.scaleRatio <= 0) {
    throw new LayoutParseError(`floors[${index}].scaleRatio が不正です`);
  }
  if (!Array.isArray(raw.placed)) {
    throw new LayoutParseError(`floors[${index}].placed が配列ではありません`);
  }
  const floor: Floor = {
    id: typeof raw.id === 'string' ? raw.id : `floor-${Date.now()}-${index}`,
    name: typeof raw.name === 'string' ? raw.name : `${index + 1}F`,
    scaleRatio: raw.scaleRatio,
    placed: raw.placed.map(parsePlacedItem),
  };
  const bg = parseBackground(raw.background);
  if (bg) floor.background = bg;
  return floor;
};

const parseZoneListField = (raw: unknown) => {
  try {
    return parseZoneList(JSON.stringify(raw));
  } catch (e) {
    if (e instanceof ZoneListParseError) {
      throw new LayoutParseError(`zoneList が不正です: ${e.message}`);
    }
    throw e;
  }
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

  const zoneList = parseZoneListField(data.zoneList);
  const residentTypes = parseResidentTypes(data.residentTypes) ?? DEFAULT_RESIDENT_TYPES;

  // version 1（単一階層）→ version 2（複数階層）へ変換
  if (data.version === 1) {
    if (typeof data.scaleRatio !== 'number' || data.scaleRatio <= 0) {
      throw new LayoutParseError('レイアウトファイルの scaleRatio が不正です');
    }
    if (!Array.isArray(data.placed)) {
      throw new LayoutParseError('レイアウトファイルの placed が配列ではありません');
    }
    const floor: Floor = {
      id: `floor-${Date.now()}-0`,
      name: '1F',
      scaleRatio: data.scaleRatio,
      placed: data.placed.map(parsePlacedItem),
    };
    const bg = parseBackground(data.background);
    if (bg) floor.background = bg;
    return {
      version: LAYOUT_VERSION,
      zoneListName: zoneList.name,
      residentTypes,
      zoneList,
      floors: [floor],
    };
  }

  if (data.version === LAYOUT_VERSION) {
    if (!Array.isArray(data.floors) || data.floors.length === 0) {
      throw new LayoutParseError('レイアウトファイルの floors が不正です（1 つ以上必要）');
    }
    return {
      version: LAYOUT_VERSION,
      zoneListName: typeof data.zoneListName === 'string' ? data.zoneListName : zoneList.name,
      residentTypes,
      zoneList,
      floors: data.floors.map(parseFloor),
    };
  }

  throw new LayoutParseError(
    `未対応のバージョン: ${String(data.version)}（このツールが対応するバージョン: ${LAYOUT_VERSION}）`,
  );
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
