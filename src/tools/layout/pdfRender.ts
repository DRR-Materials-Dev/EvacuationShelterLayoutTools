/**
 * PDF 図面の読み込み・描画（v2.7.0）。
 *
 * pdf.js（pdfjs-dist）は大きいので、PDF を選んだときだけ動的 import する。
 * ワーカーは Vite の `?url` で同梱し、GitHub Pages 版・Electron 版（相対 base）とも同じ経路で読み込む。
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

export type PdfDoc = PDFDocumentProxy;

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

const loadPdfjs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
};

/** PDF ファイルを開く。 */
export const openPdf = async (file: File): Promise<PdfDoc> => {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  // 付属ファイルは vite.config.ts の pdfjsAssets が `pdfjs/` 以下に配置する。
  // ワーカーからも取得するため、相対 base（Electron 版の './'）でも絶対 URL に解決して渡す。
  const assetUrl = (dir: string) =>
    new URL(`${import.meta.env.BASE_URL}pdfjs/${dir}/`, document.baseURI).href;
  return pdfjs.getDocument({
    data,
    wasmUrl: assetUrl('wasm'),
    cMapUrl: assetUrl('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('standard_fonts'),
    iccUrl: assetUrl('iccs'),
  }).promise;
};

/** ファイルが PDF かどうか（MIME または拡張子で判定）。 */
export const isPdfFile = (file: File): boolean =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/**
 * 指定ページを、長辺が longSidePx になる解像度で白背景のキャンバスへ描画する。
 * pageNumber は 1 始まり。
 */
export const renderPdfPage = async (
  doc: PdfDoc,
  pageNumber: number,
  longSidePx: number,
): Promise<HTMLCanvasElement> => {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = longSidePx / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D context を取得できません');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise;
  page.cleanup();
  return canvas;
};

/** 角度 deg（度）で回転した w×h 画像の外接矩形サイズ。 */
export const rotatedSize = (w: number, h: number, deg: number): { width: number; height: number } => {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { width: w * c + h * s, height: w * s + h * c };
};

/** 正規化（0〜1）したトリミング矩形。回転後の画像座標に対する割合。 */
export type CropRect = { x: number; y: number; w: number; h: number };

/**
 * src を deg 回転（外接矩形に白で余白を埋める）し、crop で切り抜いた画像を返す。
 * crop が null のときは回転後の全体。
 */
export const composeOutput = (
  src: HTMLCanvasElement,
  deg: number,
  crop: CropRect | null,
): HTMLCanvasElement => {
  const rs = rotatedSize(src.width, src.height, deg);
  const rw = Math.round(rs.width);
  const rh = Math.round(rs.height);
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const cx = Math.round(c.x * rw);
  const cy = Math.round(c.y * rh);
  const cw = Math.max(1, Math.round(c.w * rw));
  const ch = Math.max(1, Math.round(c.h * rh));
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('canvas 2D context を取得できません');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  // 回転後画像の (cx, cy) が出力の原点に来るように描画
  ctx.translate(rw / 2 - cx, rh / 2 - cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
};
