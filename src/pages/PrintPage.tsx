import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  List,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconDownload,
  IconRefresh,
  IconRestore,
  IconUpload,
} from '@tabler/icons-react';
import AppHeader from '../shared/components/AppHeader.tsx';
import { readZoneListFile, ZoneListParseError } from '../shared/zoneListIO.ts';
import { usePrintState } from '../tools/print/usePrintState.ts';
import {
  PAGE_HEADER_HEIGHT_MM,
  computePages,
  validatePrint,
} from '../tools/print/layoutAlgorithms.ts';
import { downloadPrintHtml, generatePrintHtml } from '../tools/print/htmlGenerator.ts';
import { getPaperSizeMm, getPrintScaleMmPerMeter } from '../tools/print/paperSizes.ts';
import type {
  LayoutAlgorithm,
  Orientation,
  PaperSizeName,
  ScaleUnit,
} from '../tools/print/types.ts';

const PrintPage = () => {
  const state = usePrintState();
  const { settings, zoneList, updateSettings } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  /* ---------- 派生値 ---------- */
  const paperMm = useMemo(() => getPaperSizeMm(settings.paper), [settings.paper]);
  const mmPerMeter = useMemo(() => getPrintScaleMmPerMeter(settings.scale), [settings.scale]);
  const validation = useMemo(() => validatePrint(zoneList, settings), [zoneList, settings]);
  const pages = useMemo(
    () => (validation.ok ? computePages(zoneList, settings) : []),
    [zoneList, settings, validation.ok],
  );
  const totalItems = useMemo(
    () => Object.values(settings.counts).reduce((s, n) => s + (Number(n) || 0), 0),
    [settings.counts],
  );

  const canGenerate = validation.ok && totalItems > 0 && mmPerMeter > 0;

  /* ---------- ハンドラ ---------- */
  const handleLoadFile = async (file: File) => {
    try {
      const list = await readZoneListFile(file);
      state.loadZoneList(list);
      setErrorMessage(null);
      setStatusMessage(`区画リスト「${list.name}」を読み込みました`);
    } catch (e) {
      const msg = e instanceof ZoneListParseError ? e.message : '区画リストの読み込みに失敗しました';
      setErrorMessage(msg);
      setStatusMessage(null);
    }
  };

  const handleResetConfirm = () => {
    state.resetZoneListToDefault();
    setResetConfirm(false);
    setStatusMessage('区画リストをデフォルトに戻しました（枚数指定もリセット）');
    setErrorMessage(null);
  };

  const handleGenerate = () => {
    if (!canGenerate) return;
    const html = generatePrintHtml(zoneList.name, pages, settings);
    const sanitized = zoneList.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'zones';
    downloadPrintHtml(`${sanitized}-印刷.html`, html);
    setStatusMessage(`${pages.length} ページの印刷用 HTML をダウンロードしました`);
    setErrorMessage(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader title="区画印刷" />
      <ScrollArea style={{ flex: 1 }}>
        <Container py="md" size="lg">
          <Stack gap="md">
            {/* リストソース */}
            <Card withBorder>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Title order={5} m={0}>
                    区画リスト
                  </Title>
                  <Group gap="xs">
                    <Tooltip label="共有区画リストを再読み込み">
                      <Button
                        size="xs"
                        variant="default"
                        leftSection={<IconRefresh size={14} />}
                        onClick={() => void state.reloadSharedList()}
                      >
                        共有から再読込
                      </Button>
                    </Tooltip>
                    <Tooltip label=".list.json から読み込み">
                      <Button
                        size="xs"
                        variant="default"
                        leftSection={<IconUpload size={14} />}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        ファイル読込
                      </Button>
                    </Tooltip>
                    <Tooltip label="区画リストをデフォルトに戻す">
                      <Button
                        size="xs"
                        variant="default"
                        leftSection={<IconRestore size={14} />}
                        onClick={() => setResetConfirm(true)}
                      >
                        デフォルトに戻す
                      </Button>
                    </Tooltip>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".list.json"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleLoadFile(file);
                        e.target.value = '';
                      }}
                    />
                  </Group>
                </Group>
                <Text size="sm">
                  現在のリスト: <strong>{zoneList.name}</strong>（{zoneList.zones.length} 件）
                </Text>
              </Stack>
            </Card>

            {/* 用紙設定 */}
            <Card withBorder>
              <Stack gap="xs">
                <Title order={5} m={0}>
                  用紙設定
                </Title>
                <Group grow>
                  <Select
                    label="用紙サイズ"
                    value={settings.paper.size}
                    onChange={(v) =>
                      v &&
                      updateSettings({
                        paper: { ...settings.paper, size: v as PaperSizeName },
                      })
                    }
                    data={[
                      { value: 'A3', label: 'A3 (297 × 420 mm)' },
                      { value: 'A4', label: 'A4 (210 × 297 mm)' },
                      { value: 'B5', label: 'B5 (182 × 257 mm)' },
                      { value: 'custom', label: 'カスタム' },
                    ]}
                    allowDeselect={false}
                  />
                  <Select
                    label="向き"
                    value={settings.paper.orientation}
                    onChange={(v) =>
                      v &&
                      updateSettings({
                        paper: { ...settings.paper, orientation: v as Orientation },
                      })
                    }
                    data={[
                      { value: 'portrait', label: '縦' },
                      { value: 'landscape', label: '横' },
                    ]}
                    allowDeselect={false}
                  />
                </Group>
                {settings.paper.size === 'custom' && (
                  <Group grow>
                    <NumberInput
                      label="カスタム幅 (cm)"
                      value={settings.paper.customWidthCm}
                      onChange={(v) =>
                        updateSettings({
                          paper: {
                            ...settings.paper,
                            customWidthCm: typeof v === 'number' ? v : settings.paper.customWidthCm,
                          },
                        })
                      }
                      min={1}
                      step={0.1}
                      decimalScale={2}
                    />
                    <NumberInput
                      label="カスタム高さ (cm)"
                      value={settings.paper.customHeightCm}
                      onChange={(v) =>
                        updateSettings({
                          paper: {
                            ...settings.paper,
                            customHeightCm: typeof v === 'number' ? v : settings.paper.customHeightCm,
                          },
                        })
                      }
                      min={1}
                      step={0.1}
                      decimalScale={2}
                    />
                  </Group>
                )}
                <SimpleGrid cols={4}>
                  <NumberInput
                    label="マージン上 (mm)"
                    value={settings.margins.top}
                    onChange={(v) =>
                      updateSettings({
                        margins: { ...settings.margins, top: typeof v === 'number' ? v : 0 },
                      })
                    }
                    min={0}
                    step={1}
                  />
                  <NumberInput
                    label="マージン右 (mm)"
                    value={settings.margins.right}
                    onChange={(v) =>
                      updateSettings({
                        margins: { ...settings.margins, right: typeof v === 'number' ? v : 0 },
                      })
                    }
                    min={0}
                    step={1}
                  />
                  <NumberInput
                    label="マージン下 (mm)"
                    value={settings.margins.bottom}
                    onChange={(v) =>
                      updateSettings({
                        margins: { ...settings.margins, bottom: typeof v === 'number' ? v : 0 },
                      })
                    }
                    min={0}
                    step={1}
                  />
                  <NumberInput
                    label="マージン左 (mm)"
                    value={settings.margins.left}
                    onChange={(v) =>
                      updateSettings({
                        margins: { ...settings.margins, left: typeof v === 'number' ? v : 0 },
                      })
                    }
                    min={0}
                    step={1}
                  />
                </SimpleGrid>
                <Text size="xs" c="dimmed">
                  用紙: {paperMm.width.toFixed(0)} × {paperMm.height.toFixed(0)} mm / 印刷可能領域:{' '}
                  {(paperMm.width - settings.margins.left - settings.margins.right).toFixed(0)} ×{' '}
                  {(
                    paperMm.height -
                    settings.margins.top -
                    settings.margins.bottom -
                    PAGE_HEADER_HEIGHT_MM
                  ).toFixed(0)}{' '}
                  mm（上部にヘッダ {PAGE_HEADER_HEIGHT_MM}mm を確保）
                </Text>
              </Stack>
            </Card>

            {/* 縮尺 */}
            <Card withBorder>
              <Stack gap="xs">
                <Title order={5} m={0}>
                  縮尺
                </Title>
                <Text size="xs" c="dimmed">
                  図面上の実距離と、それを印刷上で何 cm にするかを指定します。
                </Text>
                <SimpleGrid cols={3}>
                  <NumberInput
                    label="図面上の長さ"
                    value={settings.scale.drawingLength}
                    onChange={(v) =>
                      updateSettings({
                        scale: {
                          ...settings.scale,
                          drawingLength: typeof v === 'number' ? v : settings.scale.drawingLength,
                        },
                      })
                    }
                    min={0}
                    step={0.1}
                    decimalScale={3}
                  />
                  <Select
                    label="単位"
                    value={settings.scale.drawingUnit}
                    onChange={(v) =>
                      v &&
                      updateSettings({
                        scale: { ...settings.scale, drawingUnit: v as ScaleUnit },
                      })
                    }
                    data={[
                      { value: 'm', label: 'm' },
                      { value: 'cm', label: 'cm' },
                    ]}
                    allowDeselect={false}
                  />
                  <NumberInput
                    label="印刷上の長さ (cm)"
                    value={settings.scale.printLengthCm}
                    onChange={(v) =>
                      updateSettings({
                        scale: {
                          ...settings.scale,
                          printLengthCm: typeof v === 'number' ? v : settings.scale.printLengthCm,
                        },
                      })
                    }
                    min={0}
                    step={0.1}
                    decimalScale={3}
                  />
                </SimpleGrid>
                <Text size="xs" c="dimmed">
                  換算: 図面 1m → 印刷 {mmPerMeter > 0 ? (mmPerMeter / 10).toFixed(2) : '—'} cm（
                  {mmPerMeter.toFixed(2)} mm）
                </Text>
              </Stack>
            </Card>

            {/* 区画ごとの枚数 */}
            <Card withBorder>
              <Stack gap="xs">
                <Title order={5} m={0}>
                  各区画の印刷枚数
                </Title>
                {zoneList.zones.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    リストに区画がありません。
                  </Text>
                ) : (
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                    {zoneList.zones.map((z) => (
                      <Group key={z.id} gap="xs" wrap="nowrap">
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            background: z.color,
                            border: '1px solid #999',
                            borderRadius: 2,
                            flexShrink: 0,
                          }}
                        />
                        <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
                          {z.name}
                          <Text component="span" size="xs" c="dimmed" ml={4}>
                            ({z.width}×{z.height}m)
                          </Text>
                        </Text>
                        <NumberInput
                          value={settings.counts[z.id] ?? 0}
                          onChange={(v) =>
                            updateSettings({
                              counts: {
                                ...settings.counts,
                                [z.id]: typeof v === 'number' && v >= 0 ? Math.floor(v) : 0,
                              },
                            })
                          }
                          min={0}
                          step={1}
                          w={90}
                        />
                      </Group>
                    ))}
                  </SimpleGrid>
                )}
                <Text size="xs" c="dimmed">
                  合計: {totalItems} 個
                </Text>
              </Stack>
            </Card>

            {/* 出力設定 */}
            <Card withBorder>
              <Stack gap="xs">
                <Title order={5} m={0}>
                  出力設定
                </Title>
                <Group grow>
                  <Select
                    label="配置方式"
                    value={settings.algorithm}
                    onChange={(v) =>
                      v && updateSettings({ algorithm: v as LayoutAlgorithm })
                    }
                    data={[
                      { value: 'tile', label: '単純に敷き詰め' },
                      { value: 'group', label: '同種でグルーピング' },
                      { value: 'one-per-page', label: '1 種類につき 1 ページ' },
                    ]}
                    allowDeselect={false}
                  />
                  <Switch
                    label="区画名・寸法を表示"
                    checked={settings.showZoneName}
                    onChange={(e) =>
                      updateSettings({ showZoneName: e.currentTarget.checked })
                    }
                    mt={24}
                  />
                </Group>
              </Stack>
            </Card>

            {/* バリデーション結果 + アクション */}
            <Paper withBorder p="md">
              <Stack>
                {(statusMessage || errorMessage) &&
                  (errorMessage ? (
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
                  ))}

                {!validation.ok && (
                  <Alert
                    icon={<IconAlertTriangle size={16} />}
                    color="red"
                    title="印刷可能領域に収まらない区画があります"
                  >
                    <List size="sm" spacing={4}>
                      {validation.errors.map((e) => (
                        <List.Item key={e.zoneId}>
                          <strong>{e.zoneName}</strong>: 印刷サイズ{' '}
                          {e.zoneSizeMm.width.toFixed(1)} × {e.zoneSizeMm.height.toFixed(1)} mm が
                          印刷可能領域 {e.usableMm.width.toFixed(1)} × {e.usableMm.height.toFixed(1)} mm
                          を超えます。
                        </List.Item>
                      ))}
                    </List>
                  </Alert>
                )}

                {validation.ok && totalItems === 0 && (
                  <Alert color="yellow" variant="light">
                    印刷する区画の枚数が 0 です。いずれかの区画に 1 以上の枚数を設定してください。
                  </Alert>
                )}

                {validation.ok && mmPerMeter <= 0 && (
                  <Alert color="yellow" variant="light">
                    縮尺が無効です。図面上の長さと印刷上の長さに正の値を入力してください。
                  </Alert>
                )}

                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    {canGenerate && (
                      <>
                        <IconCheck size={16} color="green" />
                        <Text size="sm">
                          <Badge variant="light">{pages.length} ページ</Badge> {totalItems} 個の区画を出力できます
                        </Text>
                      </>
                    )}
                  </Group>
                  <Button
                    leftSection={<IconDownload size={16} />}
                    disabled={!canGenerate}
                    onClick={handleGenerate}
                  >
                    印刷用 HTML をダウンロード
                  </Button>
                </Group>
              </Stack>
            </Paper>
          </Stack>
        </Container>
      </ScrollArea>

      {/* デフォルトに戻す確認 */}
      <Modal
        opened={resetConfirm}
        onClose={() => setResetConfirm(false)}
        title="区画リストをデフォルトに戻す"
        centered
      >
        <Stack>
          <Text size="sm">
            区画リストをデフォルトに戻します。共有区画リスト（他ツールと共有される設定）と、
            設定済みの枚数指定もクリアされます。よろしいですか？
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
    </div>
  );
};

export default PrintPage;
