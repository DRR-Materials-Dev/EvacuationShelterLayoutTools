import { useState } from 'react';
import { Button, ColorInput, Group, Modal, NumberInput, Stack, Text, TextInput } from '@mantine/core';

type Props = {
  opened: boolean;
  /** 配置先のメートル座標 */
  position: { x: number; y: number } | null;
  onCancel: () => void;
  onSubmit: (text: string, fontSize: number, color: string) => void;
};

const TEXT_COLOR_SWATCHES = ['#000000', '#333333', '#ffffff', '#e53935', '#1565c0', '#2e7d32', '#f9a825'];

/**
 * テキスト追加モーダル。配置位置はキャンバスで先にクリックして指定済み。
 * 内容・フォントサイズ・文字色を入力させる。
 */
const AddTextModal = ({ opened, position, onCancel, onSubmit }: Props) => {
  const [text, setText] = useState<string>('');
  const [fontSize, setFontSize] = useState<number>(20);
  const [color, setColor] = useState<string>('#000000');

  const handleSubmit = () => {
    if (text.trim().length === 0) return;
    onSubmit(text, fontSize > 0 ? fontSize : 20, color);
  };

  return (
    <Modal opened={opened} onClose={onCancel} title="テキストの追加" centered>
      <Stack>
        {position && (
          <Text size="xs" c="dimmed">
            配置位置: x = {position.x.toFixed(2)} m, y = {position.y.toFixed(2)} m
          </Text>
        )}
        <TextInput
          label="表示する文字列"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          data-autofocus
          placeholder="例: 避難経路、立入禁止 など"
        />
        <NumberInput
          label="フォントサイズ (px)"
          description="配置後はドラッグでサイズ変更も可能"
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
            配置
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default AddTextModal;
