import { Stack, Group, Text, NumberInput, ColorSwatch, Divider, ActionIcon, Tooltip } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import type { PlacedZone, ResidentType } from '../../shared/types.ts';
import { getZoneResidentTotal } from '../../shared/types.ts';

type Props = {
  zone: PlacedZone;
  zoneTypeName: string;
  residentTypes: ResidentType[];
  onChange: (residents: Record<string, number>) => void;
  onClose: () => void;
};

/**
 * 配置済み区画を選択したときに表示する右側パネル。
 * 区画ごとの居住者人数を種類別に設定する（設計書 §8.1.2）。
 */
const SelectionPanel = ({ zone, zoneTypeName, residentTypes, onChange, onClose }: Props) => {
  const total = getZoneResidentTotal(zone);

  const handleChange = (typeId: string, value: number) => {
    const next: Record<string, number> = { ...(zone.residents ?? {}) };
    if (value > 0) next[typeId] = value;
    else delete next[typeId];
    onChange(next);
  };

  return (
    <Stack
      gap="xs"
      p="md"
      style={{
        width: 260,
        borderLeft: '1px solid #e0e0e0',
        background: '#fff',
        overflowY: 'auto',
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Text fw={600} size="sm" truncate>
          {zoneTypeName}
        </Text>
        <Tooltip label="選択を解除">
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="選択を解除">
            <IconX size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Divider label="居住者人数" labelPosition="left" />

      {residentTypes.map((rt) => (
        <Group key={rt.id} gap="xs" wrap="nowrap">
          <ColorSwatch color={rt.color} size={16} />
          <Text size="sm" flex={1} truncate>
            {rt.name}
          </Text>
          <NumberInput
            value={zone.residents?.[rt.id] ?? 0}
            onChange={(v) => handleChange(rt.id, typeof v === 'number' ? v : 0)}
            min={0}
            step={1}
            clampBehavior="strict"
            allowDecimal={false}
            w={84}
            aria-label={`${rt.name}の人数`}
          />
        </Group>
      ))}

      <Divider />
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          合計
        </Text>
        <Text fw={700}>{total} 人</Text>
      </Group>
    </Stack>
  );
};

export default SelectionPanel;
