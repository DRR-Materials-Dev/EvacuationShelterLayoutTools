import type { ZoneType } from '../../shared/types.ts';
import {
  getZoneBorder,
  getZoneDisplayText,
  getZoneNameAlignH,
  getZoneNameAlignV,
  getZoneNameColor,
} from '../../shared/types.ts';
import { getPaperSizeMm, getPrintScaleMmPerMeter } from './paperSizes.ts';
import { PAGE_HEADER_HEIGHT_MM, type Page, type Placement } from './layoutAlgorithms.ts';
import type { PrintSettings, ScaleSetting } from './types.ts';

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatMeters = (m: number): string => {
  if (Math.abs(m - Math.round(m)) < 0.001) return `${Math.round(m)}`;
  return m.toFixed(2).replace(/\.?0+$/, '');
};

const formatScale = (scale: ScaleSetting): string => {
  const lhsUnit = scale.drawingUnit === 'cm' ? 'cm' : 'm';
  return `図面 ${formatMeters(scale.drawingLength)} ${lhsUnit} → 印刷 ${formatMeters(
    scale.printLengthCm,
  )} cm`;
};

/* ============================================================== */
/* 1 区画分の SVG                                                  */
/* ============================================================== */

/** ピクセル → ミリ換算（96 DPI 想定: 1px = 25.4/96 mm ≈ 0.265mm） */
const PX_TO_MM = 25.4 / 96;

/**
 * 区画 1 つを SVG で描画する。viewBox を「1m = 100 単位」固定とし、
 * SVG の width/height を印刷上のミリで指定することで、テキスト・画像が
 * 印刷縮尺に合わせて自動的に拡大縮小される（「通常サイズで描画して縮尺で配置」方式）。
 */
const renderZoneSvg = (p: Placement, settings: PrintSettings, mmPerMeter: number): string => {
  const z = p.item.zone;

  // 印刷上のサイズ (mm)
  const wMm = p.item.widthMm;
  const hMm = p.item.heightMm;
  // viewBox サイズ（1m = 100 単位）。等比なので preserveAspectRatio は無視可
  const vbW = z.width * 100;
  const vbH = z.height * 100;
  // 名称用フォントサイズ: 手動指定 (m) があればそれを 100 倍して viewBox 単位に換算。
  // 未指定なら viewBox 単位の 12% を上限とし、極端に小さい区画でも 4 単位は確保。
  const nameFont =
    z.nameFontSize !== undefined
      ? Math.max(4, z.nameFontSize * 100)
      : Math.max(4, Math.min(vbW, vbH) * 0.12);
  // 表示名の配置位置を SVG 属性へ変換
  const alignH = getZoneNameAlignH(z);
  const alignV = getZoneNameAlignV(z);
  const NAME_PAD = 4; // viewBox 単位の内側余白
  const textX = alignH === 'left' ? NAME_PAD : alignH === 'right' ? vbW - NAME_PAD : vbW / 2;
  const textAnchor = alignH === 'left' ? 'start' : alignH === 'right' ? 'end' : 'middle';
  const textY = alignV === 'top' ? NAME_PAD : alignV === 'bottom' ? vbH - NAME_PAD : vbH / 2;
  const dominantBaseline =
    alignV === 'top' ? 'hanging' : alignV === 'bottom' ? 'text-after-edge' : 'central';

  const showName = settings.showZoneName && z.showName !== false;

  // 枠線設定: ユーザー指定 px を mm 換算し、印刷縮尺に左右されない実寸 mm を保つ
  const border = getZoneBorder(z);
  // viewBox-to-mm 比 = mmPerMeter / 100. 目的 mm 厚 / 比 = viewBox 単位での stroke-width
  const strokeWidthVB = border.show && border.widthPx > 0 && mmPerMeter > 0
    ? (border.widthPx * PX_TO_MM * 100) / mmPerMeter
    : 0;

  const imageSvg = z.image ? renderImageSvg(z.image, vbW, vbH) : '';

  // 枠線は画像の上に重ねるため、画像描画の後ろに配置（fill=none の stroke 専用 rect）
  const borderSvg = strokeWidthVB > 0
    ? `<rect x="0" y="0" width="${vbW}" height="${vbH}" fill="none" stroke="${escapeHtml(border.color)}" stroke-width="${strokeWidthVB}" />`
    : '';

  const textSvg = showName
    ? `<text x="${textX}" y="${textY}" text-anchor="${textAnchor}" dominant-baseline="${dominantBaseline}" font-size="${nameFont}" fill="${escapeHtml(getZoneNameColor(z))}" style="font-weight:600;">${escapeHtml(getZoneDisplayText(z))}</text>`
    : '';

  return `<svg
        class="zone"
        style="position:absolute; left:${p.xMm}mm; top:${p.yMm}mm; overflow:hidden;"
        width="${wMm}mm" height="${hMm}mm"
        viewBox="0 0 ${vbW} ${vbH}"
      >
        <rect x="0" y="0" width="${vbW}" height="${vbH}" fill="${escapeHtml(z.color)}" />
        ${imageSvg}
        ${borderSvg}
        ${textSvg}
      </svg>`;
};

/**
 * 画像を SVG 内に配置する。viewBox 単位（1m = 100）で寸法・位置を返す。
 */
const renderImageSvg = (
  image: NonNullable<ZoneType['image']>,
  vbW: number,
  vbH: number,
): string => {
  let iw: number;
  let ih: number;
  let preserve: string;
  if (image.fitMode === 'fill') {
    iw = vbW;
    ih = vbH;
    preserve = 'none';
  } else if (image.fitMode === 'contain') {
    iw = vbW;
    ih = vbH;
    preserve = 'xMidYMid meet';
  } else {
    // manual
    const sx = image.scaleX ?? 1;
    const sy = image.scaleY ?? 1;
    iw = vbW * sx;
    ih = vbH * sy;
    preserve = 'none';
  }
  // 中央配置
  const ix = (vbW - iw) / 2;
  const iy = (vbH - ih) / 2;
  const cx = vbW / 2;
  const cy = vbH / 2;
  const rotation = image.rotation;
  return `<image href="${escapeHtml(image.dataUrl)}"
      x="${ix}" y="${iy}"
      width="${iw}" height="${ih}"
      preserveAspectRatio="${preserve}"
      transform="rotate(${rotation} ${cx} ${cy})" />`;
};

/* ============================================================== */
/* ページ全体                                                      */
/* ============================================================== */

const renderPageHeader = (listName: string, settings: PrintSettings, paperWidthMm: number): string => {
  const scaleStr = formatScale(settings.scale);
  return `<header class="page-header" style="width:${paperWidthMm - settings.margins.left - settings.margins.right}mm; left:${settings.margins.left}mm;">
        <span class="page-header-name">${escapeHtml(listName)}</span>
        <span class="page-header-scale">${escapeHtml(scaleStr)}</span>
      </header>`;
};

const renderPage = (
  page: Page,
  listName: string,
  settings: PrintSettings,
  paperWidthMm: number,
  totalPages: number,
  mmPerMeter: number,
): string => {
  const header = renderPageHeader(listName, settings, paperWidthMm);
  const zones = page.items
    .map((p) => renderZoneSvg(p, settings, mmPerMeter))
    .join('\n      ');
  const pageNo = `<div class="page-footer">${page.index + 1} / ${totalPages}</div>`;
  return `    <div class="page">
      ${header}
      ${zones}
      ${pageNo}
    </div>`;
};

/**
 * 印刷用 HTML 全文を生成する。
 */
export const generatePrintHtml = (
  listName: string,
  pages: Page[],
  settings: PrintSettings,
): string => {
  const paper = getPaperSizeMm(settings.paper);
  // 補助情報（ヘッダ内に表示される縮尺と用紙情報）
  const mmPerMeter = getPrintScaleMmPerMeter(settings.scale);

  const styles = `
@page {
  size: ${paper.width}mm ${paper.height}mm;
  margin: 0;
}
html, body { margin: 0; padding: 0; background: #ddd; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', Meiryo, sans-serif; }
.page {
  position: relative;
  width: ${paper.width}mm;
  height: ${paper.height}mm;
  background: #fff;
  page-break-after: always;
  break-after: page;
  overflow: hidden;
  margin: 0 auto 8mm auto;
  box-shadow: 0 0 4px rgba(0,0,0,0.2);
}
@media print {
  .page { margin: 0; box-shadow: none; }
  body { background: #fff; }
}
.page:last-child { page-break-after: auto; break-after: auto; }
.page-header {
  position: absolute;
  top: 2mm;
  height: ${PAGE_HEADER_HEIGHT_MM - 2}mm;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 0.3mm solid #999;
  font-size: 9pt;
  padding-bottom: 1mm;
  color: #222;
}
.page-header-name { font-weight: 600; }
.page-header-scale { color: #555; font-size: 8pt; }
.page-footer {
  position: absolute;
  bottom: 2mm;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 7pt;
  color: #888;
}
`;

  const body = pages
    .map((p) => renderPage(p, listName, settings, paper.width, pages.length, mmPerMeter))
    .join('\n');

  const titleSuffix = `（${pages.length} ページ / ${(mmPerMeter / 10).toFixed(2)} cm per meter）`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(listName)} - 印刷${escapeHtml(titleSuffix)}</title>
  <style>${styles}</style>
</head>
<body>
${body}
</body>
</html>
`;
};

export const downloadPrintHtml = (filename: string, html: string): void => {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
