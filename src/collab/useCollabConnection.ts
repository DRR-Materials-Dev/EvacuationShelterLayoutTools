/**
 * レイアウト文書をマルチ操作のハブへ接続するフック。設計書 §9.4 / §9.16 / §9.17 / §14.4。
 *
 * - 常に呼び出す（フックのルール）。コラボ無効ビルドでは何もしない。
 * - 有効ビルドでは `session.ts`（y-websocket・プレゼンス）を動的 import する
 *   （`import.meta.env.VITE_COLLAB` ガードにより Pages ビルドではこの import 自体が dead-code 除去される）。
 * - 文書そのもの（`LayoutDoc`）は呼び出し側が持ち、ここでは接続・接続状態・プレゼンスだけを扱う。
 * - ホスト（?host=1）は、ハブとの初回同期と端末の保存データ（`seed`）の読み込みの **両方** が
 *   終わってから初期シードする（読み込み前に同期が終わっても空の既定値を配らない）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutDoc, LayoutSnapshot } from '../shared/layoutDoc.ts';
import { COLLAB_ENABLED } from './flag.ts';
import type {
  CollabSession,
  CollabStatus,
  LocalPresence,
  PresenceUser,
  RemotePresence,
} from './session.ts';

export type CollabConnection = {
  /** マルチ操作版のビルドなら true。 */
  active: boolean;
  /** 共有文書を表示・編集できる状態（同期済み。ホストは初期シード済み）。 */
  ready: boolean;
  status: CollabStatus | 'connecting';
  isHost: boolean;
  room: string;
  /** 他ユーザーのプレゼンス（カーソル・選択）。 */
  presence: RemotePresence[];
  /** 自分の表示名・色（未接続時は null）。 */
  localUser: PresenceUser | null;
  /** 自分の表示名・色を変更する。 */
  setLocalUser: (user: PresenceUser) => void;
  /** 自分のプレゼンスを更新する。 */
  updatePresence: (partial: LocalPresence) => void;
};

/**
 * @param layoutDoc 接続するレイアウト文書
 * @param seed ホストが初期シードに使う端末の保存データ。読み込み中は null。
 */
export const useCollabConnection = (
  layoutDoc: LayoutDoc,
  seed: LayoutSnapshot | null,
): CollabConnection => {
  const sessionRef = useRef<CollabSession | null>(null);

  const [presence, setPresence] = useState<RemotePresence[]>([]);
  const [localUser, setLocalUserState] = useState<PresenceUser | null>(null);
  const [synced, setSynced] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<CollabStatus | 'connecting'>('connecting');

  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isHost = params?.get('host') === '1';
  const room = params?.get('room') ?? 'poc1';

  useEffect(() => {
    // Pages ビルドではこのガードにより以下が丸ごと dead-code 除去される（y-websocket 非混入）。
    if (import.meta.env.VITE_COLLAB !== 'true') return;

    let disposed = false;
    const offs: Array<() => void> = [];

    void import('./session.ts').then(({ createSession }) => {
      if (disposed) return;
      const session = createSession(layoutDoc);
      sessionRef.current = session;
      setLocalUserState(session.getLocalUser());
      offs.push(session.onStatus(setStatus));
      offs.push(session.onPresence(setPresence));
      offs.push(session.onSynced(() => setSynced(true)));
    });

    return () => {
      disposed = true;
      for (const off of offs) off();
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, [layoutDoc]);

  // 同期後、ホストは保存データの読み込みを待ってから初期シードする。
  useEffect(() => {
    if (!synced || ready) return;
    if (isHost) {
      if (!seed) return;
      layoutDoc.seedIfEmpty(seed);
    }
    setReady(true);
  }, [synced, ready, isHost, seed, layoutDoc]);

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
    presence,
    localUser,
    setLocalUser,
    updatePresence,
  };
};
