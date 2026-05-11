import { ActionIcon, Button, Group, Paper, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import type { ZoneType } from '../../shared/types.ts';

type Props = {
  zones: ZoneType[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
};

const ZoneListPane = ({ zones, selectedId, onSelect, onAdd, onDuplicate, onRemove }: Props) => {
  return (
    <Paper
      withBorder
      radius={0}
      style={{
        width: 260,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Group p="xs" justify="space-between">
        <Text fw={500} size="sm">
          区画一覧（{zones.length}）
        </Text>
        <Tooltip label="新規区画を追加">
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onAdd}>
            追加
          </Button>
        </Tooltip>
      </Group>
      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={4} p="xs" pt={0}>
          {zones.length === 0 && (
            <Text size="xs" c="dimmed" px="xs">
              区画がまだありません。「追加」から作成してください。
            </Text>
          )}
          {zones.map((zone) => {
            const isSelected = zone.id === selectedId;
            return (
              <Group
                key={zone.id}
                gap={4}
                wrap="nowrap"
                style={{
                  padding: '6px 8px',
                  background: isSelected ? '#e3f2fd' : '#fafafa',
                  border: isSelected ? '1px solid #2196f3' : '1px solid #e0e0e0',
                  borderLeft: `4px solid ${zone.color}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
                onClick={() => onSelect(zone.id)}
              >
                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={isSelected ? 600 : 400} truncate>
                    {zone.name || '(無名)'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {zone.width}m × {zone.height}m
                  </Text>
                </Stack>
                <Tooltip label="複製">
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(zone.id);
                    }}
                  >
                    <IconCopy size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="削除">
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(zone.id);
                    }}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            );
          })}
        </Stack>
      </ScrollArea>
    </Paper>
  );
};

export default ZoneListPane;
