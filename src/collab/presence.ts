/**
 * プレゼンスの値型とカラーパレット。設計書 §9.18 / §9.19。
 *
 * yjs に依存しない純データのみを置く。色選択 UI（PresenceSettingsModal）から参照しても
 * Pages ビルドに yjs を混入させないため、session.ts とは別モジュールに切り出している。
 */

/** 自分・他ユーザーの表示名と色。 */
export type PresenceUser = { color: string; name: string };

/** プレゼンスの既定カラーパレット。色選択 UI のスウォッチにも使う。 */
export const PRESENCE_COLORS = [
  '#e53935',
  '#8e24aa',
  '#3949ab',
  '#00897b',
  '#fb8c00',
  '#6d4c41',
  '#c0ca33',
  '#00acc1',
];
