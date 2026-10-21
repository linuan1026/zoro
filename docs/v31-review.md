# Zoro V3.1 跨行逐句定位與診斷：審查交接

- 專案：https://github.com/linuan1026/zoro
- 功能分支：`feat/offline-bilingual-reader`
- 既有 PR：https://github.com/linuan1026/zoro/pull/1
本輪基礎：`9b73ae531e3aecce9ff682b449676705d6faba3c`。
保留 V1、V2、V3 與 Windows 修正歷史，不 force push、不另開 PR。
ZIP 頂端與 `changes/repository-info.md` 會列出實際 HEAD 及本次 Actions 網址。

## 範圍與實際證據

本輪未取得使用者的原始 PDF 或 `SERD_V3_跨行完整句測試.zoro.json`，不能宣稱已重現
該私人論文的 44 組資料，也不能推斷未提供資料的頁面／句子可高亮。測試資料全部為虛構
醫藥短句，React/JSDOM 的 PDF Range 座標為模擬，沒有冒充真實 Windows GUI 驗收。

修正前已確認：`pdfQuoteRanges` 按 DOM 順序串接文字，遇交錯雙欄或不同 span 順序可漏判；
`locateQuote` 對找不到／重複都回傳 null，介面無法分辨；沒有對照覆蓋範圍與完整性提示。
原本中文 React/HAST 標記本來就只涵蓋明確提供的 target，不應藉延伸範圍偽造整句譯文。

## 修正與程式位置

以下前端路徑均相對 `apps/desktop/src/`：

1. `lib/pdfSentenceLocator.ts`：`pageFragments` 只讀既有 PDF.js 文字層與可測量 Range；
   `readingLines` 依水平幾何分行、隔離大欄溝、處理鄰接上下標；`resolvePdfQuote` 追蹤唯一
   垂直鄰接、水平重疊、縮排相近的後續行，不再信任 DOM 迭代順序。將正規化位置精確映回
   每個原始 Text/Range，回傳全部片段及行數；重複、有歧義時不猜。行尾連字號與 Unicode
   仍沿用既有 `normalizedText`。這是幾何規則而非模糊字串匹配，不是通用排版理解或 OCR。
2. `components/reader/useSentenceAlignment.ts`：`pdfQuoteRanges` 轉用新定位器，任一匹配行的
   hit-test 啟用整個 ID；既有所有來源／目標仍由同組管理。pointermove 使用 capture，
   工具列／連結／表單不當成句子，覆蓋層事件可依實體頁面座標回找；非收合文字選取不固定
   句子。維持 rAF、縮放／DOM／尺寸失效、停用分頁及卸載時清理，沒有改寫 PDF 文字節點。
3. `lib/sentenceAlignment.ts`：抽出 `quoteMatches` 提供候選數，保留 `locateQuote` 相容介面；
   `SentenceQuote` 新增可選 completeness，舊 bundle 不用修改。`quoteCompleteness` 明確區分
   作者宣告、疑似片段及句末標點，全部不等同已驗證完整。`rehypeSentenceAlignment` 為安全
   React 節點附加每個 target 的 ID/index，支援逐目標檢查與偵測部分重疊，不擴張原始譯文。
4. `lib/alignmentDiagnostics.ts`：`alignmentCoverage` 分開報告缺頁、缺文字層、無可測量文字、
   空 region、找不到、重複、行序不明、中文分段缺漏及標記衝突。每組包含物理頁碼、ID、
   片段／行／候選數、文字層狀態與完整性提示。每頁列組數、無對照頁面、已載入文字字元
   涵蓋率，以及未完整涵蓋片段的比例座標；不是整篇或語意翻譯涵蓋率。
5. `components/reader/AlignmentDiagnostics.tsx`：可關閉面板、ID 查詢、手動重新檢查及啟用分頁
   每兩秒更新，關閉／停用時清理。沒有 hover ID 時不一律判成缺資料。`diagnosticExport`
   匯出狀態與幾何，不包含正文、譯文、檔名、路徑或節錄；ID 應由作者使用非正文短識別碼。
6. `components/reader/BilingualTextViewer.tsx`：既有工具列增加診斷開關，並總是顯示匯入組數／
   實體頁面及「不是整篇」提示。保持既有逐句、固定、自動跟隨、同步、搜尋、版本 key 邏輯。
7. `lib/commands.ts` 的 `exportAlignmentDiagnostics`：原生 Save 選擇 `.json` 或 `.txt`，
   寫入相同 JSON 內容；取消不寫入。`src-tauri/capabilities/default.json` 僅增加
   `fs:allow-write-text-file`，由 dialog 授予單一選定路徑，不新增廣域檔案 scope。
8. `locales/alignmentDiagnostics.ts` 與 `lib/i18n.ts`：只接入本輪診斷訊息；未改既有 zh-TW.json、
   語言偵測、uiPreferences、uiStore、App 或 Welcome 行為，回歸測試仍驗證 V3 語言／啟動。
9. `.github/workflows/windows-installer.yml` 保留所有原有檢查，增加 V3.1 測試與四個新檔案的
   Biome，使用現有 Windows NSIS 流程；`scripts/export-v31-review.mjs` 重用版本化匯出器，
   產生本輪完整 source、相對 V3 的 diff、測試、規格及 SHA256 manifest。

## 匯入、保存與操作

原有 PDF 工具列的「匯入逐句對照檔」匯入 `zoro.bilingual.v1` JSON，內含完整 Markdown、
source[]、target[]，並可選填各片段 completeness。一般 Markdown／TXT 不要求此資料。
`OfflineTranslationToolbar` → `importBilingualBundle` → `commands.importOfflineTranslation`
→ Rust `import_offline_translation`／`save_document`。資料與對照一起保存在既有
`<使用者資料目錄>/offline-translations/<paper UUID>/<translation UUID>.json`，
預設 Windows `%USERPROFILE%/.zoro`，尊重自訂位置；仍以論文 ID／原始 PDF 檔名關聯。
沒有資料庫遷移或新的 Rust 儲存邏輯；原子寫入、損壞 JSON 隔離及刪除不動 PDF 皆保留。

開啟雙欄版本後，滑鼠移到英文任何已匹配行或中文標記即對照；點擊固定／再次取消，
自動跟隨與頁碼同步仍獨立。勾「逐句診斷／涵蓋範圍」，查看目前頁面所有組，或輸入已知 ID；
頁面未載入請先捲至該頁再重新檢查。匯出報告前確認沒有把正文放進 ID。
若 JSON 只有半句，系統只高亮半句；44 組、第 1～3 頁不等同全篇已完成。
如何生成完整句子／一對多完整譯句，請見 `docs/sentence-alignment.md` 及中文版本。

## 測試與已知限制

新增 `apps/desktop/tests/v31.test.mjs` 共 9 項，含三行／四 span／錯序 DOM、雙欄隔離、
重複句子的上下文與 region、Unicode／上下標、分離失敗狀態、半句不擴張、無 ID／缺頁、
診斷隱私與覆蓋率、中文全句／一對多／表格／公式、掛載 hover／反向／固定／選取／工具列／
延遲文字層、訊息鍵與最小權限。V3 原語言測試只將格式敏感正規表示式改成接受換行，
仍要求 zh-TW 明確使用 ...zhTW，不放寬內容斷言。

實際本機指令、PASS／FAIL 與最初失敗輸出見 `tests/local/LOCAL_RESULTS.md`、
`tests/local/local-validation.txt`；既有全案 lint／Clippy 失敗未隱藏。
Windows NSIS 狀態以 ZIP 的 `tests/windows-job.json`／完整日誌及 README 頂端 Actions 為準，
不是在此預先宣稱成功。安裝程式在同一 run 的 `Zoro-windows-x64-installer` Artifact；
本審查檔為 `zoro-v3.1-review.zip`。下載解壓後執行其中 `*-setup.exe`。

限制：沒有私人測試檔逐項實測；沒有真正 WebView2 GUI 驗收，雙欄、縮放、快速滑鼠、
選取浮動工具列、原生匯出、重啟、PDF+PDF／搜尋／註記皆待實機確認。部分旋轉、疊字、
混合圖說及異常閱讀順序仍可能拒絕定位。文字層未載入／掃描頁無法判定。句子完整性不能
由標點或作者聲明自動證明；中文 KaTeX 內部與圖片文字仍不做逐句選取。
診斷開啟時對大量組數的完整檢查可能較耗時，平常可關閉。沒有新增 AI、BabelDOC 或外部 API，
沒有修改既有繁中／Welcome 功能。完整修改清單見 `changes/changed-files.txt`。
