import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import Konva from 'konva';
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Rect,
  Text,
  Group,
  Circle,
  Line,
  Transformer,
  Label,
  Tag,
} from 'react-konva';
import useImage from 'use-image';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Box } from 'konva/lib/shapes/Transformer';
import type { PlacedItem, PlacedZone, PolygonZone, TextBlock, ZoneType } from '../../shared/types.ts';
import type { RemotePresence } from '../../collab/session.ts';
import {
  getZoneBorder,
  getZoneDisplayText,
  getZoneNameAlignH,
  getZoneNameAlignV,
  getZoneNameColor,
  getZoneResidentTotal,
} from '../../shared/types.ts';
import {
  getZoneCornersMeters,
  isZoneFullyInPolygon,
  polygonCentroid,
  residentsInPolygon,
} from '../../shared/geometry.ts';
import ZoneImageKonva from '../../shared/components/ZoneImageKonva.tsx';
import { rotationSnapConfig, snapPoint, snapValue, withSnapInverted } from '../../shared/snap.ts';
import { useUserSettings } from '../../shared/settings.tsx';
import type { LayoutActions, LayoutState } from './useLayoutState.ts';
import type { Point } from './types.ts';
import { copyItems, hasClipboard, pasteItems, translateAttrs } from './clipboard.ts';

/** 入力欄・モーダル内にフォーカスがあるか（キーボードショートカットを無効にする判定）。 */
const isTypingOrInDialog = (): boolean => {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  if (active.tagName === 'INPUT') {
    // ファイル選択・チェックボックス等は文字入力ではないので、ショートカットを止めない
    const type = (active as HTMLInputElement).type;
    return !['file', 'checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(type);
  }
  if (active.tagName === 'TEXTAREA' || active.tagName === 'SELECT') return true;
  if (active.isContentEditable) return true;
  return active.closest('[role="dialog"]') !== null;
};

/** 複数選択のドラッグで、つかんだ配置物以外を追従させるためのハンドラ。 */
type GroupDragHandlers = {
  start: (node: Konva.Node) => void;
  /** invertSnap: Ctrl 押下でスナップの ON/OFF を反転（ドラッグ中も吸着させる） */
  move: (node: Konva.Node, invertSnap: boolean) => void;
  /** invertSnap: Ctrl 押下でスナップの ON/OFF を反転 */
  end: (node: Konva.Node, invertSnap: boolean) => void;
};

/**
 * ドラッグ中のノード位置（world-px）を、メートル単位のスナップへ吸着させる。
 * ドラッグ中に毎回呼ぶことで、離したときではなく動かしている最中から格子に沿って動く。
 */
const snapNodePosition = (
  node: Konva.Node,
  scaleRatio: number,
  settings: ReturnType<typeof useUserSettings>['settings'],
): void => {
  if (!settings.snap.enabled) return;
  const p = snapPoint({ x: node.x() / scaleRatio, y: node.y() / scaleRatio }, settings);
  node.position({ x: p.x * scaleRatio, y: p.y * scaleRatio });
};

/** Konva のポインタイベントから Ctrl（Mac は ⌘）押下を取り出す。 */
const isCtrl = (evt: unknown): boolean => {
  const e = evt as { ctrlKey?: boolean; metaKey?: boolean } | undefined;
  return Boolean(e?.ctrlKey || e?.metaKey);
};

type Props = {
  state: LayoutState;
  actions: LayoutActions;
  onScaleCalibrated: (distancePx: number) => void;
  /** テキスト配置モード中にクリックされたとき、配置先 (メートル座標) を返す */
  onTextPlaceRequested: (xMeters: number, yMeters: number) => void;
  /** テキスト要素をダブルクリックした時、編集モーダルの起動を依頼 */
  onTextEditRequested: (textId: string) => void;
  stageRef: RefObject<Konva.Stage | null>;
  /** マルチ操作：他ユーザーのプレゼンス（カーソル・選択。現在の階層のみ）。 */
  remotePresence?: RemotePresence[];
  /** マルチ操作：ローカルカーソル位置（メートル）を通知。範囲外は null。 */
  onCursorMove?: (meters: Point | null) => void;
  /** ステータスバーへのメッセージ表示（コピー・貼り付け・ゾーン内選択の結果）。 */
  onStatusMessage?: (message: string | null) => void;
  /** 値が変わるたびに、図面全体が見えるようズーム・表示位置を合わせる（レイアウト読込直後）。 */
  fitRequest?: number;
};

const BackgroundImageDisplay = ({
  background,
}: {
  background: { dataUrl: string; width: number; height: number };
}) => {
  const [img] = useImage(background.dataUrl);
  return <KonvaImage image={img} x={0} y={0} width={background.width} height={background.height} />;
};

/** マルチ操作：他ユーザー 1 人ぶんのカーソル＋選択マーカー（world-px 座標、画面上で一定サイズ）。 */
const RemotePresenceMarker = ({
  presence,
  placed,
  typeMap,
  scaleRatio,
  viewScale,
}: {
  presence: RemotePresence;
  placed: PlacedItem[];
  typeMap: Map<string, ZoneType>;
  scaleRatio: number;
  viewScale: number;
}) => {
  const inv = 1 / viewScale; // ズームに依らず画面上で一定サイズに保つ
  const { color, name } = presence.user;

  // 選択中の配置物それぞれに印を付ける（旧バージョンは selectedId のみ送ってくる）
  const ids = presence.selectedIds ?? (presence.selectedId ? [presence.selectedId] : []);
  const selAnchors: { id: string; x: number; y: number }[] = [];
  for (const id of ids) {
    const item = placed.find((it) => it.id === id);
    if (!item) continue;
    if (item.kind === 'polygon') {
      const c = polygonCentroid(item.points);
      selAnchors.push({ id, x: c.x * scaleRatio, y: c.y * scaleRatio });
    } else if (item.kind === 'zone') {
      const t = typeMap.get(item.typeId);
      const w = item.width ?? t?.width ?? 1;
      const h = item.height ?? t?.height ?? 1;
      selAnchors.push({ id, x: (item.x + w / 2) * scaleRatio, y: (item.y + h / 2) * scaleRatio });
    } else {
      selAnchors.push({ id, x: item.x * scaleRatio, y: item.y * scaleRatio });
    }
  }

  const cursor = presence.cursor
    ? { x: presence.cursor.x * scaleRatio, y: presence.cursor.y * scaleRatio }
    : null;

  return (
    <Group listening={false}>
      {selAnchors.map((a) => (
        <Circle
          key={a.id}
          x={a.x}
          y={a.y}
          radius={16 * inv}
          stroke={color}
          strokeWidth={2.5 * inv}
          dash={[7 * inv, 4 * inv]}
        />
      ))}
      {cursor && (
        <>
          <Circle
            x={cursor.x}
            y={cursor.y}
            radius={5 * inv}
            fill={color}
            stroke="#fff"
            strokeWidth={1.5 * inv}
          />
          <Label x={cursor.x + 8 * inv} y={cursor.y + 8 * inv}>
            <Tag fill={color} cornerRadius={3 * inv} />
            <Text text={name} fontSize={12 * inv} fill="#ffffff" padding={3 * inv} />
          </Label>
        </>
      )}
    </Group>
  );
};

const Canvas = ({
  state,
  actions,
  onScaleCalibrated,
  onTextPlaceRequested,
  onTextEditRequested,
  stageRef,
  remotePresence,
  onCursorMove,
  onStatusMessage,
  fitRequest,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorThrottleRef = useRef(0);
  const { settings } = useUserSettings();
  const [size, setSize] = useState({ width: 800, height: 600 });

  // ゾーン作図中の頂点（メートル座標）とカーソル位置（プレビュー線用）
  const [polygonDraft, setPolygonDraft] = useState<Point[]>([]);
  const [cursorMeters, setCursorMeters] = useState<Point | null>(null);

  // 配置済みアイテムを id でルックアップしやすくするマップ（タイプ定義用）
  const typeMap = new Map<string, ZoneType>(state.zoneList.zones.map((z) => [z.id, z]));

  // 区画の寸法（メートル）をタイプ既定値を考慮して解決する
  const zoneDims = useCallback(
    (zone: PlacedZone) => {
      const t = typeMap.get(zone.typeId);
      return {
        width: zone.width ?? t?.width ?? 1,
        height: zone.height ?? t?.height ?? 1,
      };
    },
    // typeMap は毎レンダー新規生成のため zoneList を依存に取る
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.zoneList],
  );

  // 居住者カウント対象の配置済み区画
  const placedZones = state.placed.filter((p): p is PlacedZone => p.kind === 'zone');

  // ゾーン作図を確定する
  const finalizePolygon = useCallback(() => {
    if (polygonDraft.length >= 3) {
      actions.addPolygon(polygonDraft);
    }
    setPolygonDraft([]);
    setCursorMeters(null);
    actions.setIsAddingPolygon(false);
  }, [polygonDraft, actions]);

  // 作図モードが解除されたら下書きをクリア
  useEffect(() => {
    if (!state.isAddingPolygon) {
      setPolygonDraft([]);
      setCursorMeters(null);
    }
  }, [state.isAddingPolygon]);

  // 親コンテナのサイズを監視
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /* ---------- 図面全体が見えるズーム（レイアウト読込直後） ---------- */
  const fitCtxRef = useRef({ state, actions, size, zoneDims });
  fitCtxRef.current = { state, actions, size, zoneDims };
  useEffect(() => {
    if (!fitRequest) return;
    const { state: st, actions: act, size: sz, zoneDims: dims } = fitCtxRef.current;
    // 対象範囲（world-px）: 背景画像があればその全体、なければ配置物の範囲
    let bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
    if (st.background) {
      bounds = { minX: 0, minY: 0, maxX: st.background.width, maxY: st.background.height };
    } else {
      const pts: Point[] = [];
      for (const it of st.placed) {
        if (it.kind === 'zone') {
          const d = dims(it);
          pts.push(...getZoneCornersMeters(it, d.width, d.height));
        } else if (it.kind === 'polygon') {
          pts.push(...it.points);
        } else {
          pts.push({ x: it.x, y: it.y });
        }
      }
      if (pts.length > 0) {
        const xs = pts.map((p) => p.x * st.scaleRatio);
        const ys = pts.map((p) => p.y * st.scaleRatio);
        bounds = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
      }
    }
    if (!bounds) return;
    const w = Math.max(1, bounds.maxX - bounds.minX);
    const h = Math.max(1, bounds.maxY - bounds.minY);
    const margin = 0.95; // 端に少し余白を残す
    const scale = Math.min(10, Math.max(0.1, Math.min((sz.width / w) * margin, (sz.height / h) * margin)));
    act.setViewScale(scale);
    act.setStagePos({
      x: (sz.width - w * scale) / 2 - bounds.minX * scale,
      y: (sz.height - h * scale) / 2 - bounds.minY * scale,
    });
  }, [fitRequest]);

  /* ---------- Ctrl 押下状態（回転中の角度スナップ反転用） ---------- */
  const [ctrlDown, setCtrlDown] = useState(false);
  useEffect(() => {
    const update = (e: KeyboardEvent) => setCtrlDown(e.ctrlKey || e.metaKey);
    const reset = () => setCtrlDown(false);
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
      window.removeEventListener('blur', reset);
    };
  }, []);
  const rotationSnap = rotationSnapConfig(settings, ctrlDown);

  /* ---------- 選択操作 ---------- */

  // 現在の選択に含まれる配置物（存在するもののみ、選択順）
  const placedById = new Map(state.placed.map((p) => [p.id, p]));
  const selectedItems = state.selectedIds
    .map((id) => placedById.get(id))
    .filter((p): p is PlacedItem => p !== undefined);
  const selectedSet = new Set(state.selectedIds);
  // 回転・サイズ変更ハンドルは「1 件だけ選択（ゾーン内選択でない）」のときだけ出す
  const isSingleSelection = state.selectedIds.length === 1 && state.innerZoneId === null;

  /* ---------- Shift+ドラッグの範囲選択 ---------- */

  // 描画中の選択枠（world-px）。null なら非表示。
  const [boxRect, setBoxRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
  // 範囲選択中はステージのパン（ドラッグ移動）を止める
  const boxActiveRef = useRef(false);
  // 範囲選択の直後に Konva が発火する click（選択解除・ゾーン選択）を無視する
  const suppressClickRef = useRef(false);

  const startBoxSelect = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const start = stage.getRelativePointerPosition();
    if (!start) return;
    // Shift+クリックと同じく、区画だけの選択に追加する（ゾーン・テキスト・ゾーン内選択は選び直し）
    const base =
      state.innerZoneId !== null
        ? []
        : state.selectedIds.filter((id) => placedById.get(id)?.kind === 'zone');
    const sr = state.scaleRatio;
    const zones = placedZones;
    const viewScale = state.viewScale;
    let moved = false;
    boxActiveRef.current = true;

    const pointer = (e: MouseEvent): Point | null => {
      stage.setPointersPositions(e);
      return stage.getRelativePointerPosition();
    };
    const onMove = (e: MouseEvent) => {
      const p = pointer(e);
      if (!p) return;
      // 数 px 動くまではただのクリックとして扱う
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) * viewScale < 4) return;
      if (!moved) {
        moved = true;
        suppressClickRef.current = true;
      }
      setBoxRect({ x1: start.x, y1: start.y, x2: p.x, y2: p.y });
    };
    const onUp = (e: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      boxActiveRef.current = false;
      setBoxRect(null);
      // click は mouseup の直後に同期発火するので、少し後で抑止を解除する
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (!moved) return;
      const p = pointer(e) ?? start;
      const minX = Math.min(start.x, p.x) / sr;
      const maxX = Math.max(start.x, p.x) / sr;
      const minY = Math.min(start.y, p.y) / sr;
      const maxY = Math.max(start.y, p.y) / sr;
      // 囲みに完全に収まる区画（回転後の 4 隅すべてが枠内）
      const inside = zones
        .filter((z) => {
          const d = zoneDims(z);
          return getZoneCornersMeters(z, d.width, d.height).every(
            (c) => c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY,
          );
        })
        .map((z) => z.id);
      const added = inside.filter((id) => !base.includes(id));
      actions.setSelection([...base, ...added]);
      onStatusMessage?.(`範囲選択: 区画 ${added.length} 件を追加（選択中 ${base.length + added.length} 件）`);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Shift+ドラッグで範囲選択を始めてよい状態か（配置・作図・縮尺のモード中は不可）
  const canBoxSelect = !state.isScaleMode && !state.isAddingText && !state.isAddingPolygon;

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (!e.evt.shiftKey || e.evt.button !== 0 || !canBoxSelect) return;
    const stage = stageRef.current;
    const t = e.target;
    const isEmpty = t === stage;
    const isBg = t.getParent()?.name() === 'background-layer';
    if (isEmpty || isBg) startBoxSelect();
  };

  const handleItemClick = (item: PlacedItem, shiftKey: boolean) => {
    if (suppressClickRef.current) return;
    if (item.kind === 'zone') {
      if (!shiftKey) {
        actions.setSelectedId(item.id);
        return;
      }
      // Shift+クリック: 区画だけの複数選択に追加 / 解除。
      // ゾーン・テキスト・ゾーン内選択が選ばれていた場合は、その区画から選び直す。
      const base =
        state.innerZoneId !== null
          ? []
          : state.selectedIds.filter((id) => placedById.get(id)?.kind === 'zone');
      const next = base.includes(item.id) ? base.filter((id) => id !== item.id) : [...base, item.id];
      actions.setSelection(next);
      return;
    }
    if (item.kind === 'text') {
      // テキストは複数選択しない（Shift でも単体選択）
      actions.setSelectedId(item.id);
      return;
    }
    // ゾーン: 複数選択しない。選択中のゾーンを再クリックでゾーン内選択 / ゾーンのみ を切り替え
    if (state.innerZoneId === item.id) {
      actions.setSelectedId(item.id);
      onStatusMessage?.(null);
      return;
    }
    if (state.selectedIds.length === 1 && state.selectedIds[0] === item.id) {
      const inner = placedZones
        .filter((z) => {
          const d = zoneDims(z);
          return isZoneFullyInPolygon(z, d.width, d.height, item.points);
        })
        .map((z) => z.id);
      actions.setSelection([item.id, ...inner], item.id);
      onStatusMessage?.(`ゾーン内選択: 区画 ${inner.length} 件`);
      return;
    }
    actions.setSelectedId(item.id);
  };

  /* ---------- 複数選択のまとめてドラッグ ---------- */

  // 配置物の Konva ノード位置（world-px）。ゾーン（多角形）は Group 原点 (0,0) で描画している。
  const nodeOrigin = (item: PlacedItem): Point =>
    item.kind === 'polygon'
      ? { x: 0, y: 0 }
      : { x: item.x * state.scaleRatio, y: item.y * state.scaleRatio };

  const groupDragRef = useRef<{
    leaderStart: Point;
    others: { node: Konva.Node; start: Point }[];
  } | null>(null);

  const findNode = (id: string): Konva.Node | undefined =>
    stageRef.current?.findOne((n: Konva.Node) => n.id() === id) ?? undefined;

  const makeGroupDrag = (leader: PlacedItem): GroupDragHandlers | undefined => {
    if (state.selectedIds.length < 2 || !selectedSet.has(leader.id)) return undefined;
    return {
      start: () => {
        const others: { node: Konva.Node; start: Point }[] = [];
        for (const it of selectedItems) {
          if (it.id === leader.id) continue;
          const node = findNode(it.id);
          if (node) others.push({ node, start: nodeOrigin(it) });
        }
        groupDragRef.current = { leaderStart: nodeOrigin(leader), others };
      },
      move: (node, invertSnap) => {
        const g = groupDragRef.current;
        if (!g) return;
        const snapSettings = withSnapInverted(settings, invertSnap);
        if (leader.kind === 'polygon') {
          // ゾーンは移動量そのものを吸着させる（離したときと同じ規則）
          const sdx = snapValue((node.x() - g.leaderStart.x) / state.scaleRatio, snapSettings);
          const sdy = snapValue((node.y() - g.leaderStart.y) / state.scaleRatio, snapSettings);
          node.position({
            x: g.leaderStart.x + sdx * state.scaleRatio,
            y: g.leaderStart.y + sdy * state.scaleRatio,
          });
        } else {
          snapNodePosition(node, state.scaleRatio, snapSettings);
        }
        const dx = node.x() - g.leaderStart.x;
        const dy = node.y() - g.leaderStart.y;
        for (const o of g.others) o.node.position({ x: o.start.x + dx, y: o.start.y + dy });
      },
      end: (node, invertSnap) => {
        const g = groupDragRef.current;
        groupDragRef.current = null;
        if (!g) return;
        const snapSettings = withSnapInverted(settings, invertSnap);
        let dx = (node.x() - g.leaderStart.x) / state.scaleRatio;
        let dy = (node.y() - g.leaderStart.y) / state.scaleRatio;
        if (leader.kind === 'polygon') {
          // ゾーンの頂点は吸着しないので、移動量そのものを吸着させて中の区画を格子に保つ
          dx = snapValue(dx, snapSettings);
          dy = snapValue(dy, snapSettings);
        } else {
          // つかんだ区画の位置を吸着させ、同じ移動量を他にも加える（相対位置を崩さない）
          const snapped = snapPoint({ x: leader.x + dx, y: leader.y + dy }, snapSettings);
          dx = snapped.x - leader.x;
          dy = snapped.y - leader.y;
        }
        // Konva ノードを元の位置へ戻してから状態を更新する（移動量 0 でもズレが残らないように）
        node.position(g.leaderStart);
        for (const o of g.others) o.node.position(o.start);
        if (dx === 0 && dy === 0) return;
        actions.updatePlacedMany(
          selectedItems.map((it) => ({ id: it.id, attrs: translateAttrs(it, dx, dy) })),
        );
      },
    };
  };

  /* ---------- キーボード（削除・選択解除・コピー・貼り付け） ---------- */

  // ハンドラ内で最新の値を参照するための ref（毎レンダー更新）
  const keyCtxRef = useRef({ state, actions, selectedItems, typeMap, settings, onStatusMessage });
  keyCtxRef.current = { state, actions, selectedItems, typeMap, settings, onStatusMessage };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctx = keyCtxRef.current;
      const st = ctx.state;
      if (isTypingOrInDialog()) return;
      const busy = st.isScaleMode || st.isAddingText || st.isAddingPolygon;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.selectedIds.length === 0) return;
        e.preventDefault();
        ctx.actions.removePlacedMany(st.selectedIds);
        return;
      }
      if (e.key === 'Escape' && !st.isAddingPolygon) {
        if (st.selectedIds.length > 0) ctx.actions.setSelectedId(null);
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey || busy) return;
      const key = e.key.toLowerCase();

      if (key === 'c') {
        // 画面上の文字を選択している場合は通常のコピーに任せる
        if (window.getSelection()?.toString()) return;
        const items = ctx.selectedItems;
        if (items.length === 0) return;
        e.preventDefault();
        copyItems(items, st.innerZoneId);
        const zoneCount = items.filter((i) => i.kind === 'zone').length;
        const hasPolygon = items.some((i) => i.kind === 'polygon');
        const hasText = items.some((i) => i.kind === 'text');
        ctx.onStatusMessage?.(
          hasPolygon
            ? zoneCount > 0
              ? `ゾーンと区画 ${zoneCount} 件をコピーしました`
              : 'ゾーンをコピーしました'
            : hasText
              ? 'テキストをコピーしました'
              : `区画 ${zoneCount} 件をコピーしました`,
        );
        return;
      }

      if (key === 'v') {
        if (!hasClipboard()) return;
        e.preventDefault();
        // 吸着間隔の倍数で 0.5m 前後ずらす（吸着が無効なら 0.5m）
        const snap = ctx.settings.snap;
        const step =
          snap.enabled && snap.sizeMeters > 0
            ? Math.max(1, Math.round(0.5 / snap.sizeMeters)) * snap.sizeMeters
            : 0.5;
        const result = pasteItems(step, (typeId) => ctx.typeMap.has(typeId));
        if (!result) return;
        if (result.items.length > 0) {
          ctx.actions.addItems(result.items);
          ctx.actions.setSelection(result.selectedIds, result.innerZoneId);
        }
        ctx.onStatusMessage?.(
          result.skipped > 0
            ? `貼り付けました（区画リストに無い区画 ${result.skipped} 件は除外）`
            : '貼り付けました',
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ゾーン作図中の Enter（確定）/ Escape（取消）
  useEffect(() => {
    if (!state.isAddingPolygon) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finalizePolygon();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPolygonDraft([]);
        setCursorMeters(null);
        actions.setIsAddingPolygon(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isAddingPolygon, finalizePolygon, actions]);

  /* ---------- マウス/タッチ ---------- */

  const handleStageClick = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;

      if (state.isScaleMode) {
        const pos = stage.getRelativePointerPosition();
        if (!pos) return;
        const next = [...state.scalePoints, pos];
        actions.setScalePoints(next);
        if (next.length === 2) {
          const dx = next[1].x - next[0].x;
          const dy = next[1].y - next[0].y;
          const distPx = Math.hypot(dx, dy);
          onScaleCalibrated(distPx);
        }
        return;
      }

      // テキスト配置モード: クリック位置にテキストを配置する（区画上でも可）
      if (state.isAddingText) {
        const pos = stage.getRelativePointerPosition();
        if (!pos) return;
        const xMeters = pos.x / state.scaleRatio;
        const yMeters = pos.y / state.scaleRatio;
        const snapped = snapPoint({ x: xMeters, y: yMeters }, settings);
        onTextPlaceRequested(snapped.x, snapped.y);
        return;
      }

      // ゾーン作図モード: クリックで頂点追加。始点付近クリックで確定（3 点以上）。
      if (state.isAddingPolygon) {
        const pos = stage.getRelativePointerPosition();
        if (!pos) return;
        const xMeters = pos.x / state.scaleRatio;
        const yMeters = pos.y / state.scaleRatio;
        if (polygonDraft.length >= 3) {
          const start = polygonDraft[0];
          const distPx =
            Math.hypot(start.x - xMeters, start.y - yMeters) * state.scaleRatio * state.viewScale;
          if (distPx < 12) {
            finalizePolygon();
            return;
          }
        }
        setPolygonDraft((prev) => [...prev, { x: xMeters, y: yMeters }]);
        return;
      }

      // 範囲選択を終えた直後の click は無視する
      if (suppressClickRef.current) return;

      // クリック先がステージ自体または背景レイヤーなら選択解除
      const target = e.target;
      const isEmpty = target === stage;
      const isBg = target.getParent()?.name() === 'background-layer';
      if (isEmpty || isBg) {
        actions.setSelectedId(null);
      }
    },
    [
      state.isScaleMode,
      state.scalePoints,
      state.isAddingText,
      state.isAddingPolygon,
      state.scaleRatio,
      state.viewScale,
      polygonDraft,
      finalizePolygon,
      settings,
      actions,
      onScaleCalibrated,
      onTextPlaceRequested,
      stageRef,
    ],
  );

  // カーソル位置を追跡（ゾーン作図プレビュー線用＋マルチ操作のプレゼンス通知用）
  const handleStageMouseMove = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    const meters = { x: pos.x / state.scaleRatio, y: pos.y / state.scaleRatio };
    if (onCursorMove) {
      const now = Date.now();
      if (now - cursorThrottleRef.current > 40) {
        cursorThrottleRef.current = now;
        onCursorMove(meters);
      }
    }
    if (state.isAddingPolygon) setCursorMeters(meters);
  }, [state.isAddingPolygon, state.scaleRatio, stageRef, onCursorMove]);

  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const scaleBy = 1.1;
      const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
      if (newScale < 0.1 || newScale > 10) return;

      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      };
      const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      };
      actions.setViewScale(newScale);
      actions.setStagePos(newPos);
    },
    [actions, stageRef],
  );

  /* ---------- HTML5 D&D（パレットからのドロップ） ---------- */

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      stage.setPointersPositions(e.nativeEvent);
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;

      const typeId = e.dataTransfer.getData('typeId');
      if (!typeId) return;

      const xMeters = pos.x / state.scaleRatio;
      const yMeters = pos.y / state.scaleRatio;
      const snapped = snapPoint({ x: xMeters, y: yMeters }, settings);
      actions.addPlacedZone(typeId, snapped.x, snapped.y);
    },
    [state.scaleRatio, settings, actions, stageRef],
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  /* ---------- 描画 ---------- */

  return (
    <div
      ref={containerRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onMouseLeave={() => onCursorMove?.(null)}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#e8e8e8',
        backgroundImage: 'radial-gradient(#ccc 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={state.viewScale}
        scaleY={state.viewScale}
        x={state.stagePos.x}
        y={state.stagePos.y}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onDblClick={() => {
          if (state.isAddingPolygon) finalizePolygon();
        }}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onWheel={handleWheel}
        draggable={!state.isScaleMode && !state.isAddingPolygon}
        onDragStart={(e) => {
          // 範囲選択中はステージをパンしない
          if (e.target === stageRef.current && boxActiveRef.current) e.target.stopDrag();
        }}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            actions.setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
      >
        <Layer name="background-layer">
          {state.background && <BackgroundImageDisplay background={state.background} />}
          {state.scalePoints.map((p, i) => (
            <Circle key={i} x={p.x} y={p.y} radius={6} fill="#e53935" />
          ))}
          {state.scalePoints.length === 2 && (
            <Line
              points={[
                state.scalePoints[0].x,
                state.scalePoints[0].y,
                state.scalePoints[1].x,
                state.scalePoints[1].y,
              ]}
              stroke="#e53935"
              strokeWidth={2}
            />
          )}
        </Layer>

        <Layer>
          {/* 区画・テキスト（ゾーンより下） */}
          {state.placed.map((item) => {
            if (item.kind === 'text') {
              return (
                <TextItem
                  key={item.id}
                  item={item}
                  scaleRatio={state.scaleRatio}
                  isSelected={selectedSet.has(item.id)}
                  showTransformer={isSingleSelection}
                  rotationSnap={rotationSnap}
                  isScaleMode={state.isScaleMode}
                  isAddingText={state.isAddingText}
                  onSelect={(shift) => handleItemClick(item, shift)}
                  onChange={(attrs) => actions.updatePlaced(item.id, attrs)}
                  onEditRequest={() => onTextEditRequested(item.id)}
                  settings={settings}
                />
              );
            }
            if (item.kind === 'zone') {
              const type = typeMap.get(item.typeId);
              return (
                <ZoneItem
                  key={item.id}
                  item={item}
                  type={type}
                  scaleRatio={state.scaleRatio}
                  isSelected={selectedSet.has(item.id)}
                  showTransformer={isSingleSelection}
                  rotationSnap={rotationSnap}
                  groupDrag={makeGroupDrag(item)}
                  isScaleMode={state.isScaleMode}
                  isAddingText={state.isAddingText}
                  onSelect={(shift) => handleItemClick(item, shift)}
                  onChange={(attrs) => actions.updatePlaced(item.id, attrs)}
                  settings={settings}
                />
              );
            }
            return null;
          })}

          {/* 複数選択中: 選択範囲全体を点線で囲む */}
          {state.selectedIds.length > 1 && state.innerZoneId === null && (
            <SelectionBounds
              items={selectedItems}
              zoneDims={zoneDims}
              scaleRatio={state.scaleRatio}
              viewScale={state.viewScale}
            />
          )}

          {/* ゾーン（多角形）: 区画の上に半透明で重ねる。表示トグルが ON のときのみ */}
          {state.showZones &&
            state.placed.map((item) => {
              if (item.kind !== 'polygon') return null;
              const count = residentsInPolygon(item, placedZones, zoneDims).total;
              return (
                <PolygonItem
                  key={item.id}
                  item={item}
                  scaleRatio={state.scaleRatio}
                  residentCount={count}
                  isSelected={selectedSet.has(item.id)}
                  isInnerSelection={state.innerZoneId === item.id}
                  groupDrag={makeGroupDrag(item)}
                  onShiftDragStart={
                    canBoxSelect && !selectedSet.has(item.id) ? startBoxSelect : undefined
                  }
                  interactive={!state.isScaleMode && !state.isAddingText && !state.isAddingPolygon}
                  onSelect={(shift) => handleItemClick(item, shift)}
                  onChange={(attrs) => actions.updatePlaced(item.id, attrs)}
                />
              );
            })}

          {/* Shift+ドラッグの範囲選択枠 */}
          {boxRect && (
            <Rect
              x={Math.min(boxRect.x1, boxRect.x2)}
              y={Math.min(boxRect.y1, boxRect.y2)}
              width={Math.abs(boxRect.x2 - boxRect.x1)}
              height={Math.abs(boxRect.y2 - boxRect.y1)}
              fill="rgba(21, 101, 192, 0.08)"
              stroke="#1565c0"
              strokeWidth={1 / state.viewScale}
              dash={[6 / state.viewScale, 4 / state.viewScale]}
              listening={false}
            />
          )}

          {/* ゾーン作図中の下書き */}
          {state.isAddingPolygon && polygonDraft.length > 0 && (
            <PolygonDraft
              points={polygonDraft}
              cursor={cursorMeters}
              scaleRatio={state.scaleRatio}
            />
          )}
        </Layer>

        {/* マルチ操作：他ユーザーのカーソル・選択（現在の階層のみ） */}
        {remotePresence && remotePresence.length > 0 && (
          <Layer listening={false}>
            {remotePresence.map((p) => (
              <RemotePresenceMarker
                key={p.clientId}
                presence={p}
                placed={state.placed}
                typeMap={typeMap}
                scaleRatio={state.scaleRatio}
                viewScale={state.viewScale}
              />
            ))}
          </Layer>
        )}
      </Stage>
    </div>
  );
};

export default Canvas;

/* ============================================================== */
/* ZoneItem                                                       */
/* ============================================================== */

type ZoneItemProps = {
  item: PlacedZone;
  type: ZoneType | undefined;
  scaleRatio: number;
  isSelected: boolean;
  /** 回転・サイズ変更ハンドルを出すか（単体選択時のみ）。 */
  showTransformer: boolean;
  /** 回転ハンドルの角度スナップ（Konva Transformer の rotationSnaps / 許容差）。 */
  rotationSnap: { snaps: number[]; tolerance: number };
  /** 複数選択の一部としてドラッグされる場合のハンドラ。 */
  groupDrag?: GroupDragHandlers;
  isScaleMode: boolean;
  isAddingText: boolean;
  onSelect: (shiftKey: boolean) => void;
  onChange: (attrs: Partial<PlacedZone>) => void;
  settings: ReturnType<typeof useUserSettings>['settings'];
};

const ZoneItem = ({
  item,
  type,
  scaleRatio,
  isSelected,
  showTransformer,
  rotationSnap,
  groupDrag,
  isScaleMode,
  isAddingText,
  onSelect,
  onChange,
  settings,
}: ZoneItemProps) => {
  const shapeRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && showTransformer && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, showTransformer]);

  const widthMeters = item.width ?? type?.width ?? 1;
  const heightMeters = item.height ?? type?.height ?? 1;
  const widthPx = widthMeters * scaleRatio;
  const heightPx = heightMeters * scaleRatio;
  const xPx = item.x * scaleRatio;
  const yPx = item.y * scaleRatio;
  const color = type?.color ?? '#cccccc';
  const displayText = type ? getZoneDisplayText(type) : '(不明な区画)';
  const nameColor = type ? getZoneNameColor(type) : '#000000';
  const resizable = type?.resizable ?? false;
  const residentTotal = getZoneResidentTotal(item);
  const border = type ? getZoneBorder(type) : { show: true, color: '#222222', widthPx: 1 };
  // 選択中は青枠で上書き、未選択時は区画の枠線設定に従う
  const strokeColor = isSelected ? '#1565c0' : border.show ? border.color : undefined;
  const strokeWidth = isSelected ? 2 : border.show ? border.widthPx : 0;

  return (
    <>
      <Group
        ref={shapeRef}
        id={item.id}
        x={xPx}
        y={yPx}
        rotation={item.rotation}
        clipX={0}
        clipY={0}
        clipWidth={widthPx}
        clipHeight={heightPx}
        draggable={!isScaleMode && !isAddingText}
        onClick={(e) => {
          if (isScaleMode || isAddingText) return; // Stage 側でハンドリング
          e.cancelBubble = true;
          onSelect(e.evt.shiftKey);
        }}
        onTap={(e) => {
          if (isScaleMode || isAddingText) return;
          e.cancelBubble = true;
          onSelect(false);
        }}
        onDragStart={(e) => groupDrag?.start(e.target)}
        onDragMove={(e) => {
          const invert = isCtrl(e.evt);
          if (groupDrag) groupDrag.move(e.target, invert);
          else snapNodePosition(e.target, scaleRatio, withSnapInverted(settings, invert));
        }}
        onDragEnd={(e) => {
          const invert = isCtrl(e.evt);
          if (groupDrag) {
            groupDrag.end(e.target, invert);
            return;
          }
          const newXMeters = e.target.x() / scaleRatio;
          const newYMeters = e.target.y() / scaleRatio;
          const snapped = snapPoint(
            { x: newXMeters, y: newYMeters },
            withSnapInverted(settings, invert),
          );
          onChange({ x: snapped.x, y: snapped.y });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          const newXMeters = node.x() / scaleRatio;
          const newYMeters = node.y() / scaleRatio;
          const newWidthMeters = (widthPx * sx) / scaleRatio;
          const newHeightMeters = (heightPx * sy) / scaleRatio;
          const snappedPos = snapPoint({ x: newXMeters, y: newYMeters }, settings);
          onChange({
            x: snappedPos.x,
            y: snappedPos.y,
            width: Math.max(0.1, snapValue(newWidthMeters, settings)),
            height: Math.max(0.1, snapValue(newHeightMeters, settings)),
            rotation: node.rotation(),
          });
        }}
      >
        <Rect width={widthPx} height={heightPx} fill={color} opacity={0.85} />
        {type?.image && (
          <ZoneImageKonva image={type.image} zoneWidthPx={widthPx} zoneHeightPx={heightPx} />
        )}
        {strokeWidth > 0 && (
          <Rect
            width={widthPx}
            height={heightPx}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            listening={false}
          />
        )}
        {type?.showName !== false && (
          <Text
            text={displayText}
            fill={nameColor}
            fontSize={
              type?.nameFontSize !== undefined
                ? Math.max(4, type.nameFontSize * scaleRatio)
                : Math.max(10, Math.min(widthPx, heightPx) / 3)
            }
            width={widthPx}
            height={heightPx}
            align={type ? getZoneNameAlignH(type) : 'center'}
            verticalAlign={type ? getZoneNameAlignV(type) : 'middle'}
            padding={4}
            listening={false}
          />
        )}
        {residentTotal > 0 && (
          <Text
            text={`${residentTotal}人`}
            fill="#000000"
            stroke="#ffffff"
            strokeWidth={2}
            fillAfterStrokeEnabled
            fontStyle="bold"
            fontSize={Math.max(9, Math.min(widthPx, heightPx) / 5)}
            width={widthPx}
            height={heightPx}
            align="right"
            verticalAlign="bottom"
            padding={3}
            listening={false}
          />
        )}
      </Group>
      {isSelected && showTransformer && (
        <Transformer
          ref={trRef}
          resizeEnabled={resizable}
          rotateEnabled
          rotationSnaps={rotationSnap.snaps}
          rotationSnapTolerance={rotationSnap.tolerance}
          boundBoxFunc={(oldBox: Box, newBox: Box) =>
            newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
          }
        />
      )}
    </>
  );
};

/* ============================================================== */
/* TextItem                                                       */
/* ============================================================== */

type TextItemProps = {
  item: TextBlock;
  scaleRatio: number;
  isSelected: boolean;
  showTransformer: boolean;
  rotationSnap: { snaps: number[]; tolerance: number };
  isScaleMode: boolean;
  isAddingText: boolean;
  onSelect: (shiftKey: boolean) => void;
  onChange: (attrs: Partial<TextBlock>) => void;
  onEditRequest: () => void;
  settings: ReturnType<typeof useUserSettings>['settings'];
};

const TextItem = ({
  item,
  scaleRatio,
  isSelected,
  showTransformer,
  rotationSnap,
  isScaleMode,
  isAddingText,
  onSelect,
  onChange,
  onEditRequest,
  settings,
}: TextItemProps) => {
  const shapeRef = useRef<Konva.Text>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && showTransformer && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, showTransformer]);

  const handleDblClick = () => {
    if (isScaleMode || isAddingText) return;
    onEditRequest();
  };

  return (
    <>
      <Text
        ref={shapeRef}
        id={item.id}
        x={item.x * scaleRatio}
        y={item.y * scaleRatio}
        text={item.text}
        fontSize={item.fontSize}
        scaleX={item.scaleX}
        scaleY={item.scaleY}
        rotation={item.rotation}
        fill={item.color}
        draggable={!isScaleMode && !isAddingText}
        onClick={(e) => {
          if (isScaleMode || isAddingText) return;
          e.cancelBubble = true;
          onSelect(e.evt.shiftKey);
        }}
        onTap={(e) => {
          if (isScaleMode || isAddingText) return;
          e.cancelBubble = true;
          onSelect(false);
        }}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        onDragMove={(e) =>
          snapNodePosition(e.target, scaleRatio, withSnapInverted(settings, isCtrl(e.evt)))
        }
        onDragEnd={(e) => {
          const newXMeters = e.target.x() / scaleRatio;
          const newYMeters = e.target.y() / scaleRatio;
          const snapped = snapPoint(
            { x: newXMeters, y: newYMeters },
            withSnapInverted(settings, isCtrl(e.evt)),
          );
          onChange({ x: snapped.x, y: snapped.y });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const newXMeters = node.x() / scaleRatio;
          const newYMeters = node.y() / scaleRatio;
          const snapped = snapPoint({ x: newXMeters, y: newYMeters }, settings);
          onChange({
            x: snapped.x,
            y: snapped.y,
            rotation: node.rotation(),
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
          });
        }}
      />
      {isSelected && showTransformer && (
        <Transformer
          ref={trRef}
          resizeEnabled
          rotateEnabled
          rotationSnaps={rotationSnap.snaps}
          rotationSnapTolerance={rotationSnap.tolerance}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
        />
      )}
    </>
  );
};

/* ============================================================== */
/* PolygonItem（ゾーン）                                          */
/* ============================================================== */

/** #RRGGBB と不透明度を rgba() 文字列へ変換（塗りのみ半透明、枠線は不透明に保つため）。 */
const hexToRgba = (hex: string, alpha: number): string => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const dashForStyle = (style: PolygonZone['strokeStyle']): number[] | undefined => {
  if (style === 'dashed') return [10, 6];
  if (style === 'dotted') return [2, 6];
  return undefined;
};

type PolygonItemProps = {
  item: PolygonZone;
  scaleRatio: number;
  residentCount: number;
  isSelected: boolean;
  /** ゾーン内選択中か（枠を太くして区別する）。 */
  isInnerSelection: boolean;
  /** ゾーン内選択中に、中の区画と一緒にドラッグする場合のハンドラ。 */
  groupDrag?: GroupDragHandlers;
  /** 未選択のゾーン上で Shift+ドラッグを始めたとき、範囲選択を開始する。 */
  onShiftDragStart?: () => void;
  interactive: boolean;
  onSelect: (shiftKey: boolean) => void;
  onChange: (attrs: Partial<PolygonZone>) => void;
};

const PolygonItem = ({
  item,
  scaleRatio,
  residentCount,
  isSelected,
  isInnerSelection,
  groupDrag,
  onShiftDragStart,
  interactive,
  onSelect,
  onChange,
}: PolygonItemProps) => {
  const groupRef = useRef<Konva.Group>(null);

  const flatPoints = item.points.flatMap((p) => [p.x * scaleRatio, p.y * scaleRatio]);
  const centroid = polygonCentroid(item.points);

  return (
    <Group
      ref={groupRef}
      id={item.id}
      draggable={isSelected && interactive}
      onDragStart={(e) => {
        if (e.target === groupRef.current) groupDrag?.start(e.target);
      }}
      onDragMove={(e) => {
        if (e.target === groupRef.current) groupDrag?.move(e.target, isCtrl(e.evt));
      }}
      onDragEnd={(e) => {
        if (e.target !== groupRef.current) return; // 頂点ドラッグは除外
        const node = groupRef.current;
        if (!node) return;
        if (groupDrag) {
          groupDrag.end(node, isCtrl(e.evt));
          return;
        }
        const dxMeters = node.x() / scaleRatio;
        const dyMeters = node.y() / scaleRatio;
        node.position({ x: 0, y: 0 });
        onChange({
          points: item.points.map((p) => ({ x: p.x + dxMeters, y: p.y + dyMeters })),
        });
      }}
    >
      <Line
        points={flatPoints}
        closed
        fill={hexToRgba(item.fillColor, item.fillOpacity)}
        stroke={isSelected ? '#1565c0' : item.strokeColor}
        strokeWidth={
          isInnerSelection
            ? Math.max(item.strokeWidthPx, 4)
            : isSelected
              ? Math.max(item.strokeWidthPx, 2)
              : item.strokeWidthPx
        }
        dash={dashForStyle(item.strokeStyle)}
        lineJoin="round"
        listening={interactive}
        onMouseDown={(e) => {
          if (!e.evt.shiftKey || e.evt.button !== 0 || !onShiftDragStart) return;
          e.cancelBubble = true; // ステージ側でも開始しないように
          onShiftDragStart();
        }}
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect(e.evt.shiftKey);
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onSelect(false);
        }}
      />
      {item.showCount && (
        <Text
          x={centroid.x * scaleRatio - 60}
          y={centroid.y * scaleRatio - 9}
          width={120}
          text={`${residentCount}人`}
          align="center"
          fill="#000000"
          stroke="#ffffff"
          strokeWidth={2}
          fillAfterStrokeEnabled
          fontStyle="bold"
          fontSize={14}
          listening={false}
        />
      )}
      {isSelected &&
        interactive &&
        item.points.map((p, i) => (
          <Circle
            key={i}
            x={p.x * scaleRatio}
            y={p.y * scaleRatio}
            radius={6}
            fill="#ffffff"
            stroke="#1565c0"
            strokeWidth={2}
            draggable
            onDragEnd={(e) => {
              e.cancelBubble = true;
              const nx = e.target.x() / scaleRatio;
              const ny = e.target.y() / scaleRatio;
              const nextPoints = item.points.map((pt, j) => (j === i ? { x: nx, y: ny } : pt));
              onChange({ points: nextPoints });
            }}
          />
        ))}
    </Group>
  );
};

/* ============================================================== */
/* SelectionBounds（複数選択の外枠）                              */
/* ============================================================== */

const SelectionBounds = ({
  items,
  zoneDims,
  scaleRatio,
  viewScale,
}: {
  items: PlacedItem[];
  zoneDims: (z: PlacedZone) => { width: number; height: number };
  scaleRatio: number;
  viewScale: number;
}) => {
  const pts: Point[] = [];
  for (const it of items) {
    if (it.kind === 'zone') {
      const d = zoneDims(it);
      pts.push(...getZoneCornersMeters(it, d.width, d.height));
    } else if (it.kind === 'polygon') {
      pts.push(...it.points);
    } else {
      pts.push({ x: it.x, y: it.y });
    }
  }
  if (pts.length === 0) return null;
  const inv = 1 / viewScale;
  const pad = 6 * inv;
  const minX = Math.min(...pts.map((p) => p.x)) * scaleRatio - pad;
  const minY = Math.min(...pts.map((p) => p.y)) * scaleRatio - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) * scaleRatio + pad;
  const maxY = Math.max(...pts.map((p) => p.y)) * scaleRatio + pad;
  return (
    <Rect
      x={minX}
      y={minY}
      width={maxX - minX}
      height={maxY - minY}
      stroke="#1565c0"
      strokeWidth={1.5 * inv}
      dash={[6 * inv, 4 * inv]}
      listening={false}
    />
  );
};

/* ============================================================== */
/* PolygonDraft（作図中の下書き）                                 */
/* ============================================================== */

const PolygonDraft = ({
  points,
  cursor,
  scaleRatio,
}: {
  points: Point[];
  cursor: Point | null;
  scaleRatio: number;
}) => {
  const flat = points.flatMap((p) => [p.x * scaleRatio, p.y * scaleRatio]);
  const previewFlat = cursor
    ? [...flat, cursor.x * scaleRatio, cursor.y * scaleRatio]
    : flat;
  return (
    <>
      <Line
        points={previewFlat}
        stroke="#1565c0"
        strokeWidth={2}
        dash={[6, 4]}
        listening={false}
      />
      {points.map((p, i) => (
        <Circle
          key={i}
          x={p.x * scaleRatio}
          y={p.y * scaleRatio}
          radius={i === 0 ? 7 : 5}
          fill={i === 0 ? '#1565c0' : '#ffffff'}
          stroke="#1565c0"
          strokeWidth={2}
          listening={false}
        />
      ))}
    </>
  );
};

// Point 型を re-export して周辺コードから使えるようにする
export type { Point };
