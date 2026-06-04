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
} from 'react-konva';
import useImage from 'use-image';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Box } from 'konva/lib/shapes/Transformer';
import type { PlacedZone, TextBlock, ZoneType } from '../../shared/types.ts';
import {
  getZoneBorder,
  getZoneDisplayText,
  getZoneNameAlignH,
  getZoneNameAlignV,
  getZoneNameColor,
  getZoneResidentTotal,
} from '../../shared/types.ts';
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
};

const BackgroundImageDisplay = ({
  background,
}: {
  background: { dataUrl: string; width: number; height: number };
}) => {
  const [img] = useImage(background.dataUrl);
  return <KonvaImage image={img} x={0} y={0} width={background.width} height={background.height} />;
};

const Canvas = ({
  state,
  actions,
  onScaleCalibrated,
  onTextPlaceRequested,
  onTextEditRequested,
  stageRef,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { settings } = useUserSettings();
  const [size, setSize] = useState({ width: 800, height: 600 });

  // 配置済みアイテムを id でルックアップしやすくするマップ（タイプ定義用）
  const typeMap = new Map<string, ZoneType>(state.zoneList.zones.map((z) => [z.id, z]));

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
      state.scaleRatio,
      settings,
      actions,
      onScaleCalibrated,
      onTextPlaceRequested,
      stageRef,
    ],
  );

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
        onWheel={handleWheel}
        draggable={!state.isScaleMode}
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
          })}
        </Layer>
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

// Point 型を re-export して周辺コードから使えるようにする
export type { Point };
