import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// package.json の version をビルド時に注入する（メニュー画面のバージョン表示用）
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

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
    plugins: [react()],
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
