import {
  Stack,
  Group,
  Text,
  TextInput,
  Select,
  ColorInput,
  NumberInput,
  Slider,
  Switch,
  Divider,
  ColorSwatch,
  ActionIcon,
  Tooltip,
  Button,
} from '@mantine/core';
import { IconEye, IconEyeOff, IconTrash, IconX } from '@tabler/icons-react';
import type { PolygonZone, ResidentType } from '../../shared/types.ts';
import { DEFAULT_POLYGON_LABEL_FONT_PX } from '../../shared/constants.ts';

type Props = {
  polygon: PolygonZone;
  residentTypes: ResidentType[];
  byType: Record<string, number>;
  total: number;
  onChange: (attrs: Partial<PolygonZone>) => void;
  /** ゾーン内に完全に収まる区画の数。 */
  innerZoneCount: number;
  /** ゾーン内の区画の区画名表示を一括設定する（v2.7.0）。undefined は区画リストの設定に戻す。 */
  onInnerZonesShowName: (show: boolean | undefined) => void;
  /** ゾーンのドラッグで中の区画を動かさない（Alt キーの代わり。タブレット向け）。 */
  moveAlone: boolean;
  onMoveAloneChange: (v: boolean) => void;
  /** 選択中のもの（ゾーン、ゾーン内選択なら中の区画も）を削除する。 */
  onDelete: () => void;
  /** ゾーン内選択中か（削除ボタンの表記用）。 */
  innerSelection: boolean;
  onClose: () => void;
};

/**
 * ゾーン（多角形）を選択したときの右側パネル。
 * 枠線・塗りの設定と、内包される区画の居住者カウントを表示する（設計書 §8.1.3/§8.1.4）。
 */
const PolygonPanel = ({
  polygon,
  residentTypes,
  byType,
  total,
  onChange,
  innerZoneCount,
  onInnerZonesShowName,
  moveAlone,
  onMoveAloneChange,
  onDelete,
  innerSelection,
  onClose,
}: Props) => {
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
        <Text fw={600} size="sm">
          ゾーン設定
        </Text>
        <Tooltip label="選択を解除">
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="選択を解除">
            <IconX size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <TextInput
        label="ラベル（任意）"
        value={polygon.label ?? ''}
        onChange={(e) => onChange({ label: e.currentTarget.value })}
        placeholder="例: 居住エリアA"
      />
      <Switch
        label="ラベルを図面に表示"
        checked={polygon.showLabel === true}
        onChange={(e) => onChange({ showLabel: e.currentTarget.checked })}
      />
      {polygon.showLabel === true && (
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <NumberInput
            label="文字サイズ (px)"
            value={polygon.labelFontSize ?? DEFAULT_POLYGON_LABEL_FONT_PX}
            onChange={(v) =>
              onChange({ labelFontSize: typeof v === 'number' && v > 0 ? v : DEFAULT_POLYGON_LABEL_FONT_PX })
            }
            min={6}
            max={200}
            step={2}
            allowDecimal={false}
            style={{ flex: 1 }}
          />
          <ColorInput
            label="文字色"
            value={polygon.labelColor ?? '#000000'}
            onChange={(c) => onChange({ labelColor: c })}
            format="hex"
            style={{ flex: 1 }}
          />
        </Group>
      )}

      <Switch
        label="ゾーンだけ移動（中の区画は動かさない）"
        description="Alt を押しながらドラッグするのと同じです"
        checked={moveAlone}
        onChange={(e) => onMoveAloneChange(e.currentTarget.checked)}
      />

      <Text size="sm">ゾーン内の区画名（{innerZoneCount} 区画）</Text>
      <Group gap={6} grow>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconEye size={14} />}
          onClick={() => onInnerZonesShowName(true)}
          disabled={innerZoneCount === 0}
        >
          表示
        </Button>
        <Button
          size="xs"
          variant="light"
          color="gray"
          leftSection={<IconEyeOff size={14} />}
          onClick={() => onInnerZonesShowName(false)}
          disabled={innerZoneCount === 0}
        >
          非表示
        </Button>
      </Group>
      <Button
        size="compact-xs"
        style={{ flexShrink: 0 }}
        variant="subtle"
        color="gray"
        onClick={() => onInnerZonesShowName(undefined)}
        disabled={innerZoneCount === 0}
      >
        区画リストの設定に戻す
      </Button>

      <Divider label="枠線" labelPosition="left" />
      <Select
        label="種類"
        value={polygon.strokeStyle}
        onChange={(v) =>
          onChange({ strokeStyle: (v as PolygonZone['strokeStyle']) ?? 'solid' })
        }
        data={[
          { value: 'solid', label: '実線' },
          { value: 'dashed', label: '破線' },
          { value: 'dotted', label: '点線' },
        ]}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
      <ColorInput
        label="色"
        value={polygon.strokeColor}
        onChange={(c) => onChange({ strokeColor: c })}
        format="hex"
      />
      <NumberInput
        label="太さ (px)"
        value={polygon.strokeWidthPx}
        onChange={(v) => onChange({ strokeWidthPx: typeof v === 'number' ? v : 1 })}
        min={0}
        max={20}
        step={1}
        allowDecimal={false}
      />

      <Divider label="塗りつぶし" labelPosition="left" />
      <ColorInput
        label="色"
        value={polygon.fillColor}
        onChange={(c) => onChange({ fillColor: c })}
        format="hex"
      />
      <Text size="sm">透明度: {Math.round(polygon.fillOpacity * 100)}%</Text>
      <Slider
        value={Math.round(polygon.fillOpacity * 100)}
        onChange={(v) => onChange({ fillOpacity: v / 100 })}
        min={0}
        max={100}
        step={5}
        label={(v) => `${v}%`}
      />

      <Divider label="居住者カウント" labelPosition="left" />
      <Switch
        label="カウントを表示"
        checked={polygon.showCount}
        onChange={(e) => onChange({ showCount: e.currentTarget.checked })}
      />
      {residentTypes.map((rt) => {
        const n = byType[rt.id] ?? 0;
        if (n === 0) return null;
        return (
          <Group key={rt.id} gap="xs" wrap="nowrap">
            <ColorSwatch color={rt.color} size={14} />
            <Text size="sm" flex={1} truncate>
              {rt.name}
            </Text>
            <Text size="sm">{n} 人</Text>
          </Group>
        );
      })}
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          ゾーン内合計
        </Text>
        <Text fw={700}>{total} 人</Text>
      </Group>
      <Text size="xs" c="dimmed">
        ※ 区画の四隅すべてがゾーン内に収まる区画のみ集計します。
      </Text>

      <Divider />
      <Button
        size="xs"
        variant="light"
        color="red"
        leftSection={<IconTrash size={14} />}
        style={{ flexShrink: 0 }}
        onClick={onDelete}
      >
        {innerSelection ? 'ゾーンと中の区画を削除' : 'このゾーンを削除'}
      </Button>

    </Stack>
  );
};

export default PolygonPanel;
