/**
 * ユーザーマニュアル（public/manual/）へのリンク。v2.8.0。
 *
 * - HTML 版: `manual/index.html`。全版（Pages・単体動作版・コラボ版）に同梱し、ツールから開く。
 * - PDF 版: 同梱の `manual/manual.pdf` と、GitHub Release の添付（最新版へのリンク）。
 *
 * BASE_URL は Pages 版で `/EvacuationShelterLayoutTools/`、Electron 版で `./`。
 * ハッシュルーター（`#/layout`）なので、相対パスでもページの場所によらず同じ URL に解決される。
 */
export const manualUrl = (section?: string): string =>
  `${import.meta.env.BASE_URL}manual/index.html${section ? `#${section}` : ''}`;
