# V3 本機驗證結果

2026-10-21，Windows 主機。完整輸出與修正過程在 `local-validation.txt`；差異基礎
為 V2 `2022837a14620a59b136ec9665e12fcb977ae67c`。未以自動測試冒充原生 GUI 驗收。

| 檢查 | 實際命令 | 結果 |
|---|---|---|
| TypeScript | `pnpm --filter @zoro/desktop type-check` | PASS |
| Node／React | `node --test apps/desktop/tests/*.test.mjs` | PASS，26/26；原有 17 + V3 9 |
| React 元件 | 同上 v3.test.mjs | PASS，SSR + 掛載 React/JSDOM；PDF Range 幾何由測試模擬 |
| Rust | `cargo test --all` | PASS，60 passed、0 failed、5 ignored（既有網路測試） |
| Rustfmt | `cargo fmt --all -- --check` | PASS；本輪未修改 Rust |
| 修改前端檔案 Biome | 與 workflow 的 14 檔 `pnpm --filter @zoro/desktop exec biome check ...` 相同 | PASS；含 JSON、語系與 uiStore，無關格式修復已還原 |
| 前端 build | Node 22 執行 `pnpm --filter @zoro/desktop build` | PASS；既有 Browserslist 與大型 chunk 提示保留 |
| 全專案 lint | `pnpm lint`、`pnpm --filter @zoro/desktop lint --fix` | FAIL，既有 core／extension／desktop 問題；不關閉檢查 |
| Desktop 基線比較 | `biome lint <V2或目前>/apps/desktop/src --reporter=json --max-diagnostics=10000` | FAIL/FAIL，各 165 個診斷、分類數相同；新增與修改檔案個別檢查為零 |
| 嚴格 Clippy | `cargo clippy --all-targets --all-features -- -D warnings` | FAIL，未修改的 zoro-subscriptions source.rs:10 async_trait double_must_use |
| 格式規格範例 | 測試載入 docs/examples/sentence-bundle.zoro.json 並 roundtrip | PASS |
| UI 硬編碼簡體掃描 | rg 掃描 src TS/TSX 常見簡體詞彙 | 無符合項目；語系 JSON 另有測試 |
| 打包器語法／Git 空白 | `node --check scripts/export-v3-review.mjs`、`node --check scripts/export-offline-review-v2.mjs`、`git diff --check` | PASS |
| Windows Actions NSIS | 遠端 workflow | 本機不先宣稱；成功後 ZIP 另附真實 Windows job 證據 |
| 原生 Windows GUI 與安裝、真實 PDF.js 捲動／滑鼠／選取／重啟 | 未執行 | NOT TESTED |

最初 V3 7/9 通過：新 HAST 包裝節點缺少 properties，已修正；接著測試 harness 每次
render 建立新 pairs 陣列觸發幾何重算迴圈，該次測試程序已終止，失敗紀錄保留。
修正 harness 穩定性，並在正式 hook 對相同幾何結果保留前次狀態，避免重複更新。
之後 V3 9/9、全體 26/26 通過。未刪除或降級失敗案例。

最後一次複驗曾在外部封裝資料夾誤執行 Rustfmt，因找不到 Cargo.toml 失敗；
wrong-cwd 紀錄保留，回到專案根目錄重跑 Rustfmt 退出碼為 0。這不是程式格式錯誤。

完整語言測試驗證 1,151 鍵、插值、複數後綴、台灣詞彙、常見簡體殘留、系統語言、
既有偏好優先與實際 React 重繪。啟動測試驗證初始 false、正常初始化仍連接與手動導覽；
不是實際全新資料庫與視窗操控測試。請依 FEATURE_VERIFICATION.md 手動驗收。
