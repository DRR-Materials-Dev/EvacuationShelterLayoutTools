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
import { polygonCentroid, residentsInPolygon } from '../../shared/geometry.ts';
import ZoneImageKonva from '../../shared/components/ZoneImageKonva.tsx';
import { snapPoint, snapValue } from '../../shared/snap.ts';
import { useUserSettings } from '../../shared/settings.tsx';
import type { LayoutActions, LayoutState } from './useLayoutState.ts';
import type { Point } from './types.ts';

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

  let selAnchor: { x: number; y: number } | null = null;
  if (presence.selectedId) {
    const item = placed.find((it) => it.id === presence.selectedId);
    if (item) {
      if (item.kind === 'polygon') {
        const c = polygonCentroid(item.points);
        selAnchor = { x: c.x * scaleRatio, y: c.y * scaleRatio };
      } else if (item.kind === 'zone') {
        const t = typeMap.get(item.typeId);
        const w = item.width ?? t?.width ?? 1;
        const h = item.height ?? t?.height ?? 1;
        selAnchor = { x: (item.x + w / 2) * scaleRatio, y: (item.y + h / 2) * scaleRatio };
      } else {
        selAnchor = { x: item.x * scaleRatio, y: item.y * scaleRatio };
      }
    }
  }

  const cursor = presence.cursor
    ? { x: presence.cursor.x * scaleRatio, y: presence.cursor.y * scaleRatio }
    : null;

  return (
    <Group listening={false}>
      {selAnchor && (
        <Circle
          x={selAnchor.x}
          y={selAnchor.y}
          radius={16 * inv}
          stroke={color}
          strokeWidth={2.5 * inv}
          dash={[7 * inv, 4 * inv]}
        />
      )}
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

  // Delete / Backspace で削除
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')
        ) {
          return; // フォーカスが入力中ならスキップ
        }
        actions.removePlaced(state.selectedId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedId, actions]);

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
        onMouseMove={handleStageMouseMove}
        onWheel={handleWheel}
        draggable={!state.isScaleMode && !state.isAddingPolygon}
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
                  isSelected={item.id === state.selectedId}
                  isScaleMode={state.isScaleMode}
                  isAddingText={state.isAddingText}
                  onSelect={() => actions.setSelectedId(item.id)}
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
                  isSelected={item.id === state.selectedId}
                  isScaleMode={state.isScaleMode}
                  isAddingText={state.isAddingText}
                  onSelect={() => actions.setSelectedId(item.id)}
                  onChange={(attrs) => actions.updatePlaced(item.id, attrs)}
                  settings={settings}
                />
              );
            }
            return null;
          })}

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
                  isSelected={item.id === state.selectedId}
                  interactive={!state.isScaleMode && !state.isAddingText && !state.isAddingPolygon}
                  onSelect={() => actions.setSelectedId(item.id)}
                  onChange={(attrs) => actions.updatePlaced(item.id, attrs)}
                />
              );
            })}

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
  isScaleMode: boolean;
  isAddingText: boolean;
  onSelect: () => void;
  onChange: (attrs: Partial<PlacedZone>) => void;
  settings: ReturnType<typeof useUserSettings>['settings'];
};

const ZoneItem = ({
  item,
  type,
  scaleRatio,
  isSelected,
  isScaleMode,
  isAddingText,
  onSelect,
  onChange,
  settings,
}: ZoneItemProps) => {
  const shapeRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

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
          onSelect();
        }}
        onTap={(e) => {
          if (isScaleMode || isAddingText) return;
          e.cancelBubble = true;
          onSelect();
        }}
        onDragEnd={(e) => {
          const newXMeters = e.target.x() / scaleRatio;
          const newYMeters = e.target.y() / scaleRatio;
          const snapped = snapPoint({ x: newXMeters, y: newYMeters }, settings);
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
      {isSelected && (
        <Transformer
          ref={trRef}
          resizeEnabled={resizable}
          rotateEnabled
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
  isScaleMode: boolean;
  isAddingText: boolean;
  onSelect: () => void;
  onChange: (attrs: Partial<TextBlock>) => void;
  onEditRequest: () => void;
  settings: ReturnType<typeof useUserSettings>['settings'];
};

const TextItem = ({
  item,
  scaleRatio,
  isSelected,
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
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleDblClick = () => {
    if (isScaleMode || isAddingText) return;
    onEditRequest();
  };

  return (
    <>
      <Text
        ref={shapeRef}
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
          onSelect();
        }}
        onTap={(e) => {
          if (isScaleMode || isAddingText) return;
          e.cancelBubble = true;
          onSelect();
        }}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        onDragEnd={(e) => {
          const newXMeters = e.target.x() / scaleRatio;
          const newYMeters = e.target.y() / scaleRatio;
          const snapped = snapPoint({ x: newXMeters, y: newYMeters }, settings);
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
      {isSelected && (
        <Transformer
          ref={trRef}
          resizeEnabled
          rotateEnabled
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
  interactive: boolean;
  onSelect: () => void;
  onChange: (attrs: Partial<PolygonZone>) => void;
};

const PolygonItem = ({
  item,
  scaleRatio,
  residentCount,
  isSelected,
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
      draggable={isSelected && interactive}
      onDragEnd={(e) => {
        if (e.target !== groupRef.current) return; // 頂点ドラッグは除外
        const node = groupRef.current;
        if (!node) return;
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
        strokeWidth={isSelected ? Math.max(item.strokeWidthPx, 2) : item.strokeWidthPx}
        dash={dashForStyle(item.strokeStyle)}
        lineJoin="round"
        listening={interactive}
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onSelect();
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
