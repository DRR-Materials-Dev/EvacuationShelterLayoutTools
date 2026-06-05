/**
 * コラボ機能の有効化フラグ。
 *
 * 設計書 §9.9：GitHub Pages 版（VITE_COLLAB 無効）ではコラボ系コードを含めない。
 * yjs 等の重い依存は `session.ts` に閉じ込め、`useCollabLayer` 内で
 * `import.meta.env.VITE_COLLAB === 'true'` を直接ガードにした動的 import で読み込む。
 * これにより Pages ビルドでは session.ts チャンク（＝yjs）が emit されない。
 */
export const COLLAB_ENABLED = import.meta.env.VITE_COLLAB === 'true';
