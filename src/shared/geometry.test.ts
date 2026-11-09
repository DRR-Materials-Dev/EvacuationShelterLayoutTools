import { describe, expect, it } from 'vitest';
import {
  convexHull,
  getZoneCornersMeters,
  hullAroundZones,
  isZoneFullyInPolygon,
  normalizeDegrees,
  offsetConvexPolygon,
  pointInPolygon,
  rotatePoint,
  rotateZoneAbout,
  type Vec2,
} from './geometry.ts';
import type { PlacedZone } from './types.ts';

const zone = (id: string, x: number, y: number, rotation = 0): PlacedZone => ({
  kind: 'zone',
  id,
  typeId: 't',
  x,
  y,
  rotation,
});
const dims = () => ({ width: 2, height: 1 });
const close = (a: Vec2, b: Vec2) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe('凸包', () => {
  it('内側の点と一直線上の点を除く', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 0 }, // 辺上
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 1, y: 1 }, // 内側
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ]),
    );
  });
});

describe('外側へのオフセット', () => {
  it('正方形を margin だけ広げる（向きによらない）', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    for (const poly of [sq, [...sq].reverse()]) {
      const out = offsetConvexPolygon(poly, 0.5);
      const xs = out.map((p) => p.x).sort((a, b) => a - b);
      const ys = out.map((p) => p.y).sort((a, b) => a - b);
      expect(xs[0]).toBeCloseTo(-0.5);
      expect(xs[3]).toBeCloseTo(2.5);
      expect(ys[0]).toBeCloseTo(-0.5);
      expect(ys[3]).toBeCloseTo(2.5);
    }
  });
});

describe('区画を囲むゾーン', () => {
  it('回転した区画を含め、すべての区画が完全に内包され、余白が取れている', () => {
    const zones = [zone('a', 0, 0), zone('b', 5, 3, 30), zone('c', 1, 6, 90), zone('d', 3, 2, 45)];
    const margin = 0.2;
    const hull = hullAroundZones(zones, dims, margin);
    expect(hull.length).toBeGreaterThanOrEqual(3);
    for (const z of zones) {
      expect(isZoneFullyInPolygon(z, 2, 1, hull)).toBe(true);
    }
    // 余白: どの区画の角も、ゾーンのどの辺（直線）からも margin 以上内側にある
    const lineDist = (p: Vec2, a: Vec2, b: Vec2) =>
      Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);
    for (const z of zones) {
      for (const c of getZoneCornersMeters(z, 2, 1)) {
        hull.forEach((a, i) => {
          expect(lineDist(c, a, hull[(i + 1) % hull.length])).toBeGreaterThanOrEqual(margin - 1e-5); // 頂点は 1μm 単位で丸める
        });
      }
    }
    // 余白: 全区画の角の外接矩形から margin 外へ広がっている
    const corners = zones.flatMap((z) => getZoneCornersMeters(z, 2, 1));
    const minX = Math.min(...corners.map((c) => c.x));
    const hullMinX = Math.min(...hull.map((p) => p.x));
    expect(minX - hullMinX).toBeGreaterThanOrEqual(margin - 1e-5); // 頂点は 1μm 単位で丸める
    expect(minX - hullMinX).toBeLessThanOrEqual(margin * Math.SQRT2 + 1e-9);
  });

  it('余白 1cm でも内包判定に入る（線上に乗らない）', () => {
    const zones = [zone('a', 0, 0), zone('b', 3, 0)];
    const hull = hullAroundZones(zones, dims, 0.01);
    for (const z of zones) expect(isZoneFullyInPolygon(z, 2, 1, hull)).toBe(true);
  });

  it('ゾーンの外の点は含まない', () => {
    const hull = hullAroundZones([zone('a', 0, 0), zone('b', 3, 0)], dims, 0.2);
    expect(pointInPolygon({ x: 2.5, y: 2 }, hull)).toBe(false);
  });
});

describe('回転', () => {
  it('角度を 0〜360 に正規化する', () => {
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-15)).toBe(345);
    expect(normalizeDegrees(359.9999999)).toBe(0);
  });

  it('点を中心まわりに回す（画面座標で時計回りが正）', () => {
    close(rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 90), { x: 0, y: 1 });
    close(rotatePoint({ x: 3, y: 2 }, { x: 2, y: 2 }, 180), { x: 1, y: 2 });
  });

  it('区画を回すと、4 隅が中心まわりに回した位置になる', () => {
    const z = zone('a', 1, 2, 20);
    const center = { x: 4, y: 4 };
    const r = rotateZoneAbout(z, center, 35);
    const moved: PlacedZone = { ...z, ...r };
    const expected = getZoneCornersMeters(z, 2, 1).map((c) => rotatePoint(c, center, 35));
    getZoneCornersMeters(moved, 2, 1).forEach((c, i) => close(c, expected[i]));
    expect(r.rotation).toBeCloseTo(55);
  });
});
