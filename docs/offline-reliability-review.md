# 離線雙語閱讀器第二輪審查交接

本文件為獨立審查入口；ZIP 內會另加確切版本、差異、完整原始碼、測試紀錄與 Actions 資訊。
專案：https://github.com/linuan1026/zoro ，既有 PR：https://github.com/linuan1026/zoro/pull/1 。
功能分支：`feat/offline-bilingual-reader`；第二輪基礎提交：`d24f66b03d9f7f3d7a60156c77be9b0d0e8e9ddf`。
原始功能的 Windows 修復基礎：`fix/windows-pdf-settings-select`，`599468e0c419842e3df5d105d170dccccf54af68`。
第二輪採追加提交，未改寫既有歷史。ZIP 的 `changes/changed-files.txt` 為本輪完整修改清單。

## 四項問題修正前後

### 1. 單一 JSON 損壞

原先 `list_offline_translations` 任一讀取／反序列化錯誤即終止整份清單。
現在 `apps/desktop/src-tauri/src/commands/offline_translation.rs` 的 `list_documents`
獨立處理單一檔案錯誤，保留原檔，記錄 tracing 警告（檔名、錯誤種類、行列；不記錄內容）。
目錄不存在視為尚未匯入；其他目錄存取、目錄列舉錯誤仍回傳錯誤。
Tauri 指令參數、回傳型別與 TypeScript 介面不變。

Rust 測試 `test_list_isolates_corruption_and_preserves_sort_and_pdf_filter` 於暫存資料夾
產生三份有效 JSON、一份截斷 JSON、一份 TXT，驗證三份有效譯文、時間排序、來源 PDF
篩選、損壞內容未變，再模擬不可讀取的 JSON 目錄項目及系統性錯誤。
原有 `test_saved_versions_survive_reopen_and_delete_preserves_original` 保留。

### 2. 末端同步、對應精確程度與生命週期

原先 `mapTranslationOffset` 到最後錨點後回傳固定位置。
現在 `apps/desktop/src/lib/offlineTranslation.ts` 的 `mapTranslationPosition` 回傳位置與
`exact` / `approximate` 分類；`null` 表示無對應。原函式保留數值回傳相容包裝。
實際錨點頁首才是精確位置；錨點間線性插值；最後錨點至兩欄實際最大 scrollTop
之間為近似尾段；單一錨點不代表整篇精確；第一個錨點前／無錨點不映射。
非法、非有限、逆序與不可到達的幾何點排除，輸入輸出均限制於捲動範圍。

`apps/desktop/src/lib/translationScroll.ts` 的 `bindTranslationScroll` 合併 rAF、記錄預期
程式捲動位置及寫入鎖，避免同步及非同步回授；`dispose` 取消影格並移除監聽器。
`BilingualTextViewer.tsx` 在每次映射時重新量測 DOM，利用 ResizeObserver / MutationObserver
處理字體、欄寬、視窗、PDF 縮放、延遲頁面變化；停用分頁與卸載時清除 observers／計時器。
`reader.tsx` 既有的 `key={offlineDocument.id}` 確保版本切換清除舊狀態。
工具列以繁中／英文區分精確頁首、近似位置、無可用對應。

`tests/offline-reliability.test.mjs` 涵蓋零／單／雙／多個稀疏錨點、前後界、不同長度、
非法／重複／逆序／圍欄標記、捲動邊界、幾何變化與延遲錨點出現。
以 EventTarget 假捲動區、可控影格佇列模擬雙向即時及延遲捲動事件，驗證不回圈、
dispose 後不更新。這不是 WebView2 實機捲動驗收。

### 3. 搜尋不再修改 React 的文字 DOM

移除 TreeWalker、replaceWith 與 normalize。`src/lib/translationContent.ts` 的
`searchParts` 使用逸出的字面值、不分大小寫 Unicode 正規表示式。
`rehypeTranslationSearch` 在 sanitize、KaTeX 後將普通 HAST 文字轉成 mark 節點，
`TranslationMarkdown.tsx` 交由 ReactMarkdown／React 渲染；`TranslationPlainText`
直接產生 React mark。搜尋效果只讀取標記數量及捲動至目前結果，不修改內容 DOM。
結果數量、前後筆與版本切換重設保留。文字仍為可選取複製的真正文字。

測試直接 SSR 渲染實際 React 元件，涵蓋中文、英文大小寫、多筆／零筆、特殊字元、
表格、清空、多次重繪、替換版本／TXT、KaTeX 與不可信 HTML。
**限制：**逐個渲染文字節點搜尋，不搜尋 KaTeX 公式內部、圖片說明及跨格式邊界字串。
搜尋框 tooltip 及文件皆明示；SSR 重繪測試不是瀏覽器互動與 React 掛載生命週期測試。

### 4. 安全連結與圖片策略

`safeTranslationUrl` 只允許有主機的絕對 HTTP(S) URL；拒絕帳密、控制字元、空白、
反斜線、相對路徑、javascript/file/data 等協定。
Markdown 安全網址顯示為明確外部開啟按鈕；`commands.openOfflineTranslationLink`
呼叫 `openConfirmedTranslationUrl` 再次驗證，經 Tauri 原生確認後才以 shell.open
啟動外部瀏覽器。沿用 `shell:allow-open`／`dialog:default`，未放寬權限。
測試確認非法網址不提示不開啟、取消不開啟、接受才開啟（以注入假函式測試）。
真正原生對話框、預設瀏覽器啟動與 Windows ACL 仍需手動驗收。

圖片仍不載入，提供替代文字占位；這是允許的安全性優先處理，**並未完成圖片附件功能**。
未來方案需獨立資源清單與匯入／保存／刪除生命週期，限定資源目錄，防符號連結與路徑穿越，
驗證檔案大小、允許副檔名、MIME 與實際 raster 簽章，排除可執行 SVG／HTML。
不應直接開放遠端圖片、任意本機資源或未清理 HTML。

## 整體架構、資料與使用方式

`src/routes/reader.tsx` 整合 `OfflineTranslationToolbar`、既有 `PdfAnnotationViewer`、
`BilingualPdfViewer` 與 `BilingualTextViewer`，左 PDF 引擎、搜尋、註記維持既有實作。
工具列以 Tauri open/readFile 選取本機 md/txt，`decodeTranslation` 嚴格解碼 UTF-8 或
帶 BOM 的 UTF-16 LE/BE，拒絕空白、NUL、超過 10 MiB。透過 `src/lib/commands.ts`
呼叫 Rust `import_offline_translation`，`save_document` 寫暫存檔再 rename。

文件儲存在 `<使用者資料目錄>/offline-translations/<paper UUID>/<translation UUID>.json`。
Windows 預設 `%USERPROFILE%/.zoro`，尊重自訂資料目錄，不寫安裝目錄。
JSON 包含 sourcePdf 檔名、ID、匯入名稱、格式、全文與 UTC 時間；論文 UUID 與
來源 PDF 檔名共同篩選關聯。未改資料庫 schema，不需 migration。
`offlineTranslationStore.ts` 依論文／PDF 快取文件，`tabStore.ts` 保存目前譯文 ID；
工具列版本選擇使用本機偏好，讀取資料夾後恢復可用版本。刪除只刪選取 UUID JSON。

左右欄沿用 ResizablePanelGroup，比例保留，右側字體與捲動獨立。`splitTranslation`
識別獨立行 `<!-- zoro-page: 1 -->` 等遞增實體頁碼，程式碼圍欄內標記無效。
右側「返回原始 PDF」透過 annotationStore.navigateToPage；左側目前頁按鈕與右側頁碼
選單跳至對應 section。沒有標記仍可閱讀，預設同步關閉。

離線匯入與閱讀不需要 BabelDOC、任何外部 AI API、金鑰、訂閱或網路。
只有使用者選擇開啟外部網頁時才需要網路。既有 BabelDOC/PDF+PDF 保留，未改動。

### 安裝與首次匯入

登入 GitHub，開啟 ZIP README 的 Windows Actions URL，從 Artifacts 下載
`Zoro-windows-x64-installer`，解壓後執行 setup.exe。此為未啟用 updater 簽章的分支測試版，
安裝前備份 `.zoro`，Windows SmartScreen 可能提示未簽章應用程式。
啟動後開啟原 PDF →「匯入翻譯」→ 選擇 ChatGPT 匯出的 md/txt → 自動左右閱讀。
版本選單可切換；有正確實體頁碼錨點時再選擇開啟同步。

## 測試與仍待手動驗證

實際執行紀錄在 `tests/`。本機 17 項 Node 測試與 60 項 Rust 測試通過，另 5 項網路測試
由現有測試設定 ignored；TS、修改檔案 lint、fmt、前端 build 通過。
全專案 lint 及嚴格 Clippy **仍為 FAIL**，不是全專案乾淨：
- d24 基線與目前 desktop 純 lint 診斷逐項比較，既有錯誤／警告不增加。
- root lint 的 core／extension 格式等失敗檔案未修改。
- 嚴格 Clippy 在未修改的 `crates/zoro-subscriptions/src/source.rs:10` async_trait
  觸發 double_must_use；暫時僅在診斷命令允許該 lint 後，desktop 所有 targets/features 通過。
  這個診斷命令不等於嚴格 Clippy 通過；未為掩蓋失敗而改規則。

尚無 Windows WebView GUI 端到端驗收：須手動檢查 Markdown/TXT 原生匯入、左右閱讀、
搜尋上下筆、字體／欄寬／PDF 縮放後同步、稀疏錨點末端、快速切換版本／分頁、
主題、重啟保存、PDF 原有搜尋與註記、PDF+PDF、外部連結確認／開啟及安裝版啟動。
建置成功或單元測試通過均不能替代以上實機確認。
