import { Button, Group, Tooltip } from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconClipboard,
  IconCopy,
  IconSelectAll,
  IconSquareOff,
  IconTrash,
  IconVectorTriangle,
} from '@tabler/icons-react';

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  /** 元に戻す・やり直しを使えないときの理由（ツールチップに出す）。使えるときは null。 */
  undoBlockedReason: string | null;
  hasSelection: boolean;
  canPaste: boolean;
  multiSelect: boolean;
  zoneMoveAlone: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onDeselect: () => void;
  onToggleMultiSelect: () => void;
  onToggleZoneMoveAlone: () => void;
};

/**
 * キーボードが無いタブレット（iPad 等）向けの編集操作（v2.7.0）。階層タブの帯の右側に置く。
 * それぞれ Ctrl+Z / Ctrl+Y / Ctrl+C / Ctrl+V / Delete / Esc / Shift+クリック / Alt+ドラッグ の代わり。マウスでも使える。
 * 元に戻す・やり直しは v2.8.0（設計書 §14）。
 */
const EditActionsBar = ({
  canUndo,
  canRedo,
  undoBlockedReason,
  hasSelection,
  canPaste,
  multiSelect,
  zoneMoveAlone,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onDelete,
  onDeselect,
  onToggleMultiSelect,
  onToggleZoneMoveAlone,
}: Props) => (
  <Group gap={4} wrap="nowrap" ml="auto" pl="md">
    <Tooltip
      label={
        undoBlockedReason ??
        '直前の操作を元に戻す（Ctrl+Z）。マルチ操作では自分の操作だけを戻します'
      }
    >
      <Button
        size="compact-sm"
        variant="default"
        leftSection={<IconArrowBackUp size={14} />}
        onClick={onUndo}
        disabled={!canUndo || undoBlockedReason !== null}
      >
        元に戻す
      </Button>
    </Tooltip>
    <Tooltip label={undoBlockedReason ?? '元に戻した操作をやり直す（Ctrl+Y／Ctrl+Shift+Z）'}>
      <Button
        size="compact-sm"
        variant="default"
        leftSection={<IconArrowForwardUp size={14} />}
        onClick={onRedo}
        disabled={!canRedo || undoBlockedReason !== null}
        mr="xs"
      >
        やり直し
      </Button>
    </Tooltip>
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
