# Zoro V3 程式審查交接

專案 https://github.com/linuan1026/zoro ，分支 `feat/offline-bilingual-reader`，
既有 PR https://github.com/linuan1026/zoro/pull/1 。本輪基礎為 V2 已成功建置的
`2022837a14620a59b136ec9665e12fcb977ae67c`；保留 `9389e07` 與原 Windows 修復歷史。
ZIP 頂端列出確切 HEAD／Actions；`changes/` 包含本輪完整差異、檔案清單與提交紀錄。

## 1. PDF ↔ Markdown 離線逐句對照

### 資料與匯入

`src/lib/sentenceAlignment.ts` 定義 `BilingualBundle`、`SentencePair`、`SourceQuote`、
`SentenceQuote`；`validatePairs` 嚴格驗證版本內容、唯一 ID、頁碼、中文分段、上下文、
大小與可選頁面區域。完整格式與生成指示見 `docs/sentence-alignment.md`、
`docs/cn/sentence-alignment.md`；完整合成範例為 `docs/examples/sentence-bundle.zoro.json`。
範例不是私人論文，也不代表真實 PDF 已通過 GUI 驗收。

每組 `source[]` 與 `target[]` 支援一對一、一對多、多對一、多對多；跨頁句子使用多個
帶實體頁碼的來源片段。中文位置以 Markdown 頁碼分段及可見文字／前後文選取器識別，
不依賴不穩定的 DOM span 編號或螢幕百分比。ID 在文件內唯一且持久化。

`OfflineTranslationToolbar.tsx` 新增原生 JSON 匯入按鈕，`importBilingualBundle`
將完整 Markdown 及對照轉成既有 Markdown 記錄（UTF-8 Base64 的安全內部前置註解）。
不更動原始 Markdown 字串；`readAlignedDocument` 在呈現前取出標記並再次驗證。
壞的內部對照會停用對照、保留可讀譯文並提示。外部 JSON 格式錯誤不保存半成品。

沿用 `commands.importOfflineTranslation` 與 Rust `import_offline_translation`、
`save_document` 的 UUID JSON 原子保存，位置仍為
`<使用者資料目錄>/offline-translations/<paper UUID>/<translation UUID>.json`，
預設 Windows `%USERPROFILE%/.zoro`，尊重自訂資料目錄。資料仍以論文 ID 與原 PDF
檔名關聯，不需要 schema migration、額外後端指令或檔案權限。重新載入版本時對照隨內容恢復。
舊 Markdown/TXT 不要求補上對照，也不會自動進行推測式對照。

### 文字定位與高亮

`normalizedText` 保留原始 UTF-16 位移回映射，支援 NFKC 相容字元、ligature、
軟連字號、跨行小寫斷字及空白合併，保留英文大小寫與希臘字母區別。
`locateQuote` 在前後文限制後必須唯一匹配，不用模糊語意或出現序號猜測。

`src/components/reader/useSentenceAlignment.ts` 的 `pdfQuoteRanges` 讀取 PDF.js
文字層多個 Text 節點，利用行／字距組合文字、可選 region 限定欄位、Range 回映射到
實際句子的矩形。大幅跨欄跳躍會插入不可比對阻隔。來源 hover 只處理所在頁面對照，
Range 快取在縮放／DOM／視窗／欄寬變化後失效重算；快速 pointermove 合併為 rAF。
不直接改寫 PDF.js DOM、不攔截原本選取與註記。

`rehypeSentenceAlignment` 在 sanitize、KaTeX、搜尋標記之後，依目標中文分段與文字
選取器插入受控 HAST span，由 ReactMarkdown/React 渲染。可跨粗體等文字節點，
保留表格、搜尋標記及公式結構。句子高亮只改 class，不改原始 Markdown。
英文反白由 React 矩形覆蓋層呈現，`pointer-events: none`，深淺主題採半透明黃色。

`BilingualTextViewer.tsx` 管理 hover、固定 ID、獨立逐句開關及預設關閉的自動跟隨。
滑鼠移入任一側可雙向對照；點擊固定，再點同句或「解除固定句子」取消。
有選取範圍時不攔截選字；連結按鈕保留原本安全確認操作。
逐句對照與 V2 頁碼同步獨立，預設不因 hover 自動捲動。
`reader.tsx` 原有版本 ID key 保證切換版本卸載舊狀態；分頁停用清除監聽器與 pending rAF。

### 明確限制

- 沒有文字層的掃描 PDF、不可靠的 PDF 文字順序、無法恢復的科學符號排版可能不對應。
  沒有加入 OCR、AI、網路或百分比句子猜測；找不到、重複、衝突時寧可不高亮。
- 跨欄或跨頁請明確拆來源片段；region 必須符合顯示的頁面旋轉。未知座標不能捏造。
- 中文定位不包含 KaTeX 公式內部或圖片說明；匹配的是呈現後文字，格式界線可跨越。
- 本機驗證幾何使用 JSDOM 模擬，**真實 PDF.js / WebView2 的 hover、縮放、選取／註記
  共存仍為 NOT TESTED**。程式測試不能當作所有學術 PDF 都能精確定位的保證。
- 對照與翻譯本身由匯入者提供，文字匹配不是語意正確性的認證；本程式不驗證中文翻譯品質。
- 如果同時開啟自動跟隨與頁碼同步，譯文捲動可能經既有同步機制帶動原文，詳見格式文件。

## 2. 真正的台灣繁體中文介面

新增完整 `src/locales/zh-TW.json`，與英文基底 1,151 個鍵一致，插值與複數後綴保留。
以既有 zh-CN 作為翻譯來源，先產生台灣繁體字詞初稿，再套用人工指定的台灣術語與
逐鍵修訂（文獻庫、新增、搜尋、設定、儲存、資料夾、匯入、剪貼簿、滑鼠、影片、
軟體、資料庫、中繼資料、快速鍵、註記等），不是僅把 zh-CN 字形即時轉換。
OpenCC 僅於開發期離線產生初稿，不作為程式執行期依賴；成品為獨立靜態資源。
所有原有畫面領域的既有翻譯鍵均包含；未宣稱全部畫面已人工視覺驗收。

`src/lib/i18n.ts` 的 zh-TW 改載入獨立資源，不再展開 zhCN；新增離線句子控制項
在 `src/locales/offline.ts` 提供繁中及英文（其他語言沿用既有英文 fallback）。
`src/lib/uiPreferences.ts` 的 `normalizeUiLanguage` 將 zh-TW／zh-Hant 等映射至 zh-TW；
保留 i18next localStorage 優先、navigator 次之的偵測順序。台灣系統首次使用預設繁中，
已保存其他語言則尊重既有值。無法從舊版自動快取的語言值判斷當年是否為手動選取，
因此不擅自覆寫既有 `zoro-ui-language`；使用者仍可自行切換。

`uiStore.ts` 使用相同正規化規則，不更動 AI nativeLang、PDF Translation 目標語言或金鑰。
硬編碼常見簡體字詞掃描未發現 TS/TSX 殘留；JSON 結構、插值、主要台灣用詞與常見
簡體殘留有回歸測試，並實際掛載 React 驗證語言切換後重新呈現。
真正 Windows 系統語言與 WebView navigator 的整合仍待實機驗收。

## 3. 啟動略過 Welcome

`uiStore.ts` 原本依 `zoro-onboarding-completed` 決定顯示，現改用
`initialOnboardingVisibility()`，一律初始 false。沒有模擬點 Skip、刪除資料或寫入假設定。
`App.tsx` 原有 fetchPapers／fetchCollections／fetchTags／fetchAiConfig 等正常載入與
Rust 資料庫／資料夾初始化未改動；Welcome 內的 AI/provider 設定都是自選設定，不是
必要初始化，不能為跳過而自動儲存或啟用它們。

設定頁原有 `restartOnboarding` 仍可手動顯示導覽。新安裝、已有設定、二次啟動皆不會
自動顯示。視窗標題列、拖曳、縮放、最大化程式碼沒有改動，但真實 Windows GUI 尚未測試。

## 測試、Git 與交付

實際命令、失敗與修正後紀錄見 `tests/local/LOCAL_RESULTS.md`、`local-validation.txt`。
新增 `apps/desktop/tests/v3.test.mjs` 涵蓋格式、安全拒絕、正規化、跨 span／行／雙欄、
縮放、多對多、重複文字、React SSR 與掛載互動、快速移動、固定／解除、反向 hover、
停用／版本清理、語言完整性／切換、既有偏好與啟動邏輯。JSDOM 不是原生 GUI。
原有 17 個 V2／Windows 設定測試維持通過；Rust 原有儲存隔離測試仍執行。

沿用 Windows NSIS workflow，新增 V3 測試與全部修改前端檔案的 Biome 檢查。
`.gitattributes` 的 LF 修復保留，沒有 continue-on-error、跳過原有測試或 force push。
review job 用 `scripts/export-v3-review.mjs` 重用既有安全匯出器，產生
`zoro-v3-review.zip`：完整追蹤原始碼、V2→V3 diff、格式規格／完整範例、測試輸出與
功能驗證表。封裝排除憑證、.env、.git、使用者論文、node_modules、target、編譯快取。
Windows 成功後自動納入真實工作紀錄；每個 manifest 檔案均解壓驗證 SHA-256。

登入 GitHub，開啟頂端 Actions 連結的 Artifacts，下載 `Zoro-windows-x64-installer`，
解壓執行 setup.exe（未簽章分支測試版；先備份資料）。開啟 PDF 後可匯入原 md/txt，
或按「匯入逐句雙語對照檔」選取符合規格的 JSON。未開啟自動跟隨時 hover 不強迫跳頁。
`zoro-v3-review` Artifact 下載後即為所需審查 ZIP；安裝成功不等於所有 GUI 功能已驗收。
