import { Button, Group, Tooltip } from '@mantine/core';
import {
  IconClipboard,
  IconCopy,
  IconSelectAll,
  IconSquareOff,
  IconTrash,
  IconVectorTriangle,
} from '@tabler/icons-react';

type Props = {
  hasSelection: boolean;
  canPaste: boolean;
  multiSelect: boolean;
  zoneMoveAlone: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onDeselect: () => void;
  onToggleMultiSelect: () => void;
  onToggleZoneMoveAlone: () => void;
};

/**
 * キーボードが無いタブレット（iPad 等）向けの編集操作（v2.7.0）。階層タブの帯の右側に置く。
 * それぞれ Ctrl+C / Ctrl+V / Delete / Esc / Shift+クリック / Alt+ドラッグ の代わり。マウスでも使える。
 */
const EditActionsBar = ({
  hasSelection,
  canPaste,
  multiSelect,
  zoneMoveAlone,
  onCopy,
  onPaste,
  onDelete,
  onDeselect,
  onToggleMultiSelect,
  onToggleZoneMoveAlone,
}: Props) => (
  <Group gap={4} wrap="nowrap" ml="auto" pl="md">
    <Tooltip label="選択中のものをコピー（Ctrl+C）">
      <Button
        size="compact-sm"
        variant="default"
        leftSection={<IconCopy size={14} />}
        onClick={onCopy}
        disabled={!hasSelection}
      >
        コピー
      </Button>
    </Tooltip>
    <Tooltip label="コピーしたものを貼り付け（Ctrl+V）。別の階層にも貼り付けられます">
      <Button
        size="compact-sm"
        variant="default"
        leftSection={<IconClipboard size={14} />}
        onClick={onPaste}
        disabled={!canPaste}
      >
        貼り付け
      </Button>
    </Tooltip>
    <Tooltip label="選択中のものを削除（Delete）">
      <Button
        size="compact-sm"
        variant="default"
        color="red"
        leftSection={<IconTrash size={14} />}
        onClick={onDelete}
        disabled={!hasSelection}
      >
        削除
      </Button>
    </Tooltip>
    <Tooltip label="選択を解除（Esc）">
      <Button
        size="compact-sm"
        variant="default"
        leftSection={<IconSquareOff size={14} />}
        onClick={onDeselect}
        disabled={!hasSelection}
      >
        選択解除
      </Button>
    </Tooltip>
    <Tooltip label="ON の間、区画をタップするたびに選択へ追加／解除します（Shift+クリックと同じ）">
      <Button
        size="compact-sm"
        variant={multiSelect ? 'filled' : 'default'}
        leftSection={<IconSelectAll size={14} />}
        onClick={onToggleMultiSelect}
      >
        複数選択{multiSelect ? '：ON' : ''}
      </Button>
    </Tooltip>
    <Tooltip label="ON の間、ゾーンをドラッグしても中の区画は動かしません（Alt+ドラッグと同じ）">
      <Button
        size="compact-sm"
        variant={zoneMoveAlone ? 'filled' : 'default'}
        leftSection={<IconVectorTriangle size={14} />}
        onClick={onToggleZoneMoveAlone}
      >
        ゾーンだけ移動{zoneMoveAlone ? '：ON' : ''}
      </Button>
    </Tooltip>
  </Group>
);

export default EditActionsBar;
