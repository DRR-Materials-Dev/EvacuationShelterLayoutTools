import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { Modal, Button, Group, Text, Stack, TextInput } from '@mantine/core';
import Konva from 'konva';
import AppHeader from '../shared/components/AppHeader.tsx';
import Canvas from '../tools/layout/Canvas.tsx';
import ZonePalette from '../tools/layout/ZonePalette.tsx';
import Toolbar from '../tools/layout/Toolbar.tsx';
import StatusBar from '../tools/layout/StatusBar.tsx';
import ScaleCalibrationModal from '../tools/layout/ScaleCalibrationModal.tsx';
import AddTextModal from '../tools/layout/AddTextModal.tsx';
import EditTextModal from '../tools/layout/EditTextModal.tsx';
import ResidentTypesModal from '../tools/layout/ResidentTypesModal.tsx';
import SelectionPanel from '../tools/layout/SelectionPanel.tsx';
import PolygonPanel from '../tools/layout/PolygonPanel.tsx';
import FloorTabs from '../tools/layout/FloorTabs.tsx';
import ZoneEditorModal from '../tools/layout/ZoneEditorModal.tsx';
import UserSettingsModal from '../shared/components/UserSettingsModal.tsx';
import { useLayoutState } from '../tools/layout/useLayoutState.ts';
import { getZoneResidentTotal, sumResidentsByType } from '../shared/types.ts';
import type { PlacedZone } from '../shared/types.ts';
import { residentsInPolygon } from '../shared/geometry.ts';
import {
  downloadLayout,
  readLayoutFile,
  parseLayout,
  LayoutParseError,
  LAYOUT_EXTENSION,
} from '../shared/layoutIO.ts';

/** public/ に同梱したサンプルレイアウトのファイル名（GitHub Pages で配信される） */
const SAMPLE_LAYOUT_FILENAME = '避難所レイアウトサンプル.layout.json';
import { readZoneListFile, ZoneListParseError } from '../shared/zoneListIO.ts';

const LayoutPage = () => {
  const state = useLayoutState();
  const actions = state; // 同オブジェクト（型上分離されているが実体は同じ）
  const stageRef = useRef<Konva.Stage | null>(null);

  const [scaleModal, setScaleModal] = useState<{ opened: boolean; distancePx: number }>({
    opened: false,
    distancePx: 0,
  });
  const [pendingZoneListFile, setPendingZoneListFile] = useState<File | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [resetZoneListConfirm, setResetZoneListConfirm] = useState(false);
  const [textPlacePosition, setTextPlacePosition] = useState<{ x: number; y: number } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [residentTypesOpen, setResidentTypesOpen] = useState(false);
  const [zoneEditorOpen, setZoneEditorOpen] = useState(false);
  const [saveLayoutModal, setSaveLayoutModal] = useState<{ opened: boolean; name: string }>({
    opened: false,
    name: '',
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  /* ---------- 区画リスト未保存時のナビゲーションガード（設計書 §8.2） ---------- */
  const blocker = useBlocker(state.zoneListDirty);

  useEffect(() => {
    if (!state.zoneListDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.zoneListDirty]);

  /* ---------- 選択中の区画（居住者人数パネル用） ---------- */
  const selectedZone =
    state.selectedId !== null
      ? state.placed.find((p) => p.id === state.selectedId && p.kind === 'zone')
      : undefined;
  const selectedZoneTypeName =
    selectedZone && selectedZone.kind === 'zone'
      ? (state.zoneList.zones.find((z) => z.id === selectedZone.typeId)?.name ?? '(不明な区画)')
      : '';

  /* ---------- 居住者数（階層・マップ全体） ---------- */
  const floorResidentTotal = state.placed.reduce(
    (sum, p) => (p.kind === 'zone' ? sum + getZoneResidentTotal(p) : sum),
    0,
  );
  const mapResidentTotal = state.floors.reduce(
    (sum, f) =>
      sum + f.placed.reduce((s, p) => (p.kind === 'zone' ? s + getZoneResidentTotal(p) : s), 0),
    0,
  );
  // 種類別内訳（ステータスバーのホバー表示用）
  const floorByType = sumResidentsByType(
    state.placed.filter((p): p is PlacedZone => p.kind === 'zone'),
  );
  const mapByType = sumResidentsByType(
    state.floors.flatMap((f) => f.placed.filter((p): p is PlacedZone => p.kind === 'zone')),
  );

  /* ---------- 選択中のゾーン（多角形）とゾーン内カウント ---------- */
  const selectedPolygon =
    state.selectedId !== null
      ? state.placed.find((p) => p.id === state.selectedId && p.kind === 'polygon')
      : undefined;
  const placedZones = state.placed.filter((p): p is PlacedZone => p.kind === 'zone');
  const zoneDims = (zone: PlacedZone) => {
    const t = state.zoneList.zones.find((z) => z.id === zone.typeId);
    return { width: zone.width ?? t?.width ?? 1, height: zone.height ?? t?.height ?? 1 };
  };
  const polygonCount =
    selectedPolygon && selectedPolygon.kind === 'polygon'
      ? residentsInPolygon(selectedPolygon, placedZones, zoneDims)
      : { byType: {}, total: 0 };

  /* ---------- 背景画像の読み込み ---------- */
  const handleLoadBackground = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        const img = new Image();
        img.onload = () => {
          actions.setBackground({ dataUrl, width: img.width, height: img.height });
          setStatusMessage(null);
        };
        img.onerror = () => setStatusMessage('画像の読み込みに失敗しました');
        img.src = dataUrl;
      };
      reader.onerror = () => setStatusMessage('ファイルの読み込みに失敗しました');
      reader.readAsDataURL(file);
    },
    [actions],
  );

  /* ---------- 縮尺キャリブレーション ---------- */
  const handleToggleScaleMode = useCallback(() => {
    // 排他: テキスト・ゾーン作図モードを解除
    if (state.isAddingText) actions.setIsAddingText(false);
    if (state.isAddingPolygon) actions.setIsAddingPolygon(false);
    actions.setScalePoints([]);
    actions.setIsScaleMode(!state.isScaleMode);
  }, [actions, state.isScaleMode, state.isAddingText, state.isAddingPolygon]);

  const handleScaleCalibrated = useCallback((distancePx: number) => {
    setScaleModal({ opened: true, distancePx });
  }, []);

  const handleScaleSubmit = useCallback(
    (distanceMeters: number) => {
      const ratio = scaleModal.distancePx / distanceMeters;
      actions.setScaleRatio(ratio);
      actions.setIsScaleMode(false);
      actions.setScalePoints([]);
      setScaleModal({ opened: false, distancePx: 0 });
      setStatusMessage(`縮尺を設定しました: 1m = ${ratio.toFixed(1)} px`);
    },
    [actions, scaleModal.distancePx],
  );

  const handleScaleCancel = useCallback(() => {
    actions.setScalePoints([]);
    actions.setIsScaleMode(false);
    setScaleModal({ opened: false, distancePx: 0 });
  }, [actions]);

  /* ---------- ズーム ---------- */
  const handleZoomIn = useCallback(() => {
    actions.setViewScale(Math.min(state.viewScale * 1.2, 10));
  }, [actions, state.viewScale]);
  const handleZoomOut = useCallback(() => {
    actions.setViewScale(Math.max(state.viewScale / 1.2, 0.1));
  }, [actions, state.viewScale]);

  /* ---------- テキスト追加 ---------- */
  const handleToggleAddText = useCallback(() => {
    // 排他: 他モードを解除し、テキストモードに切替
    if (state.isScaleMode) {
      actions.setScalePoints([]);
      actions.setIsScaleMode(false);
    }
    if (state.isAddingPolygon) actions.setIsAddingPolygon(false);
    actions.setIsAddingText(!state.isAddingText);
    setStatusMessage(state.isAddingText ? null : '配置先をクリックしてください');
  }, [actions, state.isAddingText, state.isScaleMode, state.isAddingPolygon]);

  /* ---------- ゾーン（多角形）作図 ---------- */
  const handleToggleAddPolygon = useCallback(() => {
    // 排他: 他モードを解除し、ゾーン作図モードに切替
    if (state.isScaleMode) {
      actions.setScalePoints([]);
      actions.setIsScaleMode(false);
    }
    if (state.isAddingText) actions.setIsAddingText(false);
    const next = !state.isAddingPolygon;
    actions.setIsAddingPolygon(next);
    setStatusMessage(
      next ? 'クリックで頂点を追加し、ダブルクリックか始点クリックで確定します（Esc で取消）' : null,
    );
  }, [actions, state.isAddingPolygon, state.isScaleMode, state.isAddingText]);

  const handleToggleShowZones = useCallback(() => {
    actions.setShowZones(!state.showZones);
  }, [actions, state.showZones]);

  const handleTextPlaceRequested = useCallback(
    (xMeters: number, yMeters: number) => {
      setTextPlacePosition({ x: xMeters, y: yMeters });
      actions.setIsAddingText(false);
    },
    [actions],
  );

  const handleTextSubmit = useCallback(
    (text: string, fontSize: number, color: string) => {
      if (!textPlacePosition) return;
      actions.addText(textPlacePosition.x, textPlacePosition.y, text, fontSize, color);
      setTextPlacePosition(null);
      setStatusMessage('テキストを配置しました');
    },
    [actions, textPlacePosition],
  );

  const handleTextCancel = useCallback(() => {
    setTextPlacePosition(null);
    setStatusMessage(null);
  }, []);

  /* ---------- テキスト編集 ---------- */
  const editingText =
    editingTextId !== null
      ? (state.placed.find((p) => p.id === editingTextId && p.kind === 'text') ?? null)
      : null;

  const handleTextEditSubmit = useCallback(
    (text: string, fontSize: number, color: string) => {
      if (!editingTextId) return;
      actions.updatePlaced(editingTextId, { text, fontSize, color });
      setEditingTextId(null);
      setStatusMessage('テキストを更新しました');
    },
    [actions, editingTextId],
  );

  const handleTextEditCancel = useCallback(() => {
    setEditingTextId(null);
  }, []);

  /* ---------- 選択削除 ---------- */
  const handleRemoveSelected = useCallback(() => {
    if (state.selectedId) actions.removePlaced(state.selectedId);
  }, [actions, state.selectedId]);

  /* ---------- 全削除 ---------- */
  const handleClearAllConfirm = useCallback(() => {
    actions.clearAll();
    setClearAllConfirm(false);
    setStatusMessage('現在の階層の配置と背景画像を削除しました');
  }, [actions]);

  /* ---------- 区画リスト読み込み ---------- */
  const handleLoadZoneListFile = useCallback(
    (file: File) => {
      if (state.placed.length > 0) {
        setPendingZoneListFile(file);
      } else {
        void applyZoneListFile(file);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.placed.length],
  );

  const applyZoneListFile = useCallback(
    async (file: File) => {
      try {
        const list = await readZoneListFile(file);
        actions.replaceZoneList(list);
        setStatusMessage(`区画リスト「${list.name}」を読み込みました`);
      } catch (e) {
        const msg = e instanceof ZoneListParseError ? e.message : '区画リストの読み込みに失敗しました';
        setStatusMessage(msg);
      }
    },
    [actions],
  );

  const handleConfirmZoneListLoad = useCallback(() => {
    if (pendingZoneListFile) {
      void applyZoneListFile(pendingZoneListFile);
      setPendingZoneListFile(null);
    }
  }, [pendingZoneListFile, applyZoneListFile]);

  /* ---------- 区画リストをデフォルトに戻す ---------- */
  const handleResetZoneList = useCallback(() => {
    actions.resetZoneListToDefault();
    setResetZoneListConfirm(false);
    setStatusMessage('区画リストをデフォルトに戻しました（配置済みの区画もクリアしました）');
  }, [actions]);

  /* ---------- レイアウト保存（ファイル名入力） ---------- */
  const handleOpenSaveLayout = useCallback(() => {
    setSaveLayoutModal({ opened: true, name: '避難所レイアウト' });
  }, []);

  const handleConfirmSaveLayout = useCallback(() => {
    const layout = actions.buildLayoutFile();
    const base = saveLayoutModal.name.trim() || '避難所レイアウト';
    const filename = base.endsWith(LAYOUT_EXTENSION) ? base : `${base}${LAYOUT_EXTENSION}`;
    downloadLayout(layout, filename);
    setSaveLayoutModal({ opened: false, name: '' });
    setStatusMessage(`レイアウトファイル「${filename}」をダウンロードしました`);
  }, [actions, saveLayoutModal.name]);

  /* ---------- レイアウト読み込み ---------- */
  const handleLoadLayoutFile = useCallback(
    async (file: File) => {
      try {
        const layout = await readLayoutFile(file);
        actions.loadLayout(layout);
        setStatusMessage('レイアウトを読み込みました');
      } catch (e) {
        const msg = e instanceof LayoutParseError ? e.message : 'レイアウトの読み込みに失敗しました';
        setStatusMessage(msg);
      }
    },
    [actions],
  );

  /* ---------- サンプルレイアウト読み込み（ファイル選択不要） ---------- */
  const handleLoadSample = useCallback(async () => {
    try {
      const url = `${import.meta.env.BASE_URL}${encodeURIComponent(SAMPLE_LAYOUT_FILENAME)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const layout = parseLayout(text);
      actions.loadLayout(layout);
      setStatusMessage('サンプルレイアウトを読み込みました');
    } catch (e) {
      const msg = e instanceof LayoutParseError ? e.message : 'サンプルの読み込みに失敗しました';
      setStatusMessage(msg);
    }
  }, [actions]);

  /* ---------- PNG ダウンロード ---------- */
  const handleDownloadPng = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const uri = stage.toDataURL({ pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = uri;
    a.download = 'evacuation-layout.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setStatusMessage('PNG をダウンロードしました');
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader title="避難所レイアウト" />
      <Toolbar
        isScaleMode={state.isScaleMode}
        isAddingText={state.isAddingText}
        isAddingPolygon={state.isAddingPolygon}
        showZones={state.showZones}
        hasSelection={state.selectedId !== null}
        onLoadBackgroundImage={handleLoadBackground}
        onToggleScaleMode={handleToggleScaleMode}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onAddText={handleToggleAddText}
        onAddPolygon={handleToggleAddPolygon}
        onToggleShowZones={handleToggleShowZones}
        onOpenResidentTypes={() => setResidentTypesOpen(true)}
        onRemoveSelected={handleRemoveSelected}
        onClearAll={() => setClearAllConfirm(true)}
        onSaveLayout={handleOpenSaveLayout}
        onLoadLayoutFile={(f) => void handleLoadLayoutFile(f)}
        onLoadSample={() => void handleLoadSample()}
        onOpenSettings={() => setSettingsOpen(true)}
        onDownloadPng={handleDownloadPng}
      />
      <FloorTabs
        floors={state.floors}
        activeFloorId={state.activeFloorId}
        onSelect={actions.setActiveFloor}
        onAdd={actions.addFloor}
        onRename={actions.renameFloor}
        onRemove={actions.removeFloor}
        onMove={actions.moveFloor}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ZonePalette
          zoneList={state.zoneList}
          onEditZones={() => setZoneEditorOpen(true)}
          onLoadZoneListFile={handleLoadZoneListFile}
          onResetZoneList={() => setResetZoneListConfirm(true)}
        />
        <Canvas
          state={state}
          actions={actions}
          onScaleCalibrated={handleScaleCalibrated}
          onTextPlaceRequested={handleTextPlaceRequested}
          onTextEditRequested={setEditingTextId}
          stageRef={stageRef}
        />
        {selectedZone && selectedZone.kind === 'zone' && (
          <SelectionPanel
            key={selectedZone.id}
            zone={selectedZone}
            zoneTypeName={selectedZoneTypeName}
            residentTypes={state.residentTypes}
            onChange={(residents) => actions.setZoneResidents(selectedZone.id, residents)}
            onClose={() => actions.setSelectedId(null)}
          />
        )}
        {selectedPolygon && selectedPolygon.kind === 'polygon' && (
          <PolygonPanel
            key={selectedPolygon.id}
            polygon={selectedPolygon}
            residentTypes={state.residentTypes}
            byType={polygonCount.byType}
            total={polygonCount.total}
            onChange={(attrs) => actions.updatePlaced(selectedPolygon.id, attrs)}
            onClose={() => actions.setSelectedId(null)}
          />
        )}
      </div>
      <StatusBar
        scaleRatio={state.scaleRatio}
        viewScale={state.viewScale}
        placedCount={state.placed.length}
        floorResidentTotal={floorResidentTotal}
        mapResidentTotal={mapResidentTotal}
        residentTypes={state.residentTypes}
        floorByType={floorByType}
        mapByType={mapByType}
        message={statusMessage}
      />

      {/* 縮尺入力モーダル（毎回フレッシュな状態で開くため key を切り替える） */}
      <ScaleCalibrationModal
        key={scaleModal.opened ? `open-${scaleModal.distancePx}` : 'closed'}
        opened={scaleModal.opened}
        distancePx={scaleModal.distancePx}
        onCancel={handleScaleCancel}
        onSubmit={handleScaleSubmit}
      />

      {/* テキスト入力モーダル (新規追加) */}
      <AddTextModal
        key={textPlacePosition ? `text-${textPlacePosition.x}-${textPlacePosition.y}` : 'text-closed'}
        opened={textPlacePosition !== null}
        position={textPlacePosition}
        onCancel={handleTextCancel}
        onSubmit={handleTextSubmit}
      />

      {/* ユーザー設定モーダル（開くたびに最新値で再マウント） */}
      {settingsOpen && (
        <UserSettingsModal opened onClose={() => setSettingsOpen(false)} />
      )}

      {/* 居住者種類の設定モーダル（開くたびに最新値で再マウント） */}
      {residentTypesOpen && (
        <ResidentTypesModal
          opened
          residentTypes={state.residentTypes}
          onClose={() => setResidentTypesOpen(false)}
          onSave={actions.setResidentTypes}
        />
      )}

      {/* 区画追加・編集モーダル（開くたびに現在の区画リストで再マウント） */}
      {zoneEditorOpen && (
        <ZoneEditorModal
          opened
          initialList={state.zoneList}
          onClose={() => setZoneEditorOpen(false)}
          onApply={(list) => {
            actions.applyZoneListEdits(list);
            setStatusMessage('区画リストの編集を適用しました（共有リストには未保存）');
          }}
          onSaveShared={(list) => {
            actions.saveSharedZoneList(list);
            setStatusMessage(`区画リスト「${list.name}」を共有リストに保存しました`);
          }}
        />
      )}

      {/* レイアウト保存: ファイル名入力 */}
      <Modal
        opened={saveLayoutModal.opened}
        onClose={() => setSaveLayoutModal({ opened: false, name: '' })}
        title="レイアウトを保存"
        centered
      >
        <Stack>
          <TextInput
            label="ファイル名"
            value={saveLayoutModal.name}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setSaveLayoutModal((prev) => ({ ...prev, name: value }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmSaveLayout();
            }}
            rightSection={
              <Text size="xs" c="dimmed" pr={8} style={{ whiteSpace: 'nowrap' }}>
                {LAYOUT_EXTENSION}
              </Text>
            }
            rightSectionWidth={96}
            data-autofocus
          />
          <Text size="xs" c="dimmed">
            拡張子 {LAYOUT_EXTENSION} は自動で付与されます。
          </Text>
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => setSaveLayoutModal({ opened: false, name: '' })}
            >
              キャンセル
            </Button>
            <Button onClick={handleConfirmSaveLayout}>保存</Button>
          </Group>
        </Stack>
      </Modal>

      {/* 区画リスト未保存のナビゲーション警告 */}
      <Modal
        opened={blocker.state === 'blocked'}
        onClose={() => blocker.state === 'blocked' && blocker.reset()}
        title="区画リストが未保存です"
        centered
      >
        <Stack>
          <Text size="sm">
            区画リストに、共有リストへ保存していない変更があります。このまま移動すると共有リストへの保存は行われません。
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
              variant="light"
              onClick={() => {
                if (blocker.state === 'blocked') blocker.proceed();
              }}
            >
              保存せずに移動
            </Button>
            <Button
              onClick={() => {
                actions.markZoneListSaved();
                if (blocker.state === 'blocked') blocker.proceed();
              }}
            >
              保存して移動
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* テキスト編集モーダル (既存テキストのダブルクリック) */}
      {editingText && editingText.kind === 'text' && (
        <EditTextModal
          key={`edit-${editingText.id}`}
          opened
          initialText={editingText.text}
          initialFontSize={editingText.fontSize}
          initialColor={editingText.color}
          onCancel={handleTextEditCancel}
          onSubmit={handleTextEditSubmit}
        />
      )}

      {/* 区画リスト読み込み警告 */}
      <Modal
        opened={pendingZoneListFile !== null}
        onClose={() => setPendingZoneListFile(null)}
        title="区画リストの読み込み"
        centered
      >
        <Stack>
          <Text size="sm">
            配置されている区画が全て削除されますがよろしいですか？
          </Text>
          <Text size="xs" c="dimmed">
            読み込もうとしているファイル: {pendingZoneListFile?.name}
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setPendingZoneListFile(null)}>
              キャンセル
            </Button>
            <Button color="red" onClick={handleConfirmZoneListLoad}>
              削除して読み込む
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* 全削除確認 */}
      <Modal
        opened={clearAllConfirm}
        onClose={() => setClearAllConfirm(false)}
        title="全削除の確認"
        centered
      >
        <Stack>
          <Text size="sm">
            現在の階層に配置されている区画・テキスト・ゾーンと、この階層の背景画像をすべて削除します。よろしいですか？
            （他の階層は影響を受けません）
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setClearAllConfirm(false)}>
              キャンセル
            </Button>
            <Button color="red" onClick={handleClearAllConfirm}>
              全て削除
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* 区画リスト初期化確認 */}
      <Modal
        opened={resetZoneListConfirm}
        onClose={() => setResetZoneListConfirm(false)}
        title="区画リストの初期化"
        centered
      >
        <Stack>
          <Text size="sm">
            区画リストをデフォルトに戻します。配置されている区画も全て削除され、共有区画リスト
            （他ツールと共有される設定）もクリアされます。よろしいですか？
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setResetZoneListConfirm(false)}>
              キャンセル
            </Button>
            <Button color="red" onClick={handleResetZoneList}>
              デフォルトに戻す
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
};

export default LayoutPage;
