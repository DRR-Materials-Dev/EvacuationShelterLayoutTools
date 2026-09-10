/**
 * Electron エントリポイント（ディスパッチャ）。設計書 §9.20。
 *
 * 単体動作版とコラボ版はメインプロセスが別ファイルだが、package.json の `main` は
 * 常にこのファイルを指す。electron-builder の `extraMetadata` で `main` を差し替える方式は、
 * プロジェクト直下の package.json を一時的に書き換えるため、連続ビルド時に
 * 設定が失われる事故が起きた（2026-09-10）。そのため **package.json を変更しない**
 * この方式に改めた。
 *
 * 判定：
 *   1. コマンドライン引数 `--app-mode=collab|standalone`（開発時に明示指定する）
 *   2. 無指定なら同梱物で判定：`dist-collab` があればコラボ版、なければ単体動作版
 *      （各インストーラは自分の配信ディレクトリしか同梱しないため一意に決まる）
 */
import { app } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';

const argMode = process.argv
  .find((a) => a.startsWith('--app-mode='))
  ?.split('=')[1];

const mode =
  argMode ?? (existsSync(path.join(app.getAppPath(), 'dist-collab')) ? 'collab' : 'standalone');

await import(mode === 'collab' ? './main-collab.mjs' : './main-standalone.mjs');
