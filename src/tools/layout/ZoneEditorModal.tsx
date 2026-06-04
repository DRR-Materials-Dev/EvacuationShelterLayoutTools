import { useCallback, useState } from 'react';
import { Modal, Group, Button, TextInput, Box } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import type { ZoneList, ZoneType } from '../../shared/types.ts';
import ZoneListPane from '../editor/ZoneListPane.tsx';
import ZoneDetail from '../editor/ZoneDetail.tsx';

type Props = {
  opened: boolean;
  initialList: ZoneList;
  onClose: () => void;
  /** 編集内容をレイアウトへ適用（パレット反映）。共有リストには保存しない。 */
  onApply: (list: ZoneList) => void;
  /** 編集内容をレイアウトへ適用し、共有区画リストにも保存する。 */
  onSaveShared: (list: ZoneList) => void;
};

const genId = () => `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const cloneList = (list: ZoneList): ZoneList => ({
  ...list,
  zones: list.zones.map((z) => ({ ...z, image: z.image ? { ...z.image } : undefined })),
});

/**
 * レイアウト画面から区画エディタをモーダルで開くコンポーネント（設計書 §8.2）。
 * 区画エディタ本体（ZoneListPane / ZoneDetail）を再利用し、レイアウトの区画リストを
 * 作業コピーで編集する。
 */
const ZoneEditorModal = ({ opened, initialList, onClose, onApply, onSaveShared }: Props) => {
  const [list, setList] = useState<ZoneList>(() => cloneList(initialList));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedZone = list.zones.find((z) => z.id === selectedId) ?? null;

  const addZone = useCallback(() => {
    const newZone: ZoneType = {
      id: genId(),
      name: '新規区画',
      width: 1,
      height: 1,
      color: '#cccccc',
      resizable: true,
    };
    setList((prev) => ({ ...prev, zones: [...prev.zones, newZone] }));
    setSelectedId(newZone.id);
  }, []);

  const duplicateZone = useCallback((id: string) => {
    setList((prev) => {
      const src = prev.zones.find((z) => z.id === id);
      if (!src) return prev;
      const copy: ZoneType = {
        ...src,
        id: genId(),
        name: `${src.name} のコピー`,
        image: src.image ? { ...src.image } : undefined,
      };
      const idx = prev.zones.findIndex((z) => z.id === id);
      const next = [...prev.zones];
      next.splice(idx + 1, 0, copy);
      return { ...prev, zones: next };
    });
  }, []);

  const removeZone = useCallback((id: string) => {
    setList((prev) => ({ ...prev, zones: prev.zones.filter((z) => z.id !== id) }));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const updateZone = useCallback((id: string, attrs: Partial<ZoneType>) => {
    setList((prev) => ({
      ...prev,
      zones: prev.zones.map((z) => (z.id === id ? { ...z, ...attrs } : z)),
    }));
  }, []);

  const finalize = (): ZoneList => ({ ...list, name: list.name.trim() || '区画リスト' });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="区画の追加・編集"
      size="90%"
      centered
      styles={{ body: { paddingTop: 8 } }}
    >
      <TextInput
        label="区画リスト名"
        value={list.name}
        onChange={(e) => {
          const value = e.currentTarget.value;
          setList((prev) => ({ ...prev, name: value }));
        }}
        mb="sm"
        description="共有リストに保存する際のファイル名になります。変更するとレイアウトの参照リスト名も更新されます。"
      />
      <Box style={{ display: 'flex', height: '60vh', border: '1px solid #e0e0e0', borderRadius: 4, overflow: 'hidden' }}>
        <ZoneListPane
          zones={list.zones}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={addZone}
          onDuplicate={duplicateZone}
          onRemove={removeZone}
        />
        <div style={{ flex: 1, padding: 12, overflow: 'auto' }}>
          <ZoneDetail
            zone={selectedZone}
            onChange={(attrs) => {
              if (selectedZone) updateZone(selectedZone.id, attrs);
            }}
          />
        </div>
      </Box>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          キャンセル
        </Button>
        <Button
          variant="light"
          onClick={() => {
            onApply(finalize());
            onClose();
          }}
        >
          適用して閉じる
        </Button>
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={() => {
            onSaveShared(finalize());
            onClose();
          }}
        >
          共有リストに保存
        </Button>
      </Group>
    </Modal>
  );
};

export default ZoneEditorModal;
