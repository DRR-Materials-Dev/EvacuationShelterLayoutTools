import { Radio, Stack, Text } from '@mantine/core';
import { ZONE_LIST_PRESETS, type ZoneListPresetId } from '../zoneListPresets.ts';

type Props = {
  value: ZoneListPresetId;
  onChange: (id: ZoneListPresetId) => void;
};

/** 区画リストの初期化時に、戻す先の既定リストを選ぶラジオボタン（v2.7.0）。 */
const ZoneListPresetPicker = ({ value, onChange }: Props) => (
  <Radio.Group
    label="戻す区画リスト"
    value={value}
    onChange={(v) => onChange(v as ZoneListPresetId)}
  >
    <Stack gap="xs" mt={6}>
      {ZONE_LIST_PRESETS.map((p) => (
        <Radio
          key={p.id}
          value={p.id}
          label={p.label}
          description={<Text size="xs" c="dimmed">{p.description}</Text>}
        />
      ))}
    </Stack>
  </Radio.Group>
);

export default ZoneListPresetPicker;
