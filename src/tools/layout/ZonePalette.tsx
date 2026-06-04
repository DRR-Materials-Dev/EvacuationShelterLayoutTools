import { useRef } from 'react';
import { Stack, Text, Title, ScrollArea, Paper, Button, Group, Tooltip } from '@mantine/core';
import { IconPencil, IconList, IconRestore } from '@tabler/icons-react';
import type { ZoneList } from '../../shared/types.ts';

type Props = {
  zoneList: ZoneList;
  onEditZones: () => void;
  onLoadZoneListFile: (file: File) => void;
  onResetZoneList: () => void;
};

const ZonePalette = ({ zoneList, onEditZones, onLoadZoneListFile, onResetZoneList }: Props) => {
  const listInputRef = useRef<HTMLInputElement>(null);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, typeId: string) => {
    e.dataTransfer.setData('typeId', typeId);
    e.dataTransfer.effectAllowed = 'copy';
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
          <Tooltip label="区画リスト (.list.json) を読み込む">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconList size={14} />}
              onClick={() => listInputRef.current?.click()}
            >
              読込み
            </Button>
          </Tooltip>
          <Tooltip label="区画リストを既定 (デフォルト) に戻す">
            <Button
              size="xs"
              variant="light"
              color="gray"
              leftSection={<IconRestore size={14} />}
              onClick={onResetZoneList}
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
          ドラッグして配置
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
              style={{
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
    </Paper>
  );
};

export default ZonePalette;
