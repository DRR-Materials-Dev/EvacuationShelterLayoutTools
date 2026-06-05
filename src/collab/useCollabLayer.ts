/**
 * コラボセッションを React に橋渡しするフック。設計書 §9.4 / §9.16 / §9.17。
 *
 * - 常に呼び出す（フックのルール）。コラボ無効ビルドでは即 return し、yjs を読み込まない。
 * - 有効ビルドでは `session.ts` を動的 import（`import.meta.env.VITE_COLLAB` ガードにより
 *   Pages ビルドではこの import 自体が dead-code 除去される）。
 * - 同期対象＝レイアウト文書（全階層 floors ＋区画リスト＋居住者種類）。正本は Yjs。
 *   ホスト（?host=1）のみ初期シードする。アクティブ階層・選択等の UI は各ユーザーローカル。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_POLYGON_STYLE, INITIAL_SCALE_RATIO } from '../shared/constants.ts';
import type {
  Floor,
  LayoutFile,
  PlacedItem,
  PlacedZone,
  PolygonZone,
  ResidentType,
  TextBlock,
  ZoneList,
} from '../shared/types.ts';
import type { StoredBackground } from '../shared/storage.ts';
import type { Point } from '../tools/layout/types.ts';
import { COLLAB_ENABLED } from './flag.ts';
import type {
  CollabSession,
  CollabSnapshot,
  CollabStatus,
  LocalPresence,
  PresenceUser,
  RemotePresence,
} from './session.ts';

const genId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const EMPTY_SNAPSHOT: CollabSnapshot = {
  floors: [],
  zoneList: null,
  zoneListName: null,
  residentTypes: null,
};

/** LayoutFile を共有スナップショット（全階層）へ変換。 */
const layoutToSnapshot = (layout: LayoutFile): CollabSnapshot => ({
  floors: layout.floors,
  zoneList: layout.zoneList,
  zoneListName: layout.zoneListName,
  residentTypes: layout.residentTypes,
});

export type CollabLayer = {
  active: boolean;
  ready: boolean;
  status: CollabStatus | 'connecting';
  isHost: boolean;
  room: string;
  snapshot: CollabSnapshot;
  /** 他ユーザーのプレゼンス（カーソル・選択）。 */
  presence: RemotePresence[];
  /** 自分の表示名・色（未接続時は null）。 */
  localUser: PresenceUser | null;
  /** 自分の表示名・色を変更する。 */
  setLocalUser: (user: PresenceUser) => void;
  /** 自分のプレゼンスを更新する。 */
  updatePresence: (partial: LocalPresence) => void;
  /* placed 操作（floorId 指定） */
  updatePlaced: (floorId: string, id: string, attrs: Partial<PlacedItem>) => void;
  setZoneResidents: (floorId: string, id: string, residents: Record<string, number>) => void;
  addPlacedZone: (floorId: string, typeId: string, xMeters: number, yMeters: number) => string;
  addText: (
    floorId: string,
    xMeters: number,
    yMeters: number,
    text: string,
    fontSize: number,
    color: string,
  ) => string;
  addPolygon: (floorId: string, points: Point[]) => string | null;
  removePlaced: (floorId: string, id: string) => void;
  /* 階層レベル操作 */
  setBackground: (floorId: string, bg: StoredBackground | null) => void;
  setScaleRatio: (floorId: string, r: number) => void;
  renameFloor: (floorId: string, name: string) => void;
  addFloor: () => string;
  removeFloor: (floorId: string) => void;
  moveFloor: (floorId: string, dir: -1 | 1) => void;
  clearFloor: (floorId: string) => void;
  /* 文書レベル操作 */
  setResidentTypes: (types: ResidentType[]) => void;
  setZoneList: (zoneList: ZoneList, zoneListName: string) => void;
  replaceZoneListClearPlaced: (zoneList: ZoneList, zoneListName: string) => void;
  loadLayout: (layout: LayoutFile) => void;
};

export const useCollabLayer = (seed: CollabSnapshot): CollabLayer => {
  const sessionRef = useRef<CollabSession | null>(null);
  const seedRef = useRef<CollabSnapshot>(seed);
  seedRef.current = seed;

  const [snapshot, setSnapshot] = useState<CollabSnapshot>(EMPTY_SNAPSHOT);
  const [presence, setPresence] = useState<RemotePresence[]>([]);
  const [localUser, setLocalUserState] = useState<PresenceUser | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<CollabStatus | 'connecting'>('connecting');

  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isHost = params?.get('host') === '1';
  const room = params?.get('room') ?? 'poc1';

  useEffect(() => {
    // Pages ビルドではこのガードにより以下が丸ごと dead-code 除去される（yjs 非混入）。
    if (import.meta.env.VITE_COLLAB !== 'true') return;

    let disposed = false;
    const offs: Array<() => void> = [];

    void import('./session.ts').then(({ createSession }) => {
      if (disposed) return;
      const session = createSession();
      sessionRef.current = session;
      setLocalUserState(session.getLocalUser());
      offs.push(session.onChange(setSnapshot));
      offs.push(session.onStatus(setStatus));
      offs.push(session.onPresence(setPresence));
      offs.push(
        session.onSynced(() => {
          if (isHost) session.seedIfEmpty(seedRef.current);
          setSnapshot(session.getSnapshot());
          setReady(true);
        }),
      );
    });

    return () => {
      disposed = true;
      for (const off of offs) off();
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePlaced = useCallback(
    (floorId: string, id: string, attrs: Partial<PlacedItem>) => {
      sessionRef.current?.updatePlaced(floorId, id, attrs);
    },
    [],
  );

  const setZoneResidents = useCallback(
    (floorId: string, id: string, residents: Record<string, number>) => {
      const cleaned: Record<string, number> = {};
      for (const [typeId, n] of Object.entries(residents)) {
        if (n > 0) cleaned[typeId] = n;
      }
      sessionRef.current?.updatePlaced(floorId, id, {
        residents: Object.keys(cleaned).length > 0 ? cleaned : undefined,
      } as Partial<PlacedItem>);
    },
    [],
  );

  const addPlacedZone = useCallback(
    (floorId: string, typeId: string, xMeters: number, yMeters: number): string => {
      const zone: PlacedZone = {
        kind: 'zone',
        id: genId('zone'),
        typeId,
        x: xMeters,
        y: yMeters,
        rotation: 0,
      };
      sessionRef.current?.addItem(floorId, zone);
      return zone.id;
    },
    [],
  );

  const addText = useCallback(
    (
      floorId: string,
      xMeters: number,
      yMeters: number,
      text: string,
      fontSize: number,
      color: string,
    ): string => {
      const block: TextBlock = {
        kind: 'text',
        id: genId('text'),
        text,
        x: xMeters,
        y: yMeters,
        fontSize,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        color,
      };
      sessionRef.current?.addItem(floorId, block);
      return block.id;
    },
    [],
  );

  const addPolygon = useCallback((floorId: string, points: Point[]): string | null => {
    if (points.length < 3) return null;
    const polygon: PolygonZone = {
      kind: 'polygon',
      id: genId('polygon'),
      points: points.map((p) => ({ x: p.x, y: p.y })),
      ...DEFAULT_POLYGON_STYLE,
    };
    sessionRef.current?.addItem(floorId, polygon);
    return polygon.id;
  }, []);

  const removePlaced = useCallback((floorId: string, id: string) => {
    sessionRef.current?.removeItem(floorId, id);
  }, []);

  const setBackground = useCallback((floorId: string, bg: StoredBackground | null) => {
    sessionRef.current?.setBackground(floorId, bg);
  }, []);

  const setScaleRatio = useCallback((floorId: string, r: number) => {
    sessionRef.current?.setScaleRatio(floorId, r);
  }, []);

  const renameFloor = useCallback((floorId: string, name: string) => {
    sessionRef.current?.renameFloor(floorId, name);
  }, []);

  const addFloor = useCallback((): string => {
    const count = sessionRef.current?.getSnapshot().floors.length ?? 0;
    const floor: Floor = {
      id: genId('floor'),
      name: `${count + 1}F`,
      scaleRatio: INITIAL_SCALE_RATIO,
      placed: [],
    };
    sessionRef.current?.addFloor(floor);
    return floor.id;
  }, []);

  const removeFloor = useCallback((floorId: string) => {
    sessionRef.current?.removeFloor(floorId);
  }, []);

  const moveFloor = useCallback((floorId: string, dir: -1 | 1) => {
    sessionRef.current?.moveFloor(floorId, dir);
  }, []);

  const clearFloor = useCallback((floorId: string) => {
    sessionRef.current?.clearFloor(floorId);
  }, []);

  const setResidentTypes = useCallback((types: ResidentType[]) => {
    sessionRef.current?.setResidentTypes(types);
  }, []);

  const setZoneList = useCallback((zoneList: ZoneList, zoneListName: string) => {
    sessionRef.current?.setZoneList(zoneList, zoneListName);
  }, []);

  const replaceZoneListClearPlaced = useCallback((zoneList: ZoneList, zoneListName: string) => {
    sessionRef.current?.replaceZoneListClearPlaced(zoneList, zoneListName);
  }, []);

  const loadLayout = useCallback((layout: LayoutFile) => {
    sessionRef.current?.replaceDocument(layoutToSnapshot(layout));
  }, []);

  const updatePresence = useCallback((partial: LocalPresence) => {
    sessionRef.current?.updatePresence(partial);
  }, []);

  const setLocalUser = useCallback((user: PresenceUser) => {
    sessionRef.current?.setLocalUser(user);
    // session 側で正規化（trim 等）された値を反映する
    const applied = sessionRef.current?.getLocalUser();
    if (applied) setLocalUserState(applied);
  }, []);

  return {
    active: COLLAB_ENABLED,
    ready,
    status,
    isHost,
    room,
    snapshot,
    presence,
    localUser,
    setLocalUser,
    updatePresence,
    updatePlaced,
    setZoneResidents,
    addPlacedZone,
    addText,
    addPolygon,
    removePlaced,
    setBackground,
    setScaleRatio,
    renameFloor,
    addFloor,
    removeFloor,
    moveFloor,
    clearFloor,
    setResidentTypes,
    setZoneList,
    replaceZoneListClearPlaced,
    loadLayout,
  };
};
