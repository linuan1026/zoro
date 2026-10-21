# V3.1 本機實際驗證

差異基礎 `9b73ae531e3aecce9ff682b449676705d6faba3c`；本機 Windows PowerShell。
完整輸出含最初失敗見 `local-validation.txt`。Node 22 與 CI 相同；預設 Node 24 也有執行。

| 檢查 | 指令 | 結果 |
|---|---|---|
| TypeScript | `pnpm --filter @zoro/desktop type-check` | PASS |
| Node／React 回歸 | `node --test apps/desktop/tests/*.test.mjs`（Node 22） | PASS，35/35；既有 26 + V3.1 9 |
| React 掛載 | 同上 v3.test.mjs、v31.test.mjs | PASS，真實 hook／renderer，JSDOM 模擬 Range 幾何 |
| Rust | `cargo test --all` | PASS，60 passed，0 failed，5 ignored（既有網路測試） |
| Rustfmt | `cargo fmt --all -- --check` | PASS；本輪未改 Rust |
| 修改檔案格式 | workflow 同樣 18 檔的 `pnpm --filter @zoro/desktop exec biome check ...` | PASS |
| 前端 build | Node 22 執行 `pnpm --filter @zoro/desktop build` | PASS；保留 Browserslist／大型 chunk 警告 |
| 桌面全案 lint／自動修正 | `pnpm --filter @zoro/desktop lint`／`lint --fix` | FAIL，既有問題；無關自動修正已還原 |
| 根目錄 workspace lint | `pnpm lint` | FAIL，既有 core／extension 問題，見完整輸出 |
| 桌面基線比較 | `biome lint <V3或目前>/apps/desktop/src --reporter=json --max-diagnostics=10000` | FAIL/FAIL，皆 165 個 lint 診斷、分類計數相同；見 lint-comparison.json |
| 嚴格 Clippy | `cargo clippy --all-targets --all-features -- -D warnings` | FAIL，未修改 source.rs:10 async_trait 的 double_must_use |
| 既有繁中／Welcome 不變 | `git diff --exit-code --` zh-TW.json、uiStore.ts、uiPreferences.ts、App.tsx、onboarding | PASS，這些檔案未改，原 V3 測試也通過 |
| 匯出器語法 | `node --check scripts/export-v31-review.mjs`、`node --check scripts/export-offline-review-v2.mjs` | PASS |
| LF 跨平台 checkout | 暫存 index、autocrlf=true／false 各 checkout 18 檔 | PASS，均 LF、與 Git blob 相同、Biome 通過；見完整輸出 checkout.txt |
| Windows NSIS／安裝版 | Actions 實際工作日誌 | 本機不預先宣稱；成功後封裝會包含匹配 HEAD 的完整 job 證據 |
| 私人 SERD 測試資料 | 未取得 | NOT TESTED |
| Windows GUI／WebView2／原生匯出與安裝 | 未執行 | NOT TESTED |

## 失敗紀錄與處理

- 最初新測試 7/8：歧義幾何 fixture 沒真正滿足兩個候選的條件，實際回報 not-found。
  調整合成矩形讓兩個候選都符合既定鄰接條件後，正確回報 order-unresolved，未放寬斷言。
- 增補 partial-conflict 測試初次失敗：fixture 的 React renderer 只收到原 pairs，診斷卻收到
  額外重疊 pair；修正 fixture 讓兩者輸入一致，再確認部分衝突狀態。
- 格式修正後舊 V3 語言測試初次失敗：正規表示式假設 zh-TW 資源單行，新增獨立診斷
  namespace 後 Biome 改為多行。只修正該測試接受空白換行，仍明確檢查 ...zhTW。
- 所有失敗輸出保留；沒有停用 Biome、跳過檢查或 continue-on-error。

根目錄 lint 失敗檔案、Clippy 失敗的 Rust 檔案本輪均沒有差異；不是以既有問題掩蓋新增錯誤。
新檔及所有既有 reader 檔案的 18 檔 Biome 為零錯誤。
覆蓋率測試只針對目前渲染的文字字元與區域，不代表整篇翻譯品質。
