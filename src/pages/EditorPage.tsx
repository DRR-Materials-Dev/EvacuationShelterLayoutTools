import { useCallback, useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import AppHeader from '../shared/components/AppHeader.tsx';
import ZoneListPane from '../tools/editor/ZoneListPane.tsx';
import ZoneDetail from '../tools/editor/ZoneDetail.tsx';
import ListToolbar from '../tools/editor/ListToolbar.tsx';
import UserSettingsModal from '../shared/components/UserSettingsModal.tsx';
import { useEditorState } from '../tools/editor/useEditorState.ts';
import { downloadZoneList, readZoneListFile, ZoneListParseError } from '../shared/zoneListIO.ts';

const EditorPage = () => {
  const editor = useEditorState();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 未保存の編集があれば、画面遷移をブロックする
  const blocker = useBlocker(editor.isDirty);

  // 画面離脱（タブ閉じ・リロード）にも警告を出す
  useEffect(() => {
    if (!editor.isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editor.isDirty]);

  const selectedZone = editor.zoneList.zones.find((z) => z.id === editor.selectedId) ?? null;

  /* ---------- ハンドラ ---------- */

  const handleLoad = useCallback(
    async (file: File) => {
      try {
        const list = await readZoneListFile(file);
        editor.loadList(list);
        setErrorMessage(null);
        setStatusMessage(`区画リスト「${list.name}」を読み込みました`);
      } catch (e) {
        const msg = e instanceof ZoneListParseError ? e.message : '区画リストの読み込みに失敗しました';
        setErrorMessage(msg);
        setStatusMessage(null);
      }
    },
    [editor],
  );

  const handleSave = useCallback(() => {
    downloadZoneList(editor.zoneList);
    editor.markSaved();
    setStatusMessage('区画リストを保存しました（共有区画リストも更新）');
    setErrorMessage(null);
  }, [editor]);

  const handleResetConfirm = useCallback(() => {
    editor.resetToDefault();
    setResetConfirm(false);
    setStatusMessage('区画リストをデフォルトに戻しました');
    setErrorMessage(null);
  }, [editor]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader title="区画エディタ" />
      <ListToolbar
        listName={editor.zoneList.name}
        onRenameList={editor.renameList}
        isDirty={editor.isDirty}
        onNew={editor.newList}
        onLoad={(f) => void handleLoad(f)}
        onSave={handleSave}
        onResetDefault={() => setResetConfirm(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* ステータス / エラー */}
      {(statusMessage || errorMessage) && (
        <div style={{ padding: '4px 12px' }}>
          {errorMessage ? (
            <Alert
              icon={<IconAlertTriangle size={16} />}
              color="red"
              variant="light"
              withCloseButton
              onClose={() => setErrorMessage(null)}
            >
              {errorMessage}
            </Alert>
          ) : (
            <Alert color="blue" variant="light" withCloseButton onClose={() => setStatusMessage(null)}>
              {statusMessage}
            </Alert>
          )}
        </div>
      )}

      {/* 保存しない場合の警告 */}
      {editor.isDirty && (
        <div style={{ padding: '4px 12px' }}>
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
            未保存の変更があります。「保存」しない場合、次回起動時に失われる可能性があります。
          </Alert>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ZoneListPane
          zones={editor.zoneList.zones}
          selectedId={editor.selectedId}
          onSelect={editor.selectZone}
          onAdd={editor.addZone}
          onDuplicate={editor.duplicateZone}
          onRemove={editor.removeZone}
        />
        <div style={{ flex: 1, padding: 12, overflow: 'hidden' }}>
          <ZoneDetail
            zone={selectedZone}
            onChange={(attrs) => {
              if (selectedZone) editor.updateZone(selectedZone.id, attrs);
            }}
          />
        </div>
      </div>

      {/* 設定モーダル（開くたびに最新値で再マウント） */}
      {settingsOpen && (
        <UserSettingsModal opened onClose={() => setSettingsOpen(false)} />
      )}

      {/* デフォルトに戻す確認 */}
      <Modal
        opened={resetConfirm}
        onClose={() => setResetConfirm(false)}
        title="区画リストをデフォルトに戻す"
        centered
      >
        <Stack>
          <Text size="sm">
            現在編集中の区画リストを破棄して、デフォルトの区画リストに戻します。
            共有区画リスト（他ツールと共有される設定）もクリアされます。よろしいですか？
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setResetConfirm(false)}>
              キャンセル
            </Button>
            <Button color="red" onClick={handleResetConfirm}>
              デフォルトに戻す
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* 未保存ナビゲーション警告 */}
      <Modal
        opened={blocker.state === 'blocked'}
        onClose={() => blocker.state === 'blocked' && blocker.reset()}
        title="未保存の変更があります"
        centered
      >
        <Stack>
          <Text size="sm">
            まだ保存していない変更があります。このまま移動すると編集内容は失われます。
          </Text>
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => {
                if (blocker.state === 'blocked') blocker.reset();
              }}
            >
              キャンセル
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (blocker.state === 'blocked') blocker.proceed();
              }}
            >
              破棄して移動
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
};

export default EditorPage;
