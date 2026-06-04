/**
 * 幾何計算ユーティリティ。
 * ゾーン（多角形）内の区画判定・居住者カウントに使用する（設計書 §8.1.4）。
 * 座標はすべてメートル単位。
 */
import type { PlacedZone, PolygonZone } from './types.ts';

export type Vec2 = { x: number; y: number };

/** 点 pt が多角形 polygon の内部にあるか（ray-casting 法）。辺上はおおむね内部扱い。 */
export const pointInPolygon = (pt: Vec2, polygon: Vec2[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

/** 多角形の重心（頂点平均）。カウントラベルの表示位置に使用。 */
export const polygonCentroid = (polygon: Vec2[]): Vec2 => {
  if (polygon.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of polygon) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / polygon.length, y: sy / polygon.length };
};

/**
 * 配置済み区画の 4 隅（回転後・メートル座標）。
 * 区画は (x, y) を左上原点として rotation 度だけ原点まわりに回転して描画される
 * （Canvas の Group と同じ規約）。
 */
export const getZoneCornersMeters = (
  zone: PlacedZone,
  width: number,
  height: number,
): Vec2[] => {
  const rad = (zone.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const local: Vec2[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  return local.map((p) => ({
    x: zone.x + (p.x * cos - p.y * sin),
    y: zone.y + (p.x * sin + p.y * cos),
  }));
};

/** 区画（4 隅すべて）が多角形に完全に内包されるか。 */
export const isZoneFullyInPolygon = (
  zone: PlacedZone,
  width: number,
  height: number,
  polygon: Vec2[],
): boolean => {
  if (polygon.length < 3) return false;
  const corners = getZoneCornersMeters(zone, width, height);
  return corners.every((c) => pointInPolygon(c, polygon));
};

/**
 * 多角形ゾーンに完全内包される区画の居住者人数を、種類別に集計する。
 * dims は区画の寸法（メートル）を返す関数（タイプ既定値を考慮するため呼び出し側で解決）。
 * 戻り値: { byType: 種類ID -> 人数, total: 合計 }
 */
export const residentsInPolygon = (
  polygon: PolygonZone,
  zones: PlacedZone[],
  dims: (zone: PlacedZone) => { width: number; height: number },
): { byType: Record<string, number>; total: number } => {
  const byType: Record<string, number> = {};
  let total = 0;
  for (const zone of zones) {
    if (!zone.residents) continue;
    const { width, height } = dims(zone);
    if (!isZoneFullyInPolygon(zone, width, height, polygon.points)) continue;
    for (const [typeId, n] of Object.entries(zone.residents)) {
      if (n > 0) {
        byType[typeId] = (byType[typeId] ?? 0) + n;
        total += n;
      }
    }
  }
  return { byType, total };
};
