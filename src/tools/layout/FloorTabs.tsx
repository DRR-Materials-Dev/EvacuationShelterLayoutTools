import { useState } from 'react';
import {
  Group,
  Button,
  Menu,
  ActionIcon,
  Modal,
  Stack,
  TextInput,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconPlus,
  IconDotsVertical,
  IconPencil,
  IconTrash,
  IconArrowLeft,
  IconArrowRight,
} from '@tabler/icons-react';
import type { Floor } from '../../shared/types.ts';

type Props = {
  floors: Floor[];
  activeFloorId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
};

const FloorTabs = ({ floors, activeFloorId, onSelect, onAdd, onRename, onRemove, onMove }: Props) => {
  const [renameTarget, setRenameTarget] = useState<Floor | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [removeTarget, setRemoveTarget] = useState<Floor | null>(null);

  const openRename = (floor: Floor) => {
    setRenameTarget(floor);
    setRenameValue(floor.name);
  };

  const submitRename = () => {
    if (renameTarget) onRename(renameTarget.id, renameValue.trim() || renameTarget.name);
    setRenameTarget(null);
  };

  return (
    <Group
      gap={4}
      px="md"
      py={4}
      wrap="nowrap"
      style={{ borderBottom: '1px solid #e0e0e0', background: '#f5f7fa', overflowX: 'auto' }}
    >
      <Text size="xs" c="dimmed" mr={4} style={{ whiteSpace: 'nowrap' }}>
        階層
      </Text>
      {floors.map((f, i) => {
        const isActive = f.id === activeFloorId;
        return (
          <Group key={f.id} gap={0} wrap="nowrap">
            <Button
              size="xs"
              variant={isActive ? 'filled' : 'default'}
              onClick={() => onSelect(f.id)}
              style={{ borderTopRightRadius: isActive ? 0 : undefined, borderBottomRightRadius: isActive ? 0 : undefined }}
            >
              {f.name}
            </Button>
            {isActive && (
              <Menu position="bottom-start" withinPortal>
                <Menu.Target>
                  <ActionIcon
                    size={30}
                    variant="filled"
                    aria-label={`${f.name} の操作`}
                    style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                  >
                    <IconDotsVertical size={14} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => openRename(f)}>
                    名前を変更
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconArrowLeft size={14} />}
                    disabled={i === 0}
                    onClick={() => onMove(f.id, -1)}
                  >
                    左へ移動
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconArrowRight size={14} />}
                    disabled={i === floors.length - 1}
                    onClick={() => onMove(f.id, 1)}
                  >
                    右へ移動
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    disabled={floors.length <= 1}
                    onClick={() => setRemoveTarget(f)}
                  >
                    この階層を削除
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        );
      })}

      <Tooltip label="階層を追加">
        <ActionIcon size={30} variant="light" onClick={onAdd} aria-label="階層を追加">
          <IconPlus size={16} />
        </ActionIcon>
      </Tooltip>

      {/* 名前変更モーダル */}
      <Modal opened={renameTarget !== null} onClose={() => setRenameTarget(null)} title="階層名の変更" centered>
        <Stack>
          <TextInput
            label="階層名"
            value={renameValue}
            onChange={(e) => setRenameValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename();
            }}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRenameTarget(null)}>
              キャンセル
            </Button>
            <Button onClick={submitRename}>変更</Button>
          </Group>
        </Stack>
      </Modal>

      {/* 階層削除確認 */}
      <Modal opened={removeTarget !== null} onClose={() => setRemoveTarget(null)} title="階層の削除" centered>
        <Stack>
          <Text size="sm">
            階層「{removeTarget?.name}」を削除します。この階層の背景画像・配置物・ゾーンもすべて削除されます。よろしいですか？
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRemoveTarget(null)}>
              キャンセル
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (removeTarget) onRemove(removeTarget.id);
                setRemoveTarget(null);
              }}
            >
              削除
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Group>
  );
};

export default FloorTabs;
