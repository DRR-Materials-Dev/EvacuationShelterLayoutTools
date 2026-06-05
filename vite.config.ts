import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// package.json の version をビルド時に注入する（メニュー画面のバージョン表示用）
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

// https://vite.dev/config/
// mode に 'collab' を含む場合（build:collab / dev:collab）はマルチ操作の配信ビルド。
// Electron の埋め込みサーバ（または LAN 配信）がルート直下で配信するため base を相対に、
// 出力を dist-collab に分離して GitHub Pages 版（dist）と混ざらないようにする。設計書 §9.9 / §9.15。
export default defineConfig(({ mode }) => {
  const isCollab = mode.startsWith('collab');
  return {
    plugins: [react()],
    base: isCollab ? './' : '/EvacuationShelterLayoutTools/',
    build: isCollab ? { outDir: 'dist-collab' } : {},
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  };
});
