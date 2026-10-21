# 本機驗證結果（2026-10-21）

Windows 主機實際執行。完整原始輸出含最初失敗見 `local-validation.txt`。
pnpm 命令透過既有 pnpm.cjs 執行；build 使用 Node 22，其他命令為既有 Node 24。

| 檢查 | 指令 | 結果 |
|---|---|---|
| TypeScript | `pnpm --filter @zoro/desktop type-check` | PASS，最終兩次無錯誤；最初 Array.at 相容性錯誤已改用索引 |
| 單元／React SSR 回歸 | `node --test apps/desktop/tests/*.test.mjs` | PASS，17/17（含 8 項可靠性測試、5 項離線測試、4 項 Windows 設定測試） |
| Rust 全工作區 | `cargo test --all` | PASS，60 passed、0 failed、5 ignored（既有網路測試） |
| Rustfmt | `cargo fmt --all` 及 `cargo fmt --all -- --check` | PASS |
| 修改檔案 lint | `pnpm --filter @zoro/desktop exec biome check src/components/reader/BilingualTextViewer.tsx src/components/reader/TranslationMarkdown.tsx src/lib/commands.ts src/lib/offlineTranslation.ts src/lib/translationContent.ts src/lib/translationScroll.ts src/locales/offline.ts` | PASS，7 檔，無修改、無錯誤 |
| 前端正式 build | `pnpm --filter @zoro/desktop build`（Node 22） | PASS，tsc -b + Vite；既有大型 chunk／Browserslist 提示 |
| Rust/Tauri 編譯 | `cargo test --all`／desktop Clippy 編譯所有 targets/features | PASS 編譯；本機 NSIS 打包 NOT RUN，由 Actions 執行 |
| 全專案 lint | `pnpm lint` | FAIL，既有 core／extension／desktop 問題，未改動其他套件 |
| Desktop 自動修復 lint | `pnpm --filter @zoro/desktop lint --fix` | FAIL，既有錯誤；已還原無關格式修復 |
| 同設定純 lint 比較 | `biome lint <d24基線或目前>/apps/desktop/src --reporter=json --max-diagnostics=10000` | FAIL/FAIL，各 165 個診斷；分類數量相同，詳見 lint-comparison.json；本次 7 個檔案 lint 無錯誤 |
| 嚴格 Clippy | `cargo clippy --all-targets --all-features -- -D warnings` | FAIL，既有 source.rs:10 async_trait double_must_use |
| Clippy 診斷 | `cargo clippy -p zoro-desktop --all-targets --all-features -- -D warnings -A clippy::double_must_use` | PASS；僅診斷用，不代表嚴格 Clippy 通過 |
| 封裝程式語法 | `node --check scripts/export-offline-review-v2.mjs` | PASS |
| 空白錯誤 | `git diff --check` | PASS |
| 原生 GUI／安裝後實機／重啟 | 無可用 GUI 自動化，本次未操作 WebView2 | NOT RUN |
| Windows Actions NSIS | 遠端執行結果由 ZIP tests/windows-job.json 與 README 記錄 | 尚未執行時不得宣稱 PASS |

最初前端測試 15/16 通過，失敗為退化末端案例的預期錯誤：來源到底、目標仍有長度時，
允許目標保持底部的近似映射，測試修正預期；沒有為通過測試而關閉安全檢查。
初期 lint 六類本輪診斷已修正，最終 changed-file lint 為零。
Rust 增量快取曾有 Access denied 警告，最終測試退出碼為 0；未隱藏該訊息。

React 測試是實際元件 SSR 渲染與內容替換，未使用瀏覽器掛載／互動測試框架。
捲動測試是可控 EventTarget／rAF 模擬，未替代視覺、觸控板或 WebView2 實機驗收。
