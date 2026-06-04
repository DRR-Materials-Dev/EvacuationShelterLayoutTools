import { Group, Text } from '@mantine/core';

type Props = {
  scaleRatio: number;
  viewScale: number;
  placedCount: number;
  floorResidentTotal: number;
  mapResidentTotal: number;
  message?: string | null;
};

const StatusBar = ({
  scaleRatio,
  viewScale,
  placedCount,
  floorResidentTotal,
  mapResidentTotal,
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
        <Text size="xs" fw={600}>
          居住者数（階層）: {floorResidentTotal} 人
        </Text>
        <Text size="xs" fw={600}>
          居住者数（全体）: {mapResidentTotal} 人
        </Text>
      </Group>
    </Group>
  );
};

export default StatusBar;
