import { useState } from 'react';
import {
  Modal,
  Stack,
  Group,
  TextInput,
  ColorInput,
  ActionIcon,
  Button,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconTrash, IconArrowUp, IconArrowDown } from '@tabler/icons-react';
import type { ResidentType } from '../../shared/types.ts';
import {
  DEFAULT_RESIDENT_TYPE_IDS,
  MAX_ADDITIONAL_RESIDENT_TYPES,
} from '../../shared/constants.ts';

type Props = {
  opened: boolean;
  residentTypes: ResidentType[];
  onClose: () => void;
  onSave: (types: ResidentType[]) => void;
};

const newId = (): string => `resident-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const ResidentTypesModal = ({ opened, residentTypes, onClose, onSave }: Props) => {
  // 編集用のローカルコピー（保存するまで反映しない）
  const [draft, setDraft] = useState<ResidentType[]>(() => residentTypes.map((t) => ({ ...t })));

  const additionalCount = draft.filter((t) => !DEFAULT_RESIDENT_TYPE_IDS.has(t.id)).length;
  const canAdd = additionalCount < MAX_ADDITIONAL_RESIDENT_TYPES;

  const update = (index: number, attrs: Partial<ResidentType>) => {
    setDraft((prev) => prev.map((t, i) => (i === index ? { ...t, ...attrs } : t)));
  };

  const move = (index: number, dir: -1 | 1) => {
    setDraft((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const remove = (index: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const add = () => {
    if (!canAdd) return;
    setDraft((prev) => [...prev, { id: newId(), name: '新しい種類', color: '#607d8b' }]);
  };

  const handleSave = () => {
    // 空名はデフォルト名で補完して保存
    const cleaned = draft.map((t) => ({ ...t, name: t.name.trim() || '名称未設定' }));
    onSave(cleaned);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="居住者種類の設定" centered size="lg">
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          デフォルトの 5 種類は削除できません（表示名・色は変更可）。追加できる種類は最大{' '}
          {MAX_ADDITIONAL_RESIDENT_TYPES} 件です。
        </Text>

        {draft.map((t, i) => {
          const isDefault = DEFAULT_RESIDENT_TYPE_IDS.has(t.id);
          return (
            <Group key={t.id} gap="xs" wrap="nowrap" align="flex-end">
              <ColorInput
                value={t.color}
                onChange={(color) => update(i, { color })}
                w={140}
                format="hex"
                aria-label="表示色"
              />
              <TextInput
                value={t.name}
                onChange={(e) => update(i, { name: e.currentTarget.value })}
                flex={1}
                aria-label="名称"
              />
              <Group gap={2} wrap="nowrap">
                <Tooltip label="上へ">
                  <ActionIcon
                    variant="default"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="上へ移動"
                  >
                    <IconArrowUp size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="下へ">
                  <ActionIcon
                    variant="default"
                    onClick={() => move(i, 1)}
                    disabled={i === draft.length - 1}
                    aria-label="下へ移動"
                  >
                    <IconArrowDown size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={isDefault ? 'デフォルト種類は削除できません' : '削除'}>
                  <ActionIcon
                    variant="default"
                    color="red"
                    onClick={() => remove(i)}
                    disabled={isDefault}
                    aria-label="削除"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          );
        })}

        <Group justify="space-between" mt="xs">
          <Tooltip
            label={canAdd ? '種類を追加' : `追加できるのは最大 ${MAX_ADDITIONAL_RESIDENT_TYPES} 件までです`}
          >
            <Button
              variant="light"
              leftSection={<IconPlus size={16} />}
              onClick={add}
              disabled={!canAdd}
            >
              種類を追加
            </Button>
          </Tooltip>
          <Group>
            <Button variant="default" onClick={onClose}>
              キャンセル
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};

export default ResidentTypesModal;
