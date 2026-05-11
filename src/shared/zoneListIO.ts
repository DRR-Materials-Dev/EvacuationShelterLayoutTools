import type { ZoneList, ZoneType, ImageFitMode } from './types.ts';

export const ZONE_LIST_VERSION = 1;
export const ZONE_LIST_EXTENSION = '.list.json';

export class ZoneListParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZoneListParseError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const FIT_MODES: ReadonlySet<ImageFitMode> = new Set<ImageFitMode>(['fill', 'contain', 'manual']);

const parseZone = (raw: unknown, index: number): ZoneType => {
  if (!isObject(raw)) {
    throw new ZoneListParseError(`zones[${index}] がオブジェクトではありません`);
  }
  const id = raw.id;
  const name = raw.name;
  const width = raw.width;
  const height = raw.height;
  const color = raw.color;
  const resizable = raw.resizable;

  if (typeof id !== 'string' || id.length === 0) {
    throw new ZoneListParseError(`zones[${index}].id が不正です`);
  }
  if (typeof name !== 'string') {
    throw new ZoneListParseError(`zones[${index}].name が不正です`);
  }
  if (typeof width !== 'number' || width <= 0) {
    throw new ZoneListParseError(`zones[${index}].width が不正です`);
  }
  if (typeof height !== 'number' || height <= 0) {
    throw new ZoneListParseError(`zones[${index}].height が不正です`);
  }
  if (typeof color !== 'string') {
    throw new ZoneListParseError(`zones[${index}].color が不正です`);
  }
  if (typeof resizable !== 'boolean') {
    throw new ZoneListParseError(`zones[${index}].resizable が不正です`);
  }

  const zone: ZoneType = { id, name, width, height, color, resizable };

  if (raw.showName !== undefined) {
    if (typeof raw.showName !== 'boolean') {
      throw new ZoneListParseError(`zones[${index}].showName が不正です`);
    }
    zone.showName = raw.showName;
  }
  if (raw.showBorder !== undefined) {
    if (typeof raw.showBorder !== 'boolean') {
      throw new ZoneListParseError(`zones[${index}].showBorder が不正です`);
    }
    zone.showBorder = raw.showBorder;
  }
  if (raw.borderColor !== undefined) {
    if (typeof raw.borderColor !== 'string') {
      throw new ZoneListParseError(`zones[${index}].borderColor が不正です`);
    }
    zone.borderColor = raw.borderColor;
  }
  if (raw.borderWidthPx !== undefined) {
    if (typeof raw.borderWidthPx !== 'number' || raw.borderWidthPx < 0) {
      throw new ZoneListParseError(`zones[${index}].borderWidthPx が不正です`);
    }
    zone.borderWidthPx = raw.borderWidthPx;
  }

  if (raw.image !== undefined && raw.image !== null) {
    if (!isObject(raw.image)) {
      throw new ZoneListParseError(`zones[${index}].image が不正です`);
    }
    const img = raw.image;
    if (typeof img.dataUrl !== 'string') {
      throw new ZoneListParseError(`zones[${index}].image.dataUrl が不正です`);
    }
    if (typeof img.fitMode !== 'string' || !FIT_MODES.has(img.fitMode as ImageFitMode)) {
      throw new ZoneListParseError(`zones[${index}].image.fitMode が不正です`);
    }
    if (typeof img.rotation !== 'number') {
      throw new ZoneListParseError(`zones[${index}].image.rotation が不正です`);
    }
    zone.image = {
      dataUrl: img.dataUrl,
      fitMode: img.fitMode as ImageFitMode,
      rotation: img.rotation,
      scaleX: typeof img.scaleX === 'number' ? img.scaleX : undefined,
      scaleY: typeof img.scaleY === 'number' ? img.scaleY : undefined,
    };
  }

  return zone;
};

export const parseZoneList = (json: string): ZoneList => {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new ZoneListParseError(
      `JSON のパースに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!isObject(data)) {
    throw new ZoneListParseError('区画リストの形式が不正です（ルートがオブジェクトではありません）');
  }
  if (data.version !== ZONE_LIST_VERSION) {
    throw new ZoneListParseError(
      `未対応のバージョン: ${String(data.version)}（このツールが対応するバージョン: ${ZONE_LIST_VERSION}）`,
    );
  }
  if (typeof data.name !== 'string') {
    throw new ZoneListParseError('区画リストの name が不正です');
  }
  if (!Array.isArray(data.zones)) {
    throw new ZoneListParseError('区画リストの zones が配列ではありません');
  }

  const zones = data.zones.map((z, i) => parseZone(z, i));
  return {
    version: ZONE_LIST_VERSION,
    name: data.name,
    zones,
  };
};

export const serializeZoneList = (list: ZoneList): string => JSON.stringify(list, null, 2);

/**
 * 区画リストを `.list.json` ファイルとしてダウンロードさせる。
 */
export const downloadZoneList = (list: ZoneList, filename?: string): void => {
  const json = serializeZoneList(list);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `${sanitizeFilename(list.name)}${ZONE_LIST_EXTENSION}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * 区画リストファイル (`File`) を読み込んで `ZoneList` を返す。
 */
export const readZoneListFile = (file: File): Promise<ZoneList> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        resolve(parseZoneList(text));
      } catch (e) {
        reject(e instanceof Error ? e : new ZoneListParseError(String(e)));
      }
    };
    reader.onerror = () => reject(new ZoneListParseError('ファイル読み込みに失敗しました'));
    reader.readAsText(file);
  });

const sanitizeFilename = (name: string): string =>
  name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'zones';
