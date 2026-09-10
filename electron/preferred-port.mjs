/**
 * 保存データを引き継ぐための「固定ポート優先」ヘルパー。設計書 §9.22。
 *
 * SPA は `http://<host>:<port>` で配信されるため、**ポートが変わるとブラウザのオリジンが変わり、
 * IndexedDB / LocalStorage に保存した背景画像・区画リスト・レイアウトが読めなくなる**。
 * 起動ごとに空きポートを自動割当（port: 0）していると、毎回まっさらな状態で立ち上がってしまう。
 *
 * そこで既定ポートを優先して使い、使用中（EADDRINUSE）のときだけ次の候補へずらす。
 * すべて塞がっていた場合のみ自動割当へフォールバックする（この場合だけ保存データは引き継がれない）。
 */

/** 単体動作版（127.0.0.1 のみ）。 */
export const STANDALONE_PORTS = [34580, 34581, 34582, 34583, 34584];

/** コラボ版（LAN 公開）。単体動作版と衝突しない帯を使う。 */
export const COLLAB_PORTS = [34590, 34591, 34592, 34593, 34594];

/**
 * 候補ポートを順に試し、最初に listen できたサーバを返す。
 * @template T
 * @param {number[]} candidates 優先順のポート候補。
 * @param {(port: number) => Promise<T>} start 指定ポートで起動する関数。
 * @returns {Promise<T>}
 */
export const listenOnPreferredPort = async (candidates, start) => {
  for (const port of candidates) {
    try {
      return await start(port);
    } catch (err) {
      if (err?.code !== 'EADDRINUSE') throw err;
      console.warn(`[port] ${port} は使用中のため次の候補を試します`);
    }
  }
  console.warn('[port] 候補がすべて使用中のため自動割当にします（保存データは引き継がれません）');
  return start(0);
};
