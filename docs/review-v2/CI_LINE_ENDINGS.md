# Windows CI 換行修正證據

功能提交 `9389e076fec1658b9bf7abc180092bd0507e4223` 不變，以追加提交修正 checkout 規則。
失敗執行紀錄：https://github.com/linuan1026/zoro/actions/runs/39493192842 。
該次 TypeScript、三組 Node 測試與 Rustfmt 通過；Biome 七個 `format` 診斷後中止，
NSIS 未執行、review job skipped，不能將該次記為成功。

## 根因確認

- 儲存庫沒有 `.gitattributes`、`.editorconfig`、Biome json/jsonc 設定；使用 Biome 預設 LF。
- 七份失敗 TS/TSX 的 Git index/blob 全部為 LF；本機系統 Git 設定為 `core.autocrlf=true`。
- CI formatter diff 顯示每行末端 `␍`，沒有功能診斷；根因為 Windows checkout 轉換。
- 以獨立暫存 index（`GIT_INDEX_FILE`、`git read-tree HEAD`）和獨立目錄的
  `git -c core.autocrlf=true checkout-index --prefix=... -- <七檔及 PNG>` 重現：
  七檔全變 CRLF，Biome check 恰有七個 format 診斷；設 false 則通過且與 blob 完全一致。

## 最小修正與複驗

根 `.gitattributes` 只有 `*.ts text eol=lf`、`*.tsx text eol=lf` 兩條規則。
不停用 Biome、不降低測試標準、不新增 continue-on-error、不格式化或修改 React/Rust。
不改全域 Git 設定、不 renormalize 全專案；二進位檔與其他檔案類型保持原本行為。

加入規則後，用同一方式分別模擬 `autocrlf=true` 和 `false`：
兩者七檔皆 0 個 CRLF、bytes 與原始 Git blob 完全相等，Biome check 退出碼均為 0，
沒有診斷。PNG bytes 與 blob 相等，沒有套用 text/eol 屬性。
前後完整計數與診斷在 `ci-checkout-results.json`。

七檔：
- `apps/desktop/src/components/reader/BilingualTextViewer.tsx`
- `apps/desktop/src/components/reader/TranslationMarkdown.tsx`
- `apps/desktop/src/lib/commands.ts`
- `apps/desktop/src/lib/offlineTranslation.ts`
- `apps/desktop/src/lib/translationContent.ts`
- `apps/desktop/src/lib/translationScroll.ts`
- `apps/desktop/src/locales/offline.ts`

這些 checkout 複驗均在 Windows 實際執行；false 模擬無自動轉換的 checkout，
不是另一次 Linux OS 實機測試。遠端 Windows NSIS 與 review artifact 結果以
ZIP 的 `tests/windows-job.json`、`tests/windows-job-full.log`、Actions 連結為準。
