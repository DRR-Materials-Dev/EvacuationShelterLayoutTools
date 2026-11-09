import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// package.json の version をビルド時に注入する（メニュー画面のバージョン表示用）
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

/**
 * pdf.js の付属ファイル（v2.7.0）を `pdfjs/` 以下で配信・同梱する。
 *  - wasm          : CCITT(ファックス)・JBIG2・JPEG2000 画像のデコーダ（スキャン PDF に必須）
 *  - cmaps         : フォント非埋め込みの日本語テキスト用 CMap
 *  - standard_fonts: 標準 14 フォント
 *  - iccs          : カラープロファイル
 * dev はミドルウェアで node_modules から返し、build は出力へコピーする。
 */
const PDFJS_ROOT = path.resolve('node_modules/pdfjs-dist');
const PDFJS_DIRS = ['wasm', 'cmaps', 'standard_fonts', 'iccs'];
const PDFJS_SKIP = /^quickjs-eval\./; // PDF 内 JavaScript 実行用（使わない）

const pdfjsAssets = (): Plugin => ({
  name: 'pdfjs-assets',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = decodeURIComponent((req.url ?? '').split('?')[0]);
      const m = /\/pdfjs\/([a-z_]+)\/([^/]+)$/.exec(url);
      if (!m || !PDFJS_DIRS.includes(m[1]) || PDFJS_SKIP.test(m[2])) return next();
      const file = path.join(PDFJS_ROOT, m[1], m[2]);
      if (!existsSync(file)) return next();
      if (file.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
      else if (file.endsWith('.js')) res.setHeader('Content-Type', 'text/javascript');
      createReadStream(file).pipe(res);
    });
  },
  generateBundle() {
    for (const dir of PDFJS_DIRS) {
      const src = path.join(PDFJS_ROOT, dir);
      for (const name of readdirSync(src)) {
        const file = path.join(src, name);
        if (PDFJS_SKIP.test(name) || !statSync(file).isFile()) continue;
        this.emitFile({ type: 'asset', fileName: `pdfjs/${dir}/${name}`, source: readFileSync(file) });
      }
    }
  },
});

// https://vite.dev/config/
// ビルドは 3 系統に分岐する（設計書 §9.9 / §9.15 / §9.20）。
//   - 既定             : GitHub Pages 版。base はリポジトリ名、出力は dist。
//   - mode 'collab*'   : マルチ操作の配信ビルド。Electron の埋め込みサーバが配信、出力は dist-collab。
//   - mode 'standalone': 単体動作版 Electron。ローカル配信のみ、出力は dist-standalone。
// Electron 配信の 2 系統はどちらもルート直下で配信するため base を相対にし、
// 出力先を分けて GitHub Pages 版（dist）と混ざらないようにする。
export default defineConfig(({ mode }) => {
  const isCollab = mode.startsWith('collab');
  const isStandalone = mode === 'standalone';
  const isElectron = isCollab || isStandalone;
  return {
    plugins: [react(), pdfjsAssets()],
    base: isElectron ? './' : '/EvacuationShelterLayoutTools/',
    build: isCollab
      ? { outDir: 'dist-collab' }
      : isStandalone
        ? { outDir: 'dist-standalone' }
        : {},
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  };
});
