import { useState } from 'react';
import { Button, ColorInput, Group, Modal, NumberInput, Stack, TextInput } from '@mantine/core';

type Props = {
  opened: boolean;
  initialText: string;
  initialFontSize: number;
  initialColor: string;
  onCancel: () => void;
  onSubmit: (text: string, fontSize: number, color: string) => void;
};

const TEXT_COLOR_SWATCHES = ['#000000', '#333333', '#ffffff', '#e53935', '#1565c0', '#2e7d32', '#f9a825'];

/**
 * 既存テキストの編集モーダル。内容・フォントサイズ・文字色を変更できる。
 * 開くたびに初期値で再マウントする想定（呼び出し側で `key` を切り替える）。
 */
const EditTextModal = ({
  opened,
  initialText,
  initialFontSize,
  initialColor,
  onCancel,
  onSubmit,
}: Props) => {
  const [text, setText] = useState<string>(initialText);
  const [fontSize, setFontSize] = useState<number>(initialFontSize);
  const [color, setColor] = useState<string>(initialColor);

  const handleSubmit = () => {
    if (text.trim().length === 0) return;
    onSubmit(text, fontSize > 0 ? fontSize : 20, color);
  };

  return (
    <Modal opened={opened} onClose={onCancel} title="テキストの編集" centered>
      <Stack>
        <TextInput
          label="表示する文字列"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          data-autofocus
        />
        <NumberInput
          label="フォントサイズ (px)"
          value={fontSize}
          onChange={(v) => setFontSize(typeof v === 'number' && v > 0 ? v : 20)}
          min={6}
          max={200}
          step={1}
        />
        <ColorInput
          label="文字色"
          value={color}
          onChange={setColor}
          format="hex"
          swatches={TEXT_COLOR_SWATCHES}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onCancel}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={text.trim().length === 0}>
            更新
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default EditTextModal;
