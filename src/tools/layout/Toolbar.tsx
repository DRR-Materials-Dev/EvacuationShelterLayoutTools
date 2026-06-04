import { useRef } from 'react';
import { Button, Group, Tooltip } from '@mantine/core';

// メニュー画面のツールアイコン色に合わせたボタン背景色
const ZONE_LIST_BTN_BG = '#D0EBFF'; // 避難所レイアウトのアイコン色（blue.1）
const LAYOUT_BTN_BG = '#C3FAE8'; // 区画エディタのアイコン色（teal.1）
import {
  IconPhoto,
  IconRuler,
  IconZoomIn,
  IconZoomOut,
  IconTextSize,
  IconTrash,
  IconTrashX,
  IconDeviceFloppy,
  IconUpload,
  IconList,
  IconRestore,
  IconSettings,
  IconPhotoDown,
  IconUsers,
  IconPolygon,
  IconEye,
  IconEyeOff,
} from '@tabler/icons-react';

type Props = {
  isScaleMode: boolean;
  isAddingText: boolean;
  isAddingPolygon: boolean;
  showZones: boolean;
  hasSelection: boolean;
  onLoadBackgroundImage: (file: File) => void;
  onToggleScaleMode: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAddText: () => void;
  onAddPolygon: () => void;
  onToggleShowZones: () => void;
  onOpenResidentTypes: () => void;
  onRemoveSelected: () => void;
  onClearAll: () => void;
  onSaveLayout: () => void;
  onLoadLayoutFile: (file: File) => void;
  onLoadZoneListFile: (file: File) => void;
  onResetZoneList: () => void;
  onOpenSettings: () => void;
  onDownloadPng: () => void;
};

const Toolbar = ({
  isScaleMode,
  isAddingText,
  isAddingPolygon,
  showZones,
  hasSelection,
  onLoadBackgroundImage,
  onToggleScaleMode,
  onZoomIn,
  onZoomOut,
  onAddText,
  onAddPolygon,
  onToggleShowZones,
  onOpenResidentTypes,
  onRemoveSelected,
  onClearAll,
  onSaveLayout,
  onLoadLayoutFile,
  onLoadZoneListFile,
  onResetZoneList,
  onOpenSettings,
  onDownloadPng,
}: Props) => {
  const bgInputRef = useRef<HTMLInputElement>(null);
  const layoutInputRef = useRef<HTMLInputElement>(null);
  const listInputRef = useRef<HTMLInputElement>(null);

  return (
    <Group
      gap="xs"
      px="md"
      py="xs"
      style={{
        borderBottom: '1px solid #e0e0e0',
        background: '#fff',
        overflowX: 'auto',
      }}
      wrap="nowrap"
    >
      <Tooltip label="施設の図面画像を読み込む">
        <Button
          variant="default"
          leftSection={<IconPhoto size={16} />}
          onClick={() => bgInputRef.current?.click()}
        >
          施設画像
        </Button>
      </Tooltip>
      <input
        ref={bgInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onLoadBackgroundImage(file);
          e.target.value = '';
        }}
      />

      <Tooltip label="図面上の 2 点をクリックして実距離を入力">
        <Button
          variant={isScaleMode ? 'filled' : 'default'}
          color={isScaleMode ? 'blue' : undefined}
          leftSection={<IconRuler size={16} />}
          onClick={onToggleScaleMode}
        >
          {isScaleMode ? '縮尺設定中…' : '縮尺設定'}
        </Button>
      </Tooltip>

      <Group gap={4} wrap="nowrap">
        <Tooltip label="拡大">
          <Button variant="default" px={8} onClick={onZoomIn}>
            <IconZoomIn size={16} />
          </Button>
        </Tooltip>
        <Tooltip label="縮小">
          <Button variant="default" px={8} onClick={onZoomOut}>
            <IconZoomOut size={16} />
          </Button>
        </Tooltip>
      </Group>

      <Tooltip label={isAddingText ? '配置先をクリックしてください（再度押すとキャンセル）' : 'テキスト追加: 押してから配置先をクリック'}>
        <Button
          variant={isAddingText ? 'filled' : 'default'}
          color={isAddingText ? 'blue' : undefined}
          leftSection={<IconTextSize size={16} />}
          onClick={onAddText}
        >
          {isAddingText ? 'テキスト配置中…' : 'テキスト'}
        </Button>
      </Tooltip>

      <Tooltip
        label={
          isAddingPolygon
            ? 'クリックで頂点追加 / ダブルクリックか始点クリックで確定 / Esc で取消'
            : 'ゾーン作図: 押してから頂点を順にクリック'
        }
      >
        <Button
          variant={isAddingPolygon ? 'filled' : 'default'}
          color={isAddingPolygon ? 'blue' : undefined}
          leftSection={<IconPolygon size={16} />}
          onClick={onAddPolygon}
        >
          {isAddingPolygon ? 'ゾーン作図中…' : 'ゾーン'}
        </Button>
      </Tooltip>

      <Tooltip label={showZones ? 'ゾーンを非表示にする' : 'ゾーンを表示する'}>
        <Button
          variant="default"
          leftSection={showZones ? <IconEye size={16} /> : <IconEyeOff size={16} />}
          onClick={onToggleShowZones}
        >
          {showZones ? 'ゾーン表示' : 'ゾーン非表示'}
        </Button>
      </Tooltip>

      <Tooltip label="居住者の種類（性質）を編集">
        <Button
          variant="default"
          leftSection={<IconUsers size={16} />}
          onClick={onOpenResidentTypes}
        >
          居住者種類
        </Button>
      </Tooltip>

      <Tooltip label="選択中の区画を削除">
        <Button
          variant="default"
          leftSection={<IconTrash size={16} />}
          onClick={onRemoveSelected}
          disabled={!hasSelection}
        >
          選択削除
        </Button>
      </Tooltip>

      <Tooltip label="全て削除（背景画像も含む）">
        <Button variant="default" color="red" leftSection={<IconTrashX size={16} />} onClick={onClearAll}>
          全削除
        </Button>
      </Tooltip>

      <Group gap={4} ml="auto" wrap="nowrap">
        <Tooltip label="区画リスト (.list.json) を読み込む">
          <Button
            variant="default"
            leftSection={<IconList size={16} />}
            onClick={() => listInputRef.current?.click()}
            style={{ backgroundColor: ZONE_LIST_BTN_BG }}
          >
            区画リスト読込
          </Button>
        </Tooltip>

        <Tooltip label="区画リストを既定 (デフォルト) に戻す">
          <Button
            variant="default"
            leftSection={<IconRestore size={16} />}
            onClick={onResetZoneList}
            style={{ backgroundColor: ZONE_LIST_BTN_BG }}
          >
            区画リスト初期化
          </Button>
        </Tooltip>
        <input
          ref={listInputRef}
          type="file"
          accept=".list.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onLoadZoneListFile(file);
            e.target.value = '';
          }}
        />

        <Tooltip label="レイアウト (.layout.json) を読み込む">
          <Button
            variant="default"
            leftSection={<IconUpload size={16} />}
            onClick={() => layoutInputRef.current?.click()}
            style={{ backgroundColor: LAYOUT_BTN_BG }}
          >
            レイアウト読込
          </Button>
        </Tooltip>
        <input
          ref={layoutInputRef}
          type="file"
          accept=".layout.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onLoadLayoutFile(file);
            e.target.value = '';
          }}
        />

        <Tooltip label="レイアウト (.layout.json) を保存">
          <Button
            variant="default"
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={onSaveLayout}
            style={{ backgroundColor: LAYOUT_BTN_BG }}
          >
            レイアウト保存
          </Button>
        </Tooltip>

        <Tooltip label="現在の表示を PNG として保存">
          <Button color="blue" leftSection={<IconPhotoDown size={16} />} onClick={onDownloadPng}>
            画像保存
          </Button>
        </Tooltip>

        <Tooltip label="ユーザー設定（スナップ等）">
          <Button variant="default" leftSection={<IconSettings size={16} />} onClick={onOpenSettings}>
            設定
          </Button>
        </Tooltip>
      </Group>
    </Group>
  );
};

export default Toolbar;
