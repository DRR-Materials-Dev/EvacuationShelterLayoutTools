# 避難所レイアウト検討ツール

避難所の運営訓練や検討に使用するための、Web ベースのレイアウト検討ツール集です。
2026-05 のオーバーホールで、メニュー画面から呼び出せる **3 つの独立ツール** 構成になりました。

[避難所レイアウト検討ツール（GitHub Pages）](https://drr-materials-dev.github.io/EvacuationShelterLayoutTools/)

仕様と設計の詳細は [避難所レイアウト検討ツール仕様書.md](避難所レイアウト検討ツール仕様書.md) / [設計書.md](設計書.md) を参照してください。

## 構成

メニュー画面から以下の 3 つのツールへ遷移できます。

### 1. 避難所レイアウト

施設の図面画像の上に区画を配置するメインツール。

* **施設図面の読み込み**: 背景として施設（体育館や教室など）の PNG 画像を読み込めます。
* **縮尺設定**: 図面上の 2 点をクリックし、実距離 (m / cm) を入力することで、正しい縮尺で区画を配置できます。
* **区画の配置**: 共有区画リスト（区画エディタで編集）の区画をドラッグ＆ドロップで配置。移動・回転・（許可された区画のみ）リサイズ可能。
* **テキストブロック**: ボタン → 配置先クリック → モーダル入力（文字列・サイズ・文字色）の 2 段階フロー。配置後はダブルクリックで編集。
* **スナップ**: ユーザー設定（既定 10cm）で配置・移動・リサイズに吸着。
* **データ保存**:
  * `*.layout.json`: 背景画像・縮尺・区画リスト・配置済みアイテムをすべて含む単一ファイル
  * PNG: 現在の表示状態を画像として保存
* **永続化**: 配置状態・縮尺・背景画像はブラウザ内に自動保存され、次回起動時に復元されます。

### 2. 区画エディタ

区画と区画リスト (`*.list.json`) を編集・保存するツール。

* 区画ごとに以下を編集可能:
  * 名称、サイズ（m、スナップ適用）、塗り潰し色、リサイズ可否
  * 区画名表示の有無
  * 枠線の有無 / 色 / 太さ（白基調の区画の輪郭を補助）
  * 画像（推奨: 最大 512×512 px・200 KB 以下）と表示モード（区画にフィット / 縦横比維持 / 縮尺指定）
  * 画像回転（1° 刻み、-180〜180°）
* 区画リストの新規作成・読み込み・保存・デフォルトに戻す。
* 保存すると `.list.json` ファイルがダウンロードされ、同時に共有区画リスト（IndexedDB）も更新されます。
* デフォルト区画も編集可能（保存しないと次回起動時に失われる旨を画面に明示）。
* 未保存の状態で画面離脱しようとすると確認モーダルで警告。

### 3. 区画印刷

区画リストから印刷用 HTML を生成するツール。

* 区画リストソース: 共有リスト / `*.list.json` ファイル読込 / デフォルト
* 用紙: A3 / A4 / B5 / カスタム（cm）+ 縦/横 + 上下左右マージン (mm)
* 縮尺入力: 図面上の長さ（m / cm 切替）と印刷上の長さ（cm）
* 各区画ごとの印刷枚数指定
* 配置方式: 単純敷き詰め / 同種グルーピング / 1 種類 1 ページ
* バリデーション: 印刷可能領域より大きい区画があるとエラー一覧を表示し、生成を中断
* 出力: 単一の `.html` ファイル（CSS と画像 base64 をインライン、SVG ベース）。ブラウザで開いて `Ctrl+P` で印刷。
* 各ページ上部に「区画リスト名」と「縮尺」のヘッダ、下端にページ番号フッタを自動付与。
* 区画内の文字は印刷縮尺に合わせて自動拡大縮小（SVG viewBox による「通常サイズで描画して縮尺で配置」方式）。
* 用紙設定と縮尺は自動的に永続化されます。

## 技術スタック

* **Language**: TypeScript
* **Frontend Framework**: React + Vite
* **Routing**: React Router (`react-router-dom`, `createHashRouter`)
* **UI Components**: Mantine v9
* **Icons**: Tabler Icons
* **Canvas Library**: Konva.js (react-konva)
* **Storage**:
  * LocalStorage（軽量ステート・ユーザー設定・レイアウト状態・印刷の用紙/縮尺設定）
  * IndexedDB（背景画像・共有区画リスト - `idb-keyval` 使用）

### 主要な外部ライブラリ一覧

| ライブラリ | ライセンス | 用途 |
| --- | --- | --- |
| react / react-dom | MIT | UI フレームワーク |
| react-router-dom | MIT | クライアントサイドルーティング |
| @mantine/core / @mantine/hooks | MIT | UI コンポーネント |
| @tabler/icons-react | MIT | アイコン |
| konva / react-konva | MIT | キャンバス描画 |
| use-image | MIT | konva 用画像ローダー |
| idb-keyval | Apache-2.0 | IndexedDB ラッパー |
| vite | MIT | ビルドツール |
| typescript | Apache-2.0 | 型システム |
| @vitejs/plugin-react | MIT | Vite 用 React プラグイン |
| eslint / typescript-eslint | MIT | リンタ |

## 開発・実行方法

### 必要要件

* Node.js (v18 以上推奨)

### セットアップ

```bash
npm install
```

### 開発サーバーの起動

```bash
npm run dev
```

または Windows ではプロジェクトルートの `start-dev.bat` をダブルクリックすると、依存解決と起動を自動で行います。

ブラウザは自動で <http://localhost:5173/EvacuationShelterLayoutTools/> を開きます（ポート使用中なら 5174 以降）。

### 型チェック・lint・ビルド

```bash
npm run typecheck   # tsc -b --noEmit
npm run lint        # eslint .
npm run build       # tsc -b && vite build → dist/ に生成
```

## 作者

スマートインプリメント 芝直之 (`naoyuki.shiba@smart-group.co.jp`)

リポジトリのコミットは [GEMINI.md](GEMINI.md) のルールに従い、Grandge (`s.sys01@gmail.com`) として行います。

## 著作権

Copyright (c) 2026 Smart Implement Naoyuki Shiba

## ライセンス

[MIT License](LICENSE)
