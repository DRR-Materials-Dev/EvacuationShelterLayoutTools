import { useState } from 'react';
import { Button, Group, Modal, NumberInput, Stack, Switch, Text } from '@mantine/core';
import { useUserSettings } from '../settings.tsx';
import { ZONE_HULL_MIN_MARGIN } from '../types.ts';

type Props = {
  opened: boolean;
  onClose: () => void;
};

/**
 * ユーザー設定モーダル。スナップ設定（有効/無効・サイズ）を編集する。
 * 全ツール共通の設定（IndexedDB の `evac-tool/user-settings`）を読み書きする。
 *
 * 開くたびに最新の設定を反映するため、呼び出し側で `key` を切り替えるか、
 * `opened` が false のときはアンマウントすることを推奨。
 */
const UserSettingsModal = ({ opened, onClose }: Props) => {
  const { settings, updateSettings } = useUserSettings();
  const [snapEnabled, setSnapEnabled] = useState<boolean>(settings.snap.enabled);
  const [snapSize, setSnapSize] = useState<number>(settings.snap.sizeMeters);
  const [rotEnabled, setRotEnabled] = useState<boolean>(settings.rotationSnap.enabled);
  const [rotDegrees, setRotDegrees] = useState<number>(settings.rotationSnap.degrees);
  const [hullMargin, setHullMargin] = useState<number>(settings.zoneHull.marginMeters);

  const handleSubmit = () => {
    updateSettings({
      snap: {
        enabled: snapEnabled,
        sizeMeters: snapSize > 0 ? snapSize : 0.1,
      },
      rotationSnap: {
        enabled: rotEnabled,
        degrees: rotDegrees > 0 && rotDegrees <= 180 ? rotDegrees : 15,
      },
      zoneHull: {
        marginMeters: hullMargin >= ZONE_HULL_MIN_MARGIN ? hullMargin : ZONE_HULL_MIN_MARGIN,
      },
    });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="ユーザー設定" centered>
      <Stack>
        <Text size="sm" c="dimmed">
          区画のサイズ・配置に対するスナップの設定です。すべてのツールに反映されます。
          配置の移動中に Ctrl キーを押していると、スナップの ON/OFF が反転します。
        </Text>
        <Switch
          label="スナップを有効にする"
          checked={snapEnabled}
          onChange={(e) => setSnapEnabled(e.currentTarget.checked)}
        />
        <NumberInput
          label="スナップサイズ (m)"
          description="例: 0.1 = 10cm 刻み"
          value={snapSize}
          onChange={(v) => setSnapSize(typeof v === 'number' ? v : 0.1)}
          min={0.001}
          step={0.05}
          decimalScale={3}
          disabled={!snapEnabled}
        />
        <Text size="sm" c="dimmed" mt="sm">
          区画・テキストを回転するときの角度スナップです。回転中に Ctrl キーを押していると ON/OFF が反転します。
        </Text>
        <Switch
          label="角度スナップを有効にする"
          checked={rotEnabled}
          onChange={(e) => setRotEnabled(e.currentTarget.checked)}
        />
        <NumberInput
          label="スナップ角度 (°)"
          description="例: 15 = 15° 刻み"
          value={rotDegrees}
          onChange={(v) => setRotDegrees(typeof v === 'number' ? v : 15)}
          min={1}
          max={180}
          step={5}
          decimalScale={1}
          disabled={!rotEnabled}
        />
        <Text size="sm" c="dimmed" mt="sm">
          区画を複数選択して「囲むゾーンを作成」するときの、区画の外周からゾーンの線までの余白です。
        </Text>
        <NumberInput
          label="囲むゾーンの余白 (m)"
          description={`例: 0.2 = 20cm（${ZONE_HULL_MIN_MARGIN}m 以上）`}
          value={hullMargin}
          onChange={(v) => setHullMargin(typeof v === 'number' ? v : 0.2)}
          min={ZONE_HULL_MIN_MARGIN}
          step={0.05}
          decimalScale={2}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit}>適用</Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default UserSettingsModal;
