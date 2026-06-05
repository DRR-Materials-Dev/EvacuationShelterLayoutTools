/**
 * 表示名・色の変更モーダル（マルチ操作）。設計書 §9.19。
 * 自分のプレゼンス（カーソル・選択リングの色とラベル名）を変更する。ホスト・参加者の双方が使える。
 * 変更は端末に保存され、再参加・再読込でも引き継がれる。
 */
import { useState } from 'react';
import { Button, ColorInput, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { PRESENCE_COLORS, type PresenceUser } from './presence.ts';

type Props = {
  opened: boolean;
  user: PresenceUser;
  onApply: (user: PresenceUser) => void;
  onClose: () => void;
};

const PresenceSettingsModal = ({ opened, user, onApply, onClose }: Props) => {
  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.color);

  const handleSubmit = () => {
    onApply({ name: name.trim() || user.name, color: color || user.color });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="表示名・色の変更" centered size="sm">
      <Stack>
        <Text size="sm" c="dimmed">
          他の参加者に見えるあなたのカーソル・選択枠の名前と色です。
        </Text>
        <TextInput
          label="表示名"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          data-autofocus
        />
        <ColorInput
          label="色"
          value={color}
          onChange={setColor}
          format="hex"
          swatches={PRESENCE_COLORS}
          swatchesPerRow={8}
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

export default PresenceSettingsModal;
