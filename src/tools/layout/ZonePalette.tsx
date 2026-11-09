import { useRef, useState } from 'react';
import {
  CANVAS_DROP_ATTR,
  PALETTE_DROP_EVENT,
  type PaletteDropDetail,
} from './paletteDrop.ts';
import { Stack, Text, Title, ScrollArea, Paper, Button, Group, Tooltip } from '@mantine/core';
import { IconPencil, IconList, IconRestore } from '@tabler/icons-react';
import type { ZoneList } from '../../shared/types.ts';

type Props = {
  zoneList: ZoneList;
  /** 区画リストの読込・初期化を許可するか（マルチ操作の参加者は false）。既定 true。 */
  canLoad?: boolean;
  onEditZones: () => void;
  onLoadZoneListFile: (file: File) => void;
  onResetZoneList: () => void;
};

const ZonePalette = ({
  zoneList,
  canLoad = true,
  onEditZones,
  onLoadZoneListFile,
  onResetZoneList,
}: Props) => {
  const listInputRef = useRef<HTMLInputElement>(null);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, typeId: string) => {
    e.dataTransfer.setData('typeId', typeId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  /*
   * タッチ（指・ペン）での配置（v2.7.0）。iPad の Safari では HTML5 D&D が使えないため、
   * ポインタを追跡して指の位置に区画のゴーストを表示し、キャンバスの上で離したら配置する。
   * 縦方向のスワイプはリストのスクロールに任せる（touch-action: pan-y）。
   */
  const [ghost, setGhost] = useState<{ name: string; color: string; x: number; y: number } | null>(
    null,
  );
  const touchDragRef = useRef<{ typeId: string; pointerId: number } | null>(null);
  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    zone: { id: string; name: string; color: string },
  ) => {
    if (e.pointerType === 'mouse') return; // マウスは従来の HTML5 D&D
    touchDragRef.current = { typeId: zone.id, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setGhost({ name: zone.name, color: zone.color, x: e.clientX, y: e.clientY });
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (touchDragRef.current?.pointerId !== e.pointerId) return;
    setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = touchDragRef.current;
    if (drag?.pointerId !== e.pointerId) return;
    touchDragRef.current = null;
    setGhost(null);
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest(`[${CANVAS_DROP_ATTR}]`);
    if (!target) return;
    const detail: PaletteDropDetail = { typeId: drag.typeId, clientX: e.clientX, clientY: e.clientY };
    target.dispatchEvent(new CustomEvent(PALETTE_DROP_EVENT, { detail }));
  };
  const handlePointerCancel = () => {
    touchDragRef.current = null;
    setGhost(null);
  };

  return (
    <Paper
      withBorder
      radius={0}
      style={{
        width: 220,
        borderRight: '1px solid #e0e0e0',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Stack gap={6} p="sm">
        <Title order={5} m={0}>
          区画リスト
        </Title>
        <Group gap={4} grow wrap="nowrap">
          <Tooltip label="区画の追加・編集（区画エディタを開く）">
            <Button size="xs" variant="light" leftSection={<IconPencil size={14} />} onClick={onEditZones}>
              編集
            </Button>
          </Tooltip>
          <Tooltip label={canLoad ? '区画リスト (.list.json) を読み込む' : '参加者は読み込めません（ホストのみ）'}>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconList size={14} />}
              onClick={() => listInputRef.current?.click()}
              disabled={!canLoad}
            >
              読込み
            </Button>
          </Tooltip>
          <Tooltip label={canLoad ? '区画リストを既定のリスト（標準／自治体研究会用）に戻す' : '参加者は初期化できません（ホストのみ）'}>
            <Button
              size="xs"
              variant="light"
              color="gray"
              leftSection={<IconRestore size={14} />}
              onClick={onResetZoneList}
              disabled={!canLoad}
            >
              初期化
            </Button>
          </Tooltip>
        </Group>
        <input
          ref={listInputRef}
          type="file"
          accept=".list.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onLoadZoneListFile(file);
            e.target.value = '';
          }}
        />
        <Text size="xs" c="dimmed">
          ドラッグして配置（タブレットは指で図面の上へ）
        </Text>
        <Text size="xs" c="dimmed">
          リスト: {zoneList.name}
        </Text>
      </Stack>
      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={6} p="sm" pt={0}>
          {zoneList.zones.map((zone) => (
            <div
              key={zone.id}
              draggable
              onDragStart={(e) => handleDragStart(e, zone.id)}
              onPointerDown={(e) => handlePointerDown(e, zone)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              style={{
                touchAction: 'pan-y',
                padding: '8px 10px',
                background: '#fafafa',
                border: '1px solid #e0e0e0',
                borderLeft: `5px solid ${zone.color}`,
                borderRadius: 4,
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              <Text size="sm" fw={500}>
                {zone.name}
              </Text>
              <Text size="xs" c="dimmed">
                {zone.width}m × {zone.height}m
              </Text>
            </div>
          ))}
        </Stack>
      </ScrollArea>
      {/* タッチでドラッグ中の区画（指の位置に追従） */}
      {ghost && (
        <div
          style={{
            position: 'fixed',
            left: ghost.x,
            top: ghost.y,
            transform: 'translate(-50%, -120%)',
            padding: '6px 10px',
            background: '#fff',
            border: '1px solid #90a4ae',
            borderLeft: `5px solid ${ghost.color}`,
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            fontSize: 14,
            pointerEvents: 'none',
            zIndex: 1000,
            whiteSpace: 'nowrap',
          }}
        >
          {ghost.name}
        </div>
      )}
    </Paper>
  );
};

export default ZonePalette;
