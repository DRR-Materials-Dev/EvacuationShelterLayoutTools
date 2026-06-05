/**
 * アプリアイコン生成。build/icon.svg（source）を sharp で build/icon.png（1024px）に変換する。
 * electron-builder は build/icon.png から Windows 用 .ico を自動生成する。設計書 §9.15。
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, '..', 'build');

// 避難所レイアウト＝「建物＋区画グリッド」を表す簡易アイコン。
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1e88e5"/>
      <stop offset="1" stop-color="#1565c0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1024" height="1024" rx="200" fill="url(#bg)"/>
  <!-- 屋根 -->
  <path d="M512 196 L824 432 L200 432 Z" fill="#ffffff"/>
  <!-- 建物本体 -->
  <rect x="252" y="432" width="520" height="392" fill="#ffffff"/>
  <!-- 区画グリッド -->
  <g fill="#1565c0">
    <rect x="300" y="486" width="180" height="140" rx="10"/>
    <rect x="544" y="486" width="180" height="140" rx="10"/>
    <rect x="300" y="666" width="180" height="110" rx="10"/>
    <rect x="544" y="666" width="180" height="110" rx="10"/>
  </g>
</svg>`;

await mkdir(buildDir, { recursive: true });
await writeFile(path.join(buildDir, 'icon.svg'), svg, 'utf-8');
await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(path.join(buildDir, 'icon.png'));
console.log('build/icon.png を生成しました');
