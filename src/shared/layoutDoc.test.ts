import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  CAPTURE_TIMEOUT_MS,
  HISTORY_LIMIT,
  createLayoutDoc,
  type LayoutDoc,
  type LayoutSnapshot,
} from './layoutDoc.ts';
import type { Floor, PlacedZone, ResidentType, ZoneList } from './types.ts';

const zone = (id: string, x = 0, y = 0): PlacedZone => ({
  kind: 'zone',
  id,
  typeId: 'type-a',
  x,
  y,
  rotation: 0,
});

const floor = (id: string, name: string, placed: Floor['placed'] = []): Floor => ({
  id,
  name,
  scaleRatio: 50,
  placed,
});

const zoneList = (name: string): ZoneList => ({ name, zones: [] }) as unknown as ZoneList;

const residentTypes: ResidentType[] = [
  { id: 'rt-1', name: '一般' },
  { id: 'rt-2', name: '要配慮' },
] as unknown as ResidentType[];

const initial = (): LayoutSnapshot => ({
  floors: [floor('f1', '1F', [zone('z1', 1, 1), zone('z2', 2, 2)]), floor('f2', '2F')],
  zoneList: zoneList('標準'),
  zoneListName: '標準',
  residentTypes,
});

const placedOf = (ld: LayoutDoc, floorId: string) =>
  ld.getSnapshot().floors.find((f) => f.id === floorId)?.placed ?? [];

const zoneOf = (ld: LayoutDoc, floorId: string, id: string) =>
  placedOf(ld, floorId).find((p) => p.id === id) as PlacedZone | undefined;

const floorNames = (ld: LayoutDoc) => ld.getSnapshot().floors.map((f) => f.name);

/** 2 つの端末をつなぐ（片方の更新をもう片方へ 'remote' origin で届ける）。 */
const link = (a: LayoutDoc, b: LayoutDoc): void => {
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc), 'remote');
  Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc), 'remote');
  a.doc.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') Y.applyUpdate(b.doc, u, 'remote');
  });
  b.doc.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') Y.applyUpdate(a.doc, u, 'remote');
  });
};

const docs: LayoutDoc[] = [];
const make = (): LayoutDoc => {
  const ld = createLayoutDoc();
  docs.push(ld);
  return ld;
};

afterEach(() => {
  while (docs.length) docs.pop()?.destroy();
});

describe('文書とスナップショット', () => {
  it('シードした内容がそのままスナップショットになる', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    const snap = ld.getSnapshot();
    expect(snap.floors.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(placedOf(ld, 'f1').map((p) => p.id)).toEqual(['z1', 'z2']);
    expect(snap.zoneListName).toBe('標準');
    expect(snap.residentTypes).toEqual(residentTypes);
    expect(ld.isInitialized()).toBe(true);
  });

  it('初期化済みの文書には再シードしない', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.seedIfEmpty({ ...initial(), floors: [floor('fx', 'X')] });
    expect(floorNames(ld)).toEqual(['1F', '2F']);
  });

  it('シードと全体置き換えは元に戻すの対象にならない', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    expect(ld.getHistoryState().canUndo).toBe(false);
    ld.replaceDocument({ ...initial(), floors: [floor('f9', '9F')] });
    expect(ld.getHistoryState().canUndo).toBe(false);
    expect(floorNames(ld)).toEqual(['9F']);
  });

  it('undefined の属性はキーを消す', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.updatePlaced('f1', 'z1', { showName: true } as Partial<PlacedZone>);
    expect(zoneOf(ld, 'f1', 'z1')?.showName).toBe(true);
    ld.updatePlaced('f1', 'z1', { showName: undefined } as Partial<PlacedZone>);
    expect(zoneOf(ld, 'f1', 'z1')).not.toHaveProperty('showName');
  });

  it('人数は 0 以下を除き、全種類 0 ならキーを消す', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.setZoneResidents('f1', 'z1', { 'rt-1': 3, 'rt-2': 0 });
    expect(zoneOf(ld, 'f1', 'z1')?.residents).toEqual({ 'rt-1': 3 });
    ld.setZoneResidents('f1', 'z1', { 'rt-1': 0 });
    expect(zoneOf(ld, 'f1', 'z1')).not.toHaveProperty('residents');
  });

  it('居住者種類を減らすと、その種類の人数が全階層から消える', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.setZoneResidents('f1', 'z1', { 'rt-1': 3, 'rt-2': 2 });
    ld.setResidentTypes([residentTypes[0]]);
    expect(zoneOf(ld, 'f1', 'z1')?.residents).toEqual({ 'rt-1': 3 });
    ld.undo();
    expect(ld.getSnapshot().residentTypes).toEqual(residentTypes);
    expect(zoneOf(ld, 'f1', 'z1')?.residents).toEqual({ 'rt-1': 3, 'rt-2': 2 });
  });

  it('階層は最低 1 つ残す', () => {
    const ld = make();
    ld.seedIfEmpty({ ...initial(), floors: [floor('f1', '1F')] });
    ld.removeFloor('f1');
    expect(floorNames(ld)).toEqual(['1F']);
  });

  it('追加した階層は末尾に「(階層数+1)F」で入る', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    const id = ld.addFloor();
    const snap = ld.getSnapshot();
    expect(snap.floors.at(-1)?.id).toBe(id);
    expect(snap.floors.at(-1)?.name).toBe('3F');
  });

  it('全削除で配置物と背景が消える', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.setBackground('f1', { dataUrl: 'data:,', width: 10, height: 10 });
    ld.clearFloor('f1');
    const f1 = ld.getSnapshot().floors[0];
    expect(f1.placed).toEqual([]);
    expect(f1).not.toHaveProperty('background');
    ld.undo();
    expect(placedOf(ld, 'f1')).toHaveLength(2);
    expect(ld.getSnapshot().floors[0].background?.width).toBe(10);
  });
});

describe('元に戻す・やり直し', () => {
  it('配置を取り消し、やり直せる', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    const id = ld.addPlacedZone('f1', 'type-a', 5, 5);
    expect(placedOf(ld, 'f1')).toHaveLength(3);
    expect(ld.undo()).not.toBeNull();
    expect(placedOf(ld, 'f1').some((p) => p.id === id)).toBe(false);
    expect(ld.redo()).not.toBeNull();
    expect(placedOf(ld, 'f1').some((p) => p.id === id)).toBe(true);
  });

  it('削除を取り消すと、同じ ID・属性で戻る', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.setZoneResidents('f1', 'z1', { 'rt-1': 4 });
    ld.removeItems('f1', ['z1', 'z2']);
    expect(placedOf(ld, 'f1')).toEqual([]);
    ld.undo();
    expect(placedOf(ld, 'f1').map((p) => p.id).sort()).toEqual(['z1', 'z2']);
    expect(zoneOf(ld, 'f1', 'z1')?.residents).toEqual({ 'rt-1': 4 });
  });

  it('一括移動は 1 回で戻る', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.updatePlacedMany('f1', [
      { id: 'z1', attrs: { x: 10 } },
      { id: 'z2', attrs: { x: 20 } },
    ]);
    ld.undo();
    expect(zoneOf(ld, 'f1', 'z1')?.x).toBe(1);
    expect(zoneOf(ld, 'f1', 'z2')?.x).toBe(2);
    expect(ld.getHistoryState().canUndo).toBe(false);
  });

  it('区切りのある操作は、続けて行っても別々に戻る', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.updatePlaced('f1', 'z1', { x: 10 });
    ld.updatePlaced('f1', 'z1', { x: 20 });
    ld.undo();
    expect(zoneOf(ld, 'f1', 'z1')?.x).toBe(10);
    ld.undo();
    expect(zoneOf(ld, 'f1', 'z1')?.x).toBe(1);
  });

  it('merge の変更は短時間なら 1 件にまとまり、時間が空けば別になる', async () => {
    // UndoManager（lib0）は読込時に Date.now を保持するため偽の時計が効かない。実際に待つ。
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.setZoneResidents('f1', 'z1', { 'rt-1': 1 }, { merge: true });
    ld.setZoneResidents('f1', 'z1', { 'rt-1': 12 }, { merge: true });
    await new Promise((r) => setTimeout(r, CAPTURE_TIMEOUT_MS + 100));
    ld.setZoneResidents('f1', 'z1', { 'rt-1': 15 }, { merge: true });
    ld.undo();
    expect(zoneOf(ld, 'f1', 'z1')?.residents).toEqual({ 'rt-1': 12 });
    ld.undo();
    expect(zoneOf(ld, 'f1', 'z1')).not.toHaveProperty('residents');
  });

  it('まとめるのは同じ対象への merge が続いたときだけ', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    // ドラッグ（区切りあり）の直後に、同じ区画の人数入力（merge）→ 別々の履歴
    ld.updatePlaced('f1', 'z1', { x: 10 });
    ld.setZoneResidents('f1', 'z1', { 'rt-1': 3 }, { merge: true });
    // 別の区画への merge → これも別の履歴
    ld.setZoneResidents('f1', 'z2', { 'rt-1': 5 }, { merge: true });
    ld.undo();
    expect(zoneOf(ld, 'f1', 'z2')).not.toHaveProperty('residents');
    expect(zoneOf(ld, 'f1', 'z1')?.residents).toEqual({ 'rt-1': 3 });
    ld.undo();
    expect(zoneOf(ld, 'f1', 'z1')).not.toHaveProperty('residents');
    expect(zoneOf(ld, 'f1', 'z1')?.x).toBe(10);
    ld.undo();
    expect(zoneOf(ld, 'f1', 'z1')?.x).toBe(1);
  });

  it('区画リストの変更は元に戻すの対象外', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.setZoneList(zoneList('改'), '改');
    expect(ld.getHistoryState().canUndo).toBe(false);
    expect(ld.getSnapshot().zoneListName).toBe('改');
  });

  it('区画リストの差し替え・全体置き換えで履歴が消える', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.addPlacedZone('f1', 'type-a', 5, 5);
    ld.replaceZoneListClearPlaced(zoneList('新'), '新');
    expect(ld.getHistoryState()).toEqual({ canUndo: false, canRedo: false });
    expect(placedOf(ld, 'f1')).toEqual([]);

    ld.addPlacedZone('f1', 'type-a', 5, 5);
    ld.replaceDocument(initial());
    expect(ld.getHistoryState()).toEqual({ canUndo: false, canRedo: false });
  });

  it(`履歴は ${HISTORY_LIMIT} 件まで`, () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) ld.updatePlaced('f1', 'z1', { x: 100 + i });
    let n = 0;
    while (ld.undo()) n++;
    expect(n).toBe(HISTORY_LIMIT);
    expect(zoneOf(ld, 'f1', 'z1')?.x).toBe(105);
  });

  it('履歴の変化が通知される', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    const states: unknown[] = [];
    const off = ld.onHistoryChange((s) => states.push(s));
    ld.addPlacedZone('f1', 'type-a', 5, 5);
    ld.undo();
    ld.clearHistory();
    off();
    expect(states).toEqual([
      { canUndo: true, canRedo: false },
      { canUndo: false, canRedo: true },
      { canUndo: false, canRedo: false },
    ]);
  });
});

describe('履歴に記録する画面の状態', () => {
  it('操作の直前の階層と選択が、取り消し・やり直しで返る', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    let view = { floorId: 'f1', selectedIds: ['z1', 'z2'], innerZoneId: null as string | null };
    ld.setViewProvider(() => view);
    ld.removeItems('f1', ['z1', 'z2']);
    // 削除後の画面（選択なし・2F 表示）で取り消す
    view = { floorId: 'f2', selectedIds: [], innerZoneId: null };
    expect(ld.undo()?.view).toEqual({ floorId: 'f1', selectedIds: ['z1', 'z2'], innerZoneId: null });
    // 取り消した直後（1F・2 件選択）の画面がやり直しに記録される
    view = { floorId: 'f1', selectedIds: ['z1', 'z2'], innerZoneId: null };
    expect(ld.redo()?.view).toEqual({ floorId: 'f2', selectedIds: [], innerZoneId: null });
  });

  it('記録元が無ければ view は null、戻すものが無ければ結果は null', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    expect(ld.undo()).toBeNull();
    ld.addPlacedZone('f1', 'type-a', 1, 1);
    expect(ld.undo()).toEqual({ view: null });
  });

  it('まとめられた変更は最初の記録を保つ', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    let view = { floorId: 'f1', selectedIds: ['z1'], innerZoneId: null as string | null };
    ld.setViewProvider(() => view);
    ld.setZoneResidents('f1', 'z1', { 'rt-1': 1 }, { merge: true });
    view = { floorId: 'f1', selectedIds: ['z2'], innerZoneId: null };
    ld.setZoneResidents('f1', 'z1', { 'rt-1': 2 }, { merge: true });
    expect(ld.undo()?.view?.selectedIds).toEqual(['z1']);
  });
});

describe('階層の並べ替え（order）', () => {
  it('入れ替えて取り消せる', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.addFloor();
    ld.moveFloor('f1', 1);
    expect(floorNames(ld)).toEqual(['2F', '1F', '3F']);
    ld.moveFloor('f1', 1);
    expect(floorNames(ld)).toEqual(['2F', '3F', '1F']);
    ld.undo();
    ld.undo();
    expect(floorNames(ld)).toEqual(['1F', '2F', '3F']);
  });

  it('端では動かない', () => {
    const ld = make();
    ld.seedIfEmpty(initial());
    ld.moveFloor('f1', -1);
    ld.moveFloor('f2', 1);
    expect(floorNames(ld)).toEqual(['1F', '2F']);
    expect(ld.getHistoryState().canUndo).toBe(false);
  });

  it('order の無い古い文書は配列の順で並び、並べ替えもできる', () => {
    const ld = make();
    const arr = ld.doc.getArray<Y.Map<unknown>>('floors');
    ld.doc.transact(() => {
      for (const [id, name] of [
        ['a', 'A'],
        ['b', 'B'],
        ['c', 'C'],
      ]) {
        const m = new Y.Map<unknown>();
        m.set('id', id);
        m.set('name', name);
        m.set('scaleRatio', 50);
        m.set('placed', new Y.Array());
        arr.push([m]);
      }
    });
    expect(floorNames(ld)).toEqual(['A', 'B', 'C']);
    ld.moveFloor('c', -1);
    expect(floorNames(ld)).toEqual(['A', 'C', 'B']);
    const added = ld.addFloor();
    expect(ld.getSnapshot().floors.at(-1)?.id).toBe(added);
  });
});

describe('マルチ操作（2 端末）', () => {
  const pair = (): [LayoutDoc, LayoutDoc] => {
    const a = make();
    const b = make();
    a.seedIfEmpty(initial());
    link(a, b);
    return [a, b];
  };

  it('変更が相手に届き、相手の履歴には入らない', () => {
    const [a, b] = pair();
    a.updatePlaced('f1', 'z1', { x: 50 });
    expect(zoneOf(b, 'f1', 'z1')?.x).toBe(50);
    expect(b.getHistoryState().canUndo).toBe(false);
  });

  it('取り消すのは自分の操作だけ', () => {
    const [a, b] = pair();
    a.updatePlaced('f1', 'z1', { x: 50 });
    b.updatePlaced('f1', 'z2', { x: 60 });
    a.undo();
    expect(zoneOf(a, 'f1', 'z1')?.x).toBe(1);
    expect(zoneOf(a, 'f1', 'z2')?.x).toBe(60);
    expect(zoneOf(b, 'f1', 'z1')?.x).toBe(1);
  });

  it('並べ替えを取り消しても、その間の相手の編集は残る', () => {
    const [a, b] = pair();
    a.moveFloor('f1', 1);
    b.updatePlaced('f1', 'z1', { x: 77 });
    a.undo();
    expect(floorNames(a)).toEqual(['1F', '2F']);
    expect(zoneOf(a, 'f1', 'z1')?.x).toBe(77);
    expect(zoneOf(b, 'f1', 'z1')?.x).toBe(77);
  });

  it('相手が削除した配置物への操作を取り消しても壊れない', () => {
    const [a, b] = pair();
    a.updatePlaced('f1', 'z1', { x: 50 });
    b.removeItem('f1', 'z1');
    a.undo();
    expect(zoneOf(a, 'f1', 'z1')).toBeUndefined();
    expect(zoneOf(b, 'f1', 'z1')).toBeUndefined();
  });

  it('相手の全体置き換えで自分の履歴も消える', () => {
    const [a, b] = pair();
    b.addPlacedZone('f1', 'type-a', 5, 5);
    expect(b.getHistoryState().canUndo).toBe(true);
    a.replaceDocument({ ...initial(), floors: [floor('f9', '9F')] });
    expect(b.getHistoryState().canUndo).toBe(false);
    expect(floorNames(b)).toEqual(['9F']);
  });
});
