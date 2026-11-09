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

/* ---------- 囲むゾーン・回転（v2.8.0、設計書 §15） ---------- */

const cross = (o: Vec2, a: Vec2, b: Vec2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/**
 * 凸包（Andrew の monotone chain）。一直線上の点は除く。3 点未満になる場合はそのまま返す。
 */
export const convexHull = (points: Vec2[]): Vec2[] => {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const EPS = 1e-12;
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= EPS) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= EPS) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

/**
 * 凸多角形を外側へ margin だけ広げる（各辺を法線方向へ平行移動し、隣り合う辺の交点を頂点にする）。
 * 区画の凸包は内角が 90° 以上なので、角の張り出しは最大でも margin×√2 に収まる。
 */
export const offsetConvexPolygon = (polygon: Vec2[], margin: number): Vec2[] => {
  const n = polygon.length;
  if (n < 3 || margin === 0) return polygon.map((p) => ({ ...p }));
  const c = polygonCentroid(polygon);
  // 各辺を外向き法線方向へ動かした直線（点 p と方向 d）
  const lines = polygon.map((a, i) => {
    const b = polygon[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = dy / len;
    let ny = -dx / len;
    const mx = (a.x + b.x) / 2 - c.x;
    const my = (a.y + b.y) / 2 - c.y;
    if (nx * mx + ny * my < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { p: { x: a.x + nx * margin, y: a.y + ny * margin }, d: { x: dx, y: dy } };
  });
  // 頂点 i は「辺 i-1」と「辺 i」の交点
  return polygon.map((_v, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const det = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
    if (Math.abs(det) < 1e-12) return { x: l2.p.x, y: l2.p.y }; // 平行（凸包では起きない）
    const t = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / det;
    return { x: l1.p.x + l1.d.x * t, y: l1.p.y + l1.d.y * t };
  });
};

/** 区画群をすべて囲む凸形のゾーンの頂点（区画の 4 隅の凸包を margin だけ外へ広げる）。 */
export const hullAroundZones = (
  zones: PlacedZone[],
  dims: (zone: PlacedZone) => { width: number; height: number },
  margin: number,
): Vec2[] => {
  const corners = zones.flatMap((z) => {
    const { width, height } = dims(z);
    return getZoneCornersMeters(z, width, height);
  });
  return offsetConvexPolygon(convexHull(corners), margin).map((p) => ({
    x: roundMeters(p.x),
    y: roundMeters(p.y),
  }));
};

/** 座標（m）の計算誤差を 1μm 単位で丸める（保存ファイルに 1.7999999999999998 のような値を残さない）。 */
export const roundMeters = (v: number): number => Math.round(v * 1e6) / 1e6;

/** 角度を [0, 360) に正規化する（小数誤差も丸める）。 */
export const normalizeDegrees = (deg: number): number => {
  const r = ((deg % 360) + 360) % 360;
  const rounded = Math.round(r * 1e6) / 1e6;
  return rounded === 360 ? 0 : rounded;
};

/** 点 p を center のまわりに deg 度回転する（画面座標＝y 下向き、Konva と同じ向き）。 */
export const rotatePoint = (p: Vec2, center: Vec2, deg: number): Vec2 => {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
};

/** 区画を center のまわりに deg 度回転したときの位置（左上原点）と角度。 */
export const rotateZoneAbout = (
  zone: PlacedZone,
  center: Vec2,
  deg: number,
): { x: number; y: number; rotation: number } => {
  const o = rotatePoint({ x: zone.x, y: zone.y }, center, deg);
  return { x: o.x, y: o.y, rotation: normalizeDegrees(zone.rotation + deg) };
};
