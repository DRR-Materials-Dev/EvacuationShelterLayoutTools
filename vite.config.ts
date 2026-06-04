import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// package.json の version をビルド時に注入する（メニュー画面のバージョン表示用）
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/EvacuationShelterLayoutTools/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
