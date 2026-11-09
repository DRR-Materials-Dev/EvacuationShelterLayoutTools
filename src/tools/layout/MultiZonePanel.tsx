import { ActionIcon, Button, Divider, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconEye, IconEyeOff, IconTrash, IconX } from '@tabler/icons-react';

type Props = {
  count: number;
  /** 区画名表示の一括設定。undefined は区画リストの設定に戻す。 */
  onShowNameChange: (show: boolean | undefined) => void;
  /** 選択中の区画をまとめて削除する（Delete キーの無いタブレット向け）。 */
  onDelete: () => void;
  onClose: () => void;
};

/** 複数の区画を選択したときの右側パネル。区画名の表示をまとめて切り替える（v2.7.0）。 */
const MultiZonePanel = ({ count, onShowNameChange, onDelete, onClose }: Props) => (
  <Stack
    gap="xs"
    p="md"
    style={{ width: 260, borderLeft: '1px solid #e0e0e0', background: '#fff', overflowY: 'auto' }}
  >
    <Group justify="space-between" wrap="nowrap">
      <Text fw={600} size="sm">
        {count} 個の区画を選択中
      </Text>
      <Tooltip label="選択を解除">
        <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="選択を解除">
          <IconX size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
    <Text size="sm">区画名の表示</Text>
    <Group gap={6} grow>
      <Button size="xs" variant="light" leftSection={<IconEye size={14} />} onClick={() => onShowNameChange(true)}>
        表示
      </Button>
      <Button
        size="xs"
        variant="light"
        color="gray"
        leftSection={<IconEyeOff size={14} />}
        onClick={() => onShowNameChange(false)}
      >
        非表示
      </Button>
    </Group>
    <Button size="compact-xs" variant="subtle" color="gray" style={{ flexShrink: 0 }} onClick={() => onShowNameChange(undefined)}>
      区画リストの設定に戻す
    </Button>
    <Divider />
    <Button
        size="xs"
        variant="light"
        color="red"
        leftSection={<IconTrash size={14} />}
        style={{ flexShrink: 0 }}
        onClick={onDelete}
      >
        選択した {count} 個の区画を削除
      </Button>
    <Text size="xs" c="dimmed">
      ※ ゾーン（範囲）は対象外です。Shift+クリック／Shift+ドラッグで区画を複数選択できます。
    </Text>
  </Stack>
);

export default MultiZonePanel;
