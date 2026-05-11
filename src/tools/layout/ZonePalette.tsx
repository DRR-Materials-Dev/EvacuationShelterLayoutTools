import { Stack, Text, Title, ScrollArea, Paper } from '@mantine/core';
import type { ZoneList } from '../../shared/types.ts';

type Props = {
  zoneList: ZoneList;
};

const ZonePalette = ({ zoneList }: Props) => {
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
      <Stack gap={4} p="sm">
        <Title order={5} m={0}>
          区画一覧
        </Title>
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
