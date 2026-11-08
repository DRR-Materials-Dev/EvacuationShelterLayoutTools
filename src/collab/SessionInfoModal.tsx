/**
 * 参加者の招待モーダル（Electron ホストアプリ専用）。設計書 §9.15 / §9.17 / §9.23。
 *
 * 参加用 URL を「テキスト＋コピー」と「QR コード」の両方で提示する。
 * §9.17 で一度 QR を廃止したが（参加者は PC 前提のため）、インターネットに繋がらない
 * 閉じた LAN では URL をコピーしても相手に送れない。QR をスマートフォンで読み取って
 * URL を確認し、PC へ手入力する導線が必要なため復活させた。
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button, Code, CopyButton, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { getElectronAPI, type CollabSessionInfo } from './electron.ts';

/**
 * 選択肢のラベルにインターフェース名を併記する（例: `192.168.0.132（Wi-Fi）`）。
 * どのネットワークのアドレスなのかが分からないと選び間違えるため。設計書 §9.21。
 */
const networkOptions = (info: CollabSessionInfo) =>
  info.lanIps.map((address) => {
    const iface = info.lanNetworks?.find((n) => n.address === address)?.iface;
    if (!iface) return { value: address, label: address };
    // WSL などの仮想ネットワークは参加者から届かないことが多いので明示する（v2.6.0）
    const virtual = /vEthernet|WSL|Hyper-V|Docker|VirtualBox|VMware|VMnet/i.test(iface);
    return {
      value: address,
      label: virtual ? `${address}（${iface}・仮想ネットワーク）` : `${address}（${iface}）`,
    };
  });

const SessionInfoModal = ({ onClose }: { onClose: () => void }) => {
  const [info, setInfo] = useState<CollabSessionInfo | null>(null);
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

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

  // 選択中のアドレスが変わると URL も変わるので QR を作り直す。
  // setState は非同期パスでのみ呼ぶ（同期的に呼ぶと react-hooks/set-state-in-effect に触れる）。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = url
        ? await QRCode.toDataURL(url, { width: 200, margin: 1 }).catch(() => null)
        : null;
      if (!cancelled) setQrDataUrl(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

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
            description="参加者が接続している Wi‑Fi / 有線 LAN と同じものを選びます。"
            data={networkOptions(info)}
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
            {qrDataUrl && (
              <Stack gap={4} align="center">
                <img
                  src={qrDataUrl}
                  alt="参加用 URL の QR コード"
                  width={200}
                  height={200}
                  style={{ background: '#fff', padding: 8, borderRadius: 4 }}
                />
                <Text size="xs" c="dimmed" ta="center">
                  スマートフォンのカメラで読み取ると URL を確認できます。
                  <br />
                  （表示された URL を参加者の PC に入力してください）
                </Text>
              </Stack>
            )}
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
