import { useRef } from 'react';
import { Badge, Button, Group, TextInput, Tooltip } from '@mantine/core';
import {
  IconDeviceFloppy,
  IconFilePlus,
  IconRestore,
  IconSettings,
  IconUpload,
} from '@tabler/icons-react';

type Props = {
  listName: string;
  onRenameList: (name: string) => void;
  isDirty: boolean;
  onNew: () => void;
  onLoad: (file: File) => void;
  onSave: () => void;
  onResetDefault: () => void;
  onOpenSettings: () => void;
};

const ListToolbar = ({
  listName,
  onRenameList,
  isDirty,
  onNew,
  onLoad,
  onSave,
  onResetDefault,
  onOpenSettings,
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Group
      gap="xs"
      px="md"
      py="xs"
      style={{
        borderBottom: '1px solid #e0e0e0',
        background: '#fff',
      }}
      wrap="nowrap"
    >
      <TextInput
        label="リスト名"
        size="xs"
        value={listName}
        onChange={(e) => onRenameList(e.currentTarget.value)}
        styles={{ root: { flex: 1, maxWidth: 320 } }}
      />
      {isDirty && (
        <Badge color="orange" variant="light" mt={18}>
          未保存
        </Badge>
      )}
      <Group gap={6} ml="auto" mt={18} wrap="nowrap">
        <Tooltip label="新規リストを作成">
          <Button variant="default" leftSection={<IconFilePlus size={16} />} onClick={onNew}>
            新規
          </Button>
        </Tooltip>
        <Tooltip label=".list.json を読み込む">
          <Button
            variant="default"
            leftSection={<IconUpload size={16} />}
            onClick={() => inputRef.current?.click()}
          >
            読込
          </Button>
        </Tooltip>
        <input
          ref={inputRef}
          type="file"
          accept=".list.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onLoad(file);
            e.target.value = '';
          }}
        />
        <Tooltip label=".list.json として保存（共有区画リストとしても保存）">
          <Button leftSection={<IconDeviceFloppy size={16} />} onClick={onSave}>
            保存
          </Button>
        </Tooltip>
        <Tooltip label="区画リストをデフォルトに戻す">
          <Button
            variant="default"
            leftSection={<IconRestore size={16} />}
            onClick={onResetDefault}
          >
            デフォルトに戻す
          </Button>
        </Tooltip>
        <Tooltip label="ユーザー設定">
          <Button variant="default" leftSection={<IconSettings size={16} />} onClick={onOpenSettings}>
            設定
          </Button>
        </Tooltip>
      </Group>
    </Group>
  );
};

export default ListToolbar;
