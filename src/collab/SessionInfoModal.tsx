/**
 * 参加者の招待モーダル（Electron ホストアプリ専用）。設計書 §9.15 / §9.17。
 * 参加用 URL を表示・コピーする。参加者は PC のブラウザで開く前提（QR は廃止）。
 */
import { useEffect, useState } from 'react';
import { Button, Code, CopyButton, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { getElectronAPI, type CollabSessionInfo } from './electron.ts';

const SessionInfoModal = ({ onClose }: { onClose: () => void }) => {
  const [info, setInfo] = useState<CollabSessionInfo | null>(null);
  const [selectedIp, setSelectedIp] = useState<string | null>(null);

  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;
    void api.getSessionInfo().then((i) => {
      setInfo(i);
      if (i && i.lanIps.length > 0) setSelectedIp(i.lanIps[0]);
    });
  }, []);

  const url =
    info && selectedIp ? `http://${selectedIp}:${info.port}/?room=${info.room}#/layout` : '';

  return (
    <Modal
      opened
      onClose={onClose}
      title="参加者を招待（参加者と同じ Wi‑Fi に接続してください）"
      centered
      size="md"
    >
      <Stack>
        {!info && <Text size="sm">セッション情報を取得しています…</Text>}
        {info && info.lanIps.length === 0 && (
          <Text size="sm" c="red">
            LAN アドレスが見つかりませんでした。Wi‑Fi / 有線 LAN に接続されているか確認してください。
          </Text>
        )}
        {info && info.lanIps.length > 1 && (
          <Select
            label="ネットワーク（参加者と同じものを選んでください）"
            data={info.lanIps}
            value={selectedIp}
            onChange={setSelectedIp}
            allowDeselect={false}
          />
        )}
        {url && (
          <>
            <Text size="sm">参加者は PC のブラウザで次の URL を開きます：</Text>
            <Code block>{url}</Code>
            <Group>
              <CopyButton value={url}>
                {({ copied, copy }) => (
                  <Button variant="light" onClick={copy}>
                    {copied ? 'コピーしました' : 'URL をコピー'}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Text size="xs" c="dimmed">
              ※ 参加者は PC（スマートフォン非対応）のブラウザでご利用ください。<br />
              ⚠ 通信は暗号化されていません（ws://）。信頼できる LAN 内でのみ使用し、機微・実在の図面や
              個人が特定され得る情報は扱わないでください。
            </Text>
          </>
        )}
      </Stack>
    </Modal>
  );
};

export default SessionInfoModal;
