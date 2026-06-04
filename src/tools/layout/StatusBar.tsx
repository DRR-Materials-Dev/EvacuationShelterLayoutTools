import { Group, Text, Tooltip, Stack, ColorSwatch } from '@mantine/core';
import type { ResidentType } from '../../shared/types.ts';

type Props = {
  scaleRatio: number;
  viewScale: number;
  placedCount: number;
  floorResidentTotal: number;
  mapResidentTotal: number;
  residentTypes: ResidentType[];
  floorByType: Record<string, number>;
  mapByType: Record<string, number>;
  message?: string | null;
};

/** 居住者の種類別内訳をホバー表示するためのツールチップ中身。 */
const ResidentBreakdown = ({
  residentTypes,
  byType,
}: {
  residentTypes: ResidentType[];
  byType: Record<string, number>;
}) => {
  const rows = residentTypes.filter((rt) => (byType[rt.id] ?? 0) > 0);
  if (rows.length === 0) {
    return <Text size="xs">居住者は設定されていません</Text>;
  }
  return (
    <Stack gap={2}>
      {rows.map((rt) => (
        <Group key={rt.id} gap={6} wrap="nowrap">
          <ColorSwatch color={rt.color} size={12} />
          <Text size="xs" style={{ flex: 1 }}>
            {rt.name}
          </Text>
          <Text size="xs" fw={600}>
            {byType[rt.id]} 人
          </Text>
        </Group>
      ))}
    </Stack>
  );
};

const StatusBar = ({
  scaleRatio,
  viewScale,
  placedCount,
  floorResidentTotal,
  mapResidentTotal,
  residentTypes,
  floorByType,
  mapByType,
  message,
}: Props) => {
  return (
    <Group
      gap="lg"
      px="md"
      py={4}
      style={{
        borderTop: '1px solid #e0e0e0',
        background: '#fafafa',
        fontSize: 12,
        minHeight: 28,
      }}
    >
      <Text size="xs" c={message ? 'red' : 'dimmed'}>
        {message ?? '準備完了'}
      </Text>
      <Group gap="md" ml="auto">
        <Text size="xs" c="dimmed">
          縮尺: {scaleRatio.toFixed(2)} px/m
        </Text>
        <Text size="xs" c="dimmed">
          表示倍率: {(viewScale * 100).toFixed(0)}%
        </Text>
        <Text size="xs" c="dimmed">
          配置数: {placedCount}
        </Text>
        <Tooltip
          label={<ResidentBreakdown residentTypes={residentTypes} byType={floorByType} />}
          withArrow
          position="top"
          multiline
        >
          <Text size="xs" fw={600} style={{ cursor: 'help' }}>
            居住者数（階層）: {floorResidentTotal} 人
          </Text>
        </Tooltip>
        <Tooltip
          label={<ResidentBreakdown residentTypes={residentTypes} byType={mapByType} />}
          withArrow
          position="top"
          multiline
        >
          <Text size="xs" fw={600} style={{ cursor: 'help' }}>
            居住者数（全体）: {mapResidentTotal} 人
          </Text>
        </Tooltip>
      </Group>
    </Group>
  );
};

export default StatusBar;
