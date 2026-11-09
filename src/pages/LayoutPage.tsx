import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useBlocker } from 'react-router-dom';
import { Modal, Button, Group, Text, Stack, TextInput } from '@mantine/core';
import Konva from 'konva';
import AppHeader from '../shared/components/AppHeader.tsx';
import Canvas from '../tools/layout/Canvas.tsx';
import ZonePalette from '../tools/layout/ZonePalette.tsx';
import Toolbar, { type SampleLayout } from '../tools/layout/Toolbar.tsx';
import StatusBar from '../tools/layout/StatusBar.tsx';
import ScaleCalibrationModal from '../tools/layout/ScaleCalibrationModal.tsx';
import AddTextModal from '../tools/layout/AddTextModal.tsx';
import EditTextModal from '../tools/layout/EditTextModal.tsx';
import ResidentTypesModal from '../tools/layout/ResidentTypesModal.tsx';
import SelectionPanel from '../tools/layout/SelectionPanel.tsx';
import PolygonPanel from '../tools/layout/PolygonPanel.tsx';
import MultiZonePanel from '../tools/layout/MultiZonePanel.tsx';
import EditActionsBar from '../tools/layout/EditActionsBar.tsx';
import {
  copySelection,
  hasClipboard,
  pasteSelection,
  subscribeClipboard,
} from '../tools/layout/clipboard.ts';
import { useUserSettings } from '../shared/settings.tsx';
import FloorTabs from '../tools/layout/FloorTabs.tsx';
import ZoneEditorModal from '../tools/layout/ZoneEditorModal.tsx';
import PdfImportModal from '../tools/layout/PdfImportModal.tsx';
import { isPdfFile } from '../tools/layout/pdfRender.ts';
import UserSettingsModal from '../shared/components/UserSettingsModal.tsx';
import PresenceSettingsModal from '../collab/PresenceSettingsModal.tsx';
import { useLayoutState } from '../tools/layout/useLayoutState.ts';
import { useCollabLayer } from '../collab/useCollabLayer.ts';
import type { CollabSnapshot } from '../collab/session.ts';
import { getElectronAPI } from '../collab/electron.ts';

// 参加者招待モーダル（qrcode を含む）。Pages バンドルに混ぜないよう VITE_COLLAB ガード下で遅延読み込み。
const SessionInfoModal =
  import.meta.env.VITE_COLLAB === 'true'
    ? lazy(() => import('../collab/SessionInfoModal.tsx'))
    : null;
import { getZoneResidentTotal, isPlacedZoneNameShown, sumResidentsByType } from '../shared/types.ts';
import type { LayoutFile, PlacedItem, PlacedZone, ZoneList } from '../shared/types.ts';
import type { Point } from '../tools/layout/types.ts';
import type { StoredBackground } from '../shared/storage.ts';
import { DEFAULT_ZONE_LIST } from '../shared/constants.ts';
import ZoneListPresetPicker from '../shared/components/ZoneListPresetPicker.tsx';
import {
  DEFAULT_PRESET_ID,
  loadZoneListPreset,
  type ZoneListPresetId,
} from '../shared/zoneListPresets.ts';
import { isZoneFullyInPolygon, residentsInPolygon } from '../shared/geometry.ts';
import {
  downloadLayout,
  readLayoutFile,
  parseLayout,
  LayoutParseError,
  LAYOUT_EXTENSION,
} from '../shared/layoutIO.ts';

/** public/ に同梱したサンプルレイアウトのファイル名（GitHub Pages で配信される） */
const SAMPLE_LAYOUTS: SampleLayout[] = [
  { label: '架空の体育館', filename: '架空の体育館.layout.json' },
  { label: '架空の公民館', filename: '架空の公民館.layout.json' },
];
import { readZoneListFile, ZoneListParseError } from '../shared/zoneListIO.ts';

/** ゾーン選択時にステータスバーへ出すヒント。 */
const ZONE_SELECT_HINT =
  'ゾーン選択中： Alt を押しながらドラッグ（タブレットは「ゾーンだけ移動」ボタン）でゾーンだけ移動 ／ もう一度クリックでゾーン内選択（中の区画もまとめて選択）';

const LayoutPage = () => {
  const local = useLayoutState();

  /* ---------- マルチ操作：collab 有効ビルドはレイアウト文書（全階層）を Yjs 同期に差し替える ---------- */
  // 設計書 §9.16 / §9.17。同期対象＝全階層 floors（各 placed/背景/縮尺）＋区画リスト＋居住者種類。
  // アクティブ階層・選択等の UI は各ユーザーローカル。collab 無効ビルドは従来経路をそのまま使う。
  const collabSeed: CollabSnapshot = {
    floors: local.floors,
    zoneList: local.zoneList,
    zoneListName: local.zoneListName,
    residentTypes: local.residentTypes,
  };
  const collab = useCollabLayer(collabSeed);
  const useShared = collab.active && collab.ready;
  const canLoad = !collab.active || collab.isHost; // 参加者は図面/レイアウト読込を禁止

  // 共有 floors からアクティブ階層を解決（ローカル activeFloorId が無効なら先頭にフォールバック）。
  const sharedFloors = collab.snapshot.floors;
  const sharedActiveFloor = useShared
    ? (sharedFloors.find((f) => f.id === local.activeFloorId) ?? sharedFloors[0])
    : undefined;
  const effectiveFloorId = sharedActiveFloor?.id ?? local.activeFloorId;

  const state: typeof local = useMemo(() => {
    if (!useShared) return local;
    const s = collab.snapshot;
    return {
      ...local,
      floors: sharedFloors,
      activeFloorId: effectiveFloorId,
      placed: sharedActiveFloor?.placed ?? [],
      background: sharedActiveFloor?.background ?? null,
      scaleRatio: sharedActiveFloor?.scaleRatio ?? local.scaleRatio,
      zoneList: s.zoneList ?? local.zoneList,
      zoneListName: s.zoneListName ?? local.zoneListName,
      residentTypes: s.residentTypes ?? local.residentTypes,
    };
  }, [useShared, collab.snapshot, sharedFloors, sharedActiveFloor, effectiveFloorId, local]);

  const actions: typeof local = useMemo(() => {
    if (!useShared) return local;
    const fid = effectiveFloorId;
    return {
      ...local,
      /* placed（アクティブ階層） */
      updatePlaced: (id: string, attrs: Partial<PlacedItem>) => collab.updatePlaced(fid, id, attrs),
      setZoneResidents: (id: string, residents: Record<string, number>) =>
        collab.setZoneResidents(fid, id, residents),
      removePlaced: (id: string) => collab.removePlaced(fid, id),
      updatePlacedMany: (updates: { id: string; attrs: Partial<PlacedItem> }[]) =>
        collab.updatePlacedMany(fid, updates),
      addItems: (items: PlacedItem[]) => collab.addItems(fid, items),
      removePlacedMany: (ids: string[]) => collab.removePlacedMany(fid, ids),
      addPlacedZone: (typeId: string, x: number, y: number) => {
        local.setSelectedId(collab.addPlacedZone(fid, typeId, x, y));
      },
      addText: (x: number, y: number, text: string, fontSize: number, color: string) => {
        local.setSelectedId(collab.addText(fid, x, y, text, fontSize, color));
      },
      addPolygon: (points: Point[]) => {
        const id = collab.addPolygon(fid, points);
        if (id) local.setSelectedId(id);
      },
      /* 階層レベル */
      setBackground: (bg: StoredBackground | null) => collab.setBackground(fid, bg),
      setScaleRatio: (r: number) => collab.setScaleRatio(fid, r),
      setResidentTypes: collab.setResidentTypes,
      /* 区画リスト編集（全員へ同期。ローカル版も呼んで IndexedDB 等の副作用は維持） */
      applyZoneListEdits: (list: ZoneList) => {
        collab.setZoneList(list, list.name);
        local.applyZoneListEdits(list);
      },
      saveSharedZoneList: (list: ZoneList) => {
        collab.setZoneList(list, list.name);
        local.saveSharedZoneList(list);
      },
      replaceZoneList: (list: ZoneList) => {
        collab.replaceZoneListClearPlaced(list, list.name);
        local.replaceZoneList(list);
      },
      resetZoneListToDefault: (list?: ZoneList, presetId?: ZoneListPresetId) => {
        const l = list ?? DEFAULT_ZONE_LIST;
        collab.replaceZoneListClearPlaced(l, l.name);
        local.resetZoneListToDefault(l, presetId);
      },
      clearAll: () => {
        collab.clearFloor(fid);
        local.setSelectedId(null);
      },
      loadLayout: (layout: LayoutFile) => {
        collab.loadLayout(layout);
        local.setSelectedId(null);
        if (layout.floors[0]) local.setActiveFloor(layout.floors[0].id);
      },
      // 保存は共有スナップショット（全階層＋区画リスト＋居住者種類）から組み立てる。
      buildLayoutFile: (): LayoutFile => ({
        version: 2,
        zoneListName: collab.snapshot.zoneListName ?? local.zoneListName,
        residentTypes: collab.snapshot.residentTypes ?? local.residentTypes,
        zoneList: collab.snapshot.zoneList ?? local.zoneList,
        floors: collab.snapshot.floors,
      }),
      /* 階層タブ操作（全員へ同期） */
      addFloor: () => local.setActiveFloor(collab.addFloor()),
      removeFloor: (id: string) => {
        collab.removeFloor(id);
        if (local.activeFloorId === id) {
          const remaining = sharedFloors.filter((f) => f.id !== id);
          if (remaining[0]) local.setActiveFloor(remaining[0].id);
        }
      },
      renameFloor: (id: string, name: string) => collab.renameFloor(id, name),
      moveFloor: (id: string, dir: -1 | 1) => collab.moveFloor(id, dir),
      setActiveFloor: (id: string) => local.setActiveFloor(id),
    };
  }, [useShared, effectiveFloorId, sharedFloors, collab, local]);
  const stageRef = useRef<Konva.Stage | null>(null);

  /* ---------- 存在しなくなった配置物を選択から外す（削除・他ユーザーの操作・階層切替） ---------- */
  const { selectedIds: curSelectedIds, innerZoneId: curInnerZoneId, setSelection } = local;
  useEffect(() => {
    if (curSelectedIds.length === 0) return;
    const exists = new Set(state.placed.map((p) => p.id));
    if (curSelectedIds.every((id) => exists.has(id))) return;
    const inner = curInnerZoneId && exists.has(curInnerZoneId) ? curInnerZoneId : null;
    setSelection(
      curSelectedIds.filter((id) => exists.has(id)),
      inner,
    );
  }, [state.placed, curSelectedIds, curInnerZoneId, setSelection]);

  /* ---------- マルチ操作：プレゼンス（カーソル・選択） ---------- */
  const { updatePresence } = collab;
  // 自分の表示中の階層・選択を共有
  useEffect(() => {
    if (!useShared) return;
    updatePresence({
      floorId: effectiveFloorId,
      selectedId: local.selectedId ?? local.selectedIds[0] ?? null,
      selectedIds: local.selectedIds,
    });
  }, [useShared, effectiveFloorId, local.selectedId, local.selectedIds, updatePresence]);
  const handleCursorMove = useCallback(
    (meters: Point | null) => updatePresence({ cursor: meters }),
    [updatePresence],
  );
  // 現在の階層にいる他ユーザーのみ表示
  const remotePresence = useShared
    ? collab.presence.filter((p) => p.floorId === effectiveFloorId)
    : undefined;

  const [scaleModal, setScaleModal] = useState<{ opened: boolean; distancePx: number }>({
    opened: false,
    distancePx: 0,
  });
  const [pendingZoneListFile, setPendingZoneListFile] = useState<File | null>(null);
  /** PDF 図面の取り込み中ファイル（v2.7.0）。 */
  const [pdfFile, setPdfFile] = useState<{ file: File; floorId: string } | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  /** ゾーンのドラッグで中の区画を動かさない（Alt キーの代わり）。 */
  const [zoneMoveAlone, setZoneMoveAlone] = useState(false);
  /** 区画のタップを Shift+クリック扱いにする（Shift キーの代わり）。 */
  const [multiSelect, setMultiSelect] = useState(false);
  const { settings: userSettings } = useUserSettings();
  const canPaste = useSyncExternalStore(subscribeClipboard, hasClipboard);
  const [resetZoneListConfirm, setResetZoneListConfirm] = useState(false);
  const [resetPreset, setResetPreset] = useState<ZoneListPresetId>(DEFAULT_PRESET_ID);
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
  /** レイアウト読込のたびに増やし、Canvas に「図面全体が見えるズーム」へ合わせさせる。 */
  const [fitRequest, setFitRequest] = useState(0);

  /*
   * マルチ操作の参加者：最初に図面（背景画像）を受け取ったとき、1 回だけ図面全体が見えるズームに合わせる。
   * 参加直後に図面が無くても、後からホストが図面を読み込んだ時点で 1 回だけ合わせる。
   */
  const participantFittedRef = useRef(false);
  const hasSharedBackground = Boolean(sharedActiveFloor?.background);
  useEffect(() => {
    if (!useShared || collab.isHost || participantFittedRef.current || !hasSharedBackground) return;
    participantFittedRef.current = true;
    setFitRequest((n) => n + 1);
  }, [useShared, collab.isHost, hasSharedBackground]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [presenceSettingsOpen, setPresenceSettingsOpen] = useState(false);
  const isElectronHost = getElectronAPI() !== null;

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
  // 複数選択中の区画（区画名の一括表示切替用）
  const selectedZoneIds = state.selectedIds.filter(
    (id) => state.placed.find((p) => p.id === id)?.kind === 'zone',
  );
  const setZonesShowName = (ids: string[], show: boolean | undefined) =>
    actions.updatePlacedMany(ids.map((id) => ({ id, attrs: { showName: show } })));
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

  /*
   * ゾーンを選択したとき、ステータスバーに操作のヒントを出す（v2.7.0）。
   * 選択が変わった時点で 1 回だけ設定し、その後の操作メッセージ（コピー等）は通常どおり上書きする。
   * ゾーン以外の選択に移ったら、ヒントが残っていれば消す。
   */
  const zoneHintId =
    selectedPolygon && state.innerZoneId === null ? selectedPolygon.id : null;
  const [prevZoneHintId, setPrevZoneHintId] = useState<string | null>(null);
  if (zoneHintId !== prevZoneHintId) {
    setPrevZoneHintId(zoneHintId);
    if (zoneHintId) setStatusMessage(ZONE_SELECT_HINT);
    else if (statusMessage === ZONE_SELECT_HINT) setStatusMessage(null);
  }
  const zoneDims = (zone: PlacedZone) => {
    const t = state.zoneList.zones.find((z) => z.id === zone.typeId);
    return { width: zone.width ?? t?.width ?? 1, height: zone.height ?? t?.height ?? 1 };
  };
  const polygonCount =
    selectedPolygon && selectedPolygon.kind === 'polygon'
      ? residentsInPolygon(selectedPolygon, placedZones, zoneDims)
      : { byType: {}, total: 0 };
  const polygonInnerZoneIds =
    selectedPolygon && selectedPolygon.kind === 'polygon'
      ? placedZones
          .filter((z) => {
            const d = zoneDims(z);
            return isZoneFullyInPolygon(z, d.width, d.height, selectedPolygon.points);
          })
          .map((z) => z.id)
      : [];

  /* ---------- 背景画像の読み込み ---------- */
  const handleLoadBackground = useCallback(
    (file: File) => {
      if (isPdfFile(file)) {
        // PDF はページ選択・回転・トリミングのモーダルを経由して取り込む
        setPdfFile({ file, floorId: state.activeFloorId });
        return;
      }
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
    [actions, state.activeFloorId],
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
    // 作図中は区画・テキストの選択（変形ハンドル）が頂点のクリックを邪魔しないよう選択を外す
    if (next) actions.setSelectedId(null);
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
    actions.removePlacedMany(state.selectedIds);
  }, [actions, state.selectedIds]);

  /* ---------- コピー・貼り付け（タッチ向けボタン。キーボードは Canvas 側） ---------- */
  const handleCopy = useCallback(() => {
    const items = state.selectedIds
      .map((id) => state.placed.find((p) => p.id === id))
      .filter((p): p is PlacedItem => p !== undefined);
    const msg = copySelection(items, state.innerZoneId);
    if (msg) setStatusMessage(msg);
  }, [state.selectedIds, state.placed, state.innerZoneId]);

  const handlePaste = useCallback(() => {
    const typeIds = new Set(state.zoneList.zones.map((z) => z.id));
    const pasted = pasteSelection(userSettings.snap, (id) => typeIds.has(id));
    if (!pasted) return;
    if (pasted.result.items.length > 0) {
      actions.addItems(pasted.result.items);
      actions.setSelection(pasted.result.selectedIds, pasted.result.innerZoneId);
    }
    setStatusMessage(pasted.message);
  }, [state.zoneList.zones, userSettings.snap, actions]);

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
  const handleResetZoneList = useCallback(async () => {
    setResetZoneListConfirm(false);
    try {
      const list = await loadZoneListPreset(resetPreset);
      actions.resetZoneListToDefault(list, resetPreset);
      setStatusMessage(`区画リストを「${list.name}」に戻しました（配置済みの区画もクリアしました）`);
    } catch {
      setStatusMessage('既定の区画リストの読み込みに失敗しました');
    }
  }, [actions, resetPreset]);

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
        setFitRequest((n) => n + 1);
        setStatusMessage('レイアウトを読み込みました');
      } catch (e) {
        const msg = e instanceof LayoutParseError ? e.message : 'レイアウトの読み込みに失敗しました';
        setStatusMessage(msg);
      }
    },
    [actions],
  );

  /* ---------- サンプルレイアウト読み込み（ファイル選択不要） ---------- */
  const handleLoadSample = useCallback(async (sample: SampleLayout) => {
    try {
      const url = `${import.meta.env.BASE_URL}${encodeURIComponent(sample.filename)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const layout = parseLayout(text);
      actions.loadLayout(layout);
      setFitRequest((n) => n + 1);
      setStatusMessage(`サンプル「${sample.label}」を読み込みました`);
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
      {collab.active && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '4px 12px',
            fontSize: 12,
            background: collab.status === 'connected' ? '#e6f4ea' : '#fdecea',
            color: collab.status === 'connected' ? '#1b5e20' : '#b71c1c',
            borderBottom: '1px solid rgba(0,0,0,0.1)',
          }}
        >
          <span style={{ flex: 1 }}>
            マルチ操作 ／ ルーム: {collab.room} ／ 役割: {collab.isHost ? 'ホスト' : '参加者'} ／ 状態:{' '}
            {collab.status === 'connected' ? '接続中' : collab.status === 'connecting' ? '接続待ち' : '切断'}
            {' '}（区画の移動・追加・削除のみ同期。閲覧ロールは紳士協定で保証なし）
          </span>
          {collab.localUser && (
            <Group gap={6} wrap="nowrap" align="center">
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: collab.localUser.color,
                  border: '1px solid rgba(0,0,0,0.25)',
                  flex: '0 0 auto',
                }}
              />
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {collab.localUser.name}
              </span>
              <Button
                size="compact-xs"
                variant="default"
                onClick={() => setPresenceSettingsOpen(true)}
              >
                表示名・色
              </Button>
            </Group>
          )}
          {isElectronHost && (
            <Button size="compact-xs" variant="filled" onClick={() => setInviteOpen(true)}>
              参加者を招待（URL・QR）
            </Button>
          )}
        </div>
      )}
      {SessionInfoModal && inviteOpen && (
        <Suspense fallback={null}>
          <SessionInfoModal onClose={() => setInviteOpen(false)} />
        </Suspense>
      )}
      {collab.localUser && presenceSettingsOpen && (
        <PresenceSettingsModal
          opened
          user={collab.localUser}
          onApply={collab.setLocalUser}
          onClose={() => setPresenceSettingsOpen(false)}
        />
      )}
      <Toolbar
        isScaleMode={state.isScaleMode}
        isAddingText={state.isAddingText}
        isAddingPolygon={state.isAddingPolygon}
        showZones={state.showZones}
        hasSelection={state.selectedIds.length > 0}
        canLoad={canLoad}
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
        samples={SAMPLE_LAYOUTS}
        onLoadSample={(s) => void handleLoadSample(s)}
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
        rightSection={
          <EditActionsBar
            hasSelection={state.selectedIds.length > 0}
            canPaste={canPaste}
            multiSelect={multiSelect}
            zoneMoveAlone={zoneMoveAlone}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onDelete={handleRemoveSelected}
            onDeselect={() => actions.setSelectedId(null)}
            onToggleMultiSelect={() => setMultiSelect((v) => !v)}
            onToggleZoneMoveAlone={() => setZoneMoveAlone((v) => !v)}
          />
        }
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ZonePalette
          zoneList={state.zoneList}
          canLoad={canLoad}
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
          remotePresence={remotePresence}
          onCursorMove={useShared ? handleCursorMove : undefined}
          onStatusMessage={setStatusMessage}
          fitRequest={fitRequest}
          zoneMoveAlone={zoneMoveAlone}
          multiSelect={multiSelect}
        />
        {selectedZone && selectedZone.kind === 'zone' && (
          <SelectionPanel
            key={selectedZone.id}
            zone={selectedZone}
            zoneTypeName={selectedZoneTypeName}
            residentTypes={state.residentTypes}
            nameShown={isPlacedZoneNameShown(
              selectedZone,
              state.zoneList.zones.find((z) => z.id === selectedZone.typeId),
            )}
            onChange={(residents) => actions.setZoneResidents(selectedZone.id, residents)}
            onShowNameChange={(show) => setZonesShowName([selectedZone.id], show)}
            onDelete={() => actions.removePlacedMany([selectedZone.id])}
            onClose={() => actions.setSelectedId(null)}
          />
        )}
        {!selectedZone && !selectedPolygon && selectedZoneIds.length >= 2 && (
          <MultiZonePanel
            count={selectedZoneIds.length}
            onShowNameChange={(show) => setZonesShowName(selectedZoneIds, show)}
            onDelete={() => actions.removePlacedMany(selectedZoneIds)}
            onClose={() => actions.setSelection([])}
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
            innerZoneCount={polygonInnerZoneIds.length}
            onInnerZonesShowName={(show) => setZonesShowName(polygonInnerZoneIds, show)}
            moveAlone={zoneMoveAlone}
            onMoveAloneChange={setZoneMoveAlone}
            innerSelection={state.innerZoneId !== null}
            onDelete={() => actions.removePlacedMany(state.selectedIds)}
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

      {/* PDF 図面の取り込み（ページ選択・回転・トリミング） */}
      {pdfFile && (
        <PdfImportModal
          file={pdfFile.file}
          floorName={state.floors.find((f) => f.id === pdfFile.floorId)?.name ?? ''}
          onCancel={() => setPdfFile(null)}
          onImport={(bg) => {
            // 取り込み中に階層を切り替えていても、開始時の階層に読み込む
            if (pdfFile.floorId === state.activeFloorId) {
              actions.setBackground(bg);
            } else {
              setStatusMessage('取り込み中に階層が切り替わったため、読み込みを中止しました');
              setPdfFile(null);
              return;
            }
            setPdfFile(null);
            setFitRequest((n) => n + 1); // 図面全体が見えるズームに合わせる
            setStatusMessage(`PDF「${pdfFile.file.name}」から図面を読み込みました`);
          }}
        />
      )}

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
            区画リストを選択した既定のリストに戻します。配置されている区画も全て削除され、共有区画リスト
            （他ツールと共有される設定）も置き換わります。よろしいですか？
          </Text>
          <ZoneListPresetPicker value={resetPreset} onChange={setResetPreset} />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setResetZoneListConfirm(false)}>
              キャンセル
            </Button>
            <Button color="red" onClick={() => void handleResetZoneList()}>
              デフォルトに戻す
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
};

export default LayoutPage;
