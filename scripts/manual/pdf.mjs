/**
 * ユーザーマニュアルの PDF 版を作る（v2.8.0）。
 * public/manual/index.html を Edge で A4 印刷し、public/manual/manual.pdf に保存する。
 * 印刷用のレイアウト（表紙・改ページ・目次）は index.html の @media print で指定している。
 *
 * 使い方: npm run manual:pdf
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = path.join(ROOT, 'public/manual/index.html');
const out = path.join(ROOT, 'public/manual/manual.pdf');

const browser = await launch({ port: 9411, width: 1200, height: 1600 });
try {
  const page = await browser.newPage(pathToFileURL(html).href, { viewport: { width: 1200, height: 1600 } });
  // 画像がすべて読み込まれるまで待つ
  await page.waitFor(`document.readyState === 'complete' && [...document.images].every((i) => i.complete && i.naturalWidth > 0)`, 30000);
  const broken = await page.evaluate(`[...document.images].filter((i) => !(i.naturalWidth > 0)).map((i) => i.getAttribute('src'))`);
  if (broken.length) console.warn('読み込めない画像:', broken.join(', '));
  await sleep(500);
  const footer = `<div style="width:100%;font-size:8px;color:#777;padding:0 13mm;display:flex;justify-content:space-between;font-family:'Yu Gothic UI','Meiryo',sans-serif"><span>避難所レイアウトツール 使い方マニュアル Ver. 2.8.0</span><span>Copyright © 2026 Smart Implement Naoyuki Shiba</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
  const r = await page.send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: footer,
    generateTaggedPDF: true,
    generateDocumentOutline: true,
  });
  const buf = Buffer.from(r.data, 'base64');
  writeFileSync(out, buf);
  console.log(`PDF を保存しました: ${path.relative(ROOT, out)}（${(buf.length / 1024 / 1024).toFixed(1)} MB）`);
  page.close();
} finally {
  browser.close();
}
