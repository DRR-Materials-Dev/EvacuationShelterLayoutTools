/**
 * タッチ端末（iPad 等）でのパレット → キャンバスの区画配置（v2.7.0）。
 *
 * iPadOS の Safari では HTML5 のドラッグ＆ドロップで区画を配置できないため、
 * パレット側がポインタイベントで指の移動を追跡し、離した位置のキャンバス要素へ
 * カスタムイベントを送る。キャンバス側はそれを受けて配置する。
 */
export const PALETTE_DROP_EVENT = 'evac-palette-drop';
/** キャンバスのコンテナに付ける data 属性（指を離した位置の要素から探す）。 */
export const CANVAS_DROP_ATTR = 'data-layout-canvas';

export type PaletteDropDetail = { typeId: string; clientX: number; clientY: number };
