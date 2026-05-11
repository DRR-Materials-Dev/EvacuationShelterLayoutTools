import {
  Checkbox,
  ColorInput,
  Group,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import type { ZoneType } from '../../shared/types.ts';
import { useUserSettings } from '../../shared/settings.tsx';
import { snapValue } from '../../shared/snap.ts';
import ImageControls from './ImageControls.tsx';
import ZonePreview from './ZonePreview.tsx';

type Props = {
  zone: ZoneType | null;
  onChange: (attrs: Partial<ZoneType>) => void;
};

const ZoneDetail = ({ zone, onChange }: Props) => {
  const { settings } = useUserSettings();

  if (!zone) {
    return (
      <Paper withBorder p="lg" style={{ height: '100%' }}>
        <Stack align="center" justify="center" h="100%">
          <Text c="dimmed">編集する区画を左側から選択してください。</Text>
        </Stack>
      </Paper>
    );
  }

  const stepMeters = settings.snap.enabled ? settings.snap.sizeMeters : 0.01;

  return (
    <Paper withBorder p="md" style={{ height: '100%', overflowY: 'auto' }}>
      <Stack gap="md">
        <Title order={4}>区画の編集</Title>

        <TextInput
          label="名称"
          value={zone.name}
          onChange={(e) => onChange({ name: e.currentTarget.value })}
        />

        <Group grow>
          <NumberInput
            label="幅 (m)"
            value={zone.width}
            onChange={(v) =>
              onChange({ width: clampPositive(snapValue(toNum(v, zone.width), settings)) })
            }
            min={stepMeters}
            step={stepMeters}
            decimalScale={3}
          />
          <NumberInput
            label="高さ (m)"
            value={zone.height}
            onChange={(v) =>
              onChange({ height: clampPositive(snapValue(toNum(v, zone.height), settings)) })
            }
            min={stepMeters}
            step={stepMeters}
            decimalScale={3}
          />
        </Group>

        <ColorInput
          label="塗り潰し色"
          value={zone.color}
          onChange={(v) => onChange({ color: v })}
          format="hex"
          swatches={[
            '#fbc02d',
            '#fdd835',
            '#ffcc80',
            '#ce93d8',
            '#ef9a9a',
            '#80cbc4',
            '#a5d6a7',
            '#90caf9',
            '#cccccc',
          ]}
        />

        <Switch
          label="ユーザーがリサイズ可能にする"
          checked={zone.resizable}
          onChange={(e) => onChange({ resizable: e.currentTarget.checked })}
        />

        <Checkbox
          label="区画名を表示する"
          description="OFF にすると、配置時と印刷時に区画名を描画しません（区画の塗り色・画像のみ表示）"
          checked={zone.showName !== false}
          onChange={(e) => onChange({ showName: e.currentTarget.checked })}
        />

        <Stack gap={6}>
          <Checkbox
            label="枠線を描画する"
            description="白系の区画など、輪郭が見えにくい場合に有効にしてください"
            checked={zone.showBorder !== false}
            onChange={(e) => onChange({ showBorder: e.currentTarget.checked })}
          />
          <Group grow>
            <ColorInput
              label="枠線の色"
              value={zone.borderColor ?? '#333333'}
              onChange={(v) => onChange({ borderColor: v })}
              disabled={zone.showBorder === false}
              format="hex"
              swatches={['#000000', '#333333', '#666666', '#1565c0', '#c62828', '#2e7d32']}
            />
            <NumberInput
              label="枠線の太さ (px)"
              description="区画エディタ画面上での px。1〜3 が目安"
              value={zone.borderWidthPx ?? 1}
              onChange={(v) =>
                onChange({ borderWidthPx: typeof v === 'number' && v >= 0 ? v : 1 })
              }
              min={0}
              step={1}
              max={20}
              disabled={zone.showBorder === false}
            />
          </Group>
        </Stack>

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            画像
          </Text>
          <ImageControls image={zone.image} onChange={(image) => onChange({ image })} />
        </Stack>

        <ZonePreview zone={zone} />
      </Stack>
    </Paper>
  );
};

const toNum = (v: number | string, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const clampPositive = (v: number): number => (v <= 0 ? 0.1 : v);

export default ZoneDetail;
