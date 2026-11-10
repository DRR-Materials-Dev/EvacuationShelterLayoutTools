/**
 * レイアウト文書（`LayoutDoc`）を React へ橋渡しするフック。設計書 §14.4。
 *
 * 画面ごとに文書を 1 つ作り、変更のたびにスナップショットと元に戻すの状態を更新する。
 * スタンドアロン版・Pages 版・マルチ操作版で共通。マルチ操作版の接続は `useCollabConnection` が行う。
 */
import { useEffect, useState } from 'react';
import {
  createLayoutDoc,
  type HistoryState,
  type LayoutDoc,
  type LayoutSnapshot,
} from '../../shared/layoutDoc.ts';

export type LayoutDocument = {
  doc: LayoutDoc;
  snapshot: LayoutSnapshot;
  history: HistoryState;
};

export const useLayoutDocument = (): LayoutDocument => {
  // StrictMode で初期化関数が 2 回呼ばれても、使われるのは片方だけ（もう片方は参照されず GC される）。
  const [doc] = useState<LayoutDoc>(() => createLayoutDoc());
  const [snapshot, setSnapshot] = useState<LayoutSnapshot>(() => doc.getSnapshot());
  const [history, setHistory] = useState<HistoryState>(() => doc.getHistoryState());

  // 文書の変更は購読開始後に起きる（復元・接続はどちらも非同期）ため、ここで読み直す必要はない。
  useEffect(() => {
    const offChange = doc.onChange(setSnapshot);
    const offHistory = doc.onHistoryChange(setHistory);
    return () => {
      offChange();
      offHistory();
    };
  }, [doc]);

  return { doc, snapshot, history };
};
