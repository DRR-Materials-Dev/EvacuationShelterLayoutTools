import { useState } from 'react';
import { Modal, NumberInput, Select, Button, Group, Stack, Text } from '@mantine/core';

type Unit = 'm' | 'cm';

type Props = {
  opened: boolean;
  distancePx: number;
  onCancel: () => void;
  /** 距離 (m) を返す（cm は変換済み） */
  onSubmit: (distanceMeters: number) => void;
};

/**
 * このコンポーネントは表示のたびに再マウントされる前提（呼び出し側で `key` を切り替える）。
 * 初期値は useState の初期化で一度だけ設定される。
 */
const ScaleCalibrationModal = ({ opened, distancePx, onCancel, onSubmit }: Props) => {
  const [value, setValue] = useState<number | string>(2);
  const [unit, setUnit] = useState<Unit>('m');

  const handleSubmit = () => {
    const num = typeof value === 'number' ? value : Number.parseFloat(value);
    if (!Number.isFinite(num) || num <= 0) return;
    const meters = unit === 'cm' ? num / 100 : num;
    onSubmit(meters);
  };

  return (
    <Modal opened={opened} onClose={onCancel} title="縮尺の設定" centered>
      <Stack>
        <Text size="sm" c="dimmed">
          指定した 2 点の画面上の距離は <strong>{distancePx.toFixed(1)} px</strong> です。
          この 2 点が実際に何メートル離れているかを入力してください。
        </Text>
        <Group align="flex-end" gap="xs">
          <NumberInput
            label="実際の距離"
            value={value}
            onChange={setValue}
            min={0}
            step={0.1}
            decimalScale={3}
            style={{ flex: 1 }}
            data-autofocus
          />
          <Select
            label="単位"
            value={unit}
            onChange={(v) => setUnit(v === 'cm' ? 'cm' : 'm')}
            data={[
              { value: 'm', label: 'm' },
              { value: 'cm', label: 'cm' },
            ]}
            w={90}
            allowDeselect={false}
          />
        </Group>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onCancel}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit}>適用</Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default ScaleCalibrationModal;
