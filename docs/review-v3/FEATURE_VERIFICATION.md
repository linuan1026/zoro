# V3 功能驗證

PASS 只代表以下實際執行方法。JSDOM 的幾何是受控模擬，不是 Windows PDF.js GUI。

| 功能 | 狀態 | 方法／程式位置 |
|---|---|---|
| JSON 單檔匯入內容、持久化封裝再讀取 | PASS | v3.test.mjs roundtrip；sentenceAlignment.ts importBilingualBundle/readAlignedDocument |
| 原生 Windows JSON 選檔與儲存重啟 | NOT TESTED | 待實機；OfflineTranslationToolbar → 既有 Rust JSON 儲存 |
| 一對一、一對多、多對一、跨頁多對多格式 | PASS | 格式 roundtrip、React 多目標渲染；實際跨頁 GUI NOT TESTED |
| 跨行斷字、ligature、Greek／化學記號 | PASS | 正規化與模擬 Range；sentenceAlignment.ts、useSentenceAlignment.ts |
| 多個 PDF span 與雙欄重複句／region | PASS | JSDOM 多 Text 節點與幾何；無唯一匹配時為空 |
| 原生雙欄學術 PDF、圖說／表格與正文、旋轉頁面 | NOT TESTED | 須用實際 PDF 驗收，可能因文字層順序不可靠而不匹配 |
| Markdown 精確句子反白、跨格式、表格、搜尋與 KaTeX 共存 | PASS | 實際 React SSR；rehypeSentenceAlignment |
| PDF→中文 hover、中文→PDF hover | PASS | 掛載 React + JSDOM pointer 事件；真實 WebView2 NOT TESTED |
| 固定／解除、離開清除、快速移動 | PASS | 掛載互動及可控 rAF；BilingualTextViewer/useSentenceAlignment |
| 縮放後重新量測 | PASS | 模擬縮放 Range 幾何；原生縮放 NOT TESTED |
| 版本切換、停用分頁、舊文件無映射 | PASS | 掛載 key 卸載、isActive、空 pairs 測試 |
| 非法／不完整對照拒絕、重複／有歧義不高亮 | PASS | schema/ID/page/region/size/quote 測試；壞內部對照不丟棄可讀譯文 |
| 可選自動跟隨、逐句開關、與同步獨立 | NOT TESTED | 控制項與狀態已實作，完整原生閱讀互動待驗收 |
| zh-TW 1,151 鍵／插值／複數後綴完整 | PASS | JSON 扁平鍵與 placeholder 比較 |
| 台灣用詞、常見簡體殘留掃描 | PASS | 詞彙斷言、TS/TSX 掃描；全介面語氣人工視覺審閱 NOT TESTED |
| 台灣 navigator 首次繁中、既有英文偏好保留、語言切換 | PASS | i18next detector + 掛載 React 重繪；Windows 系統整合 NOT TESTED |
| AI／PDF 目標語言與介面設定分離 | PASS | 靜態變更檢查；沒有修改 translationStore/設定寫入流程，原設定回歸測試通過 |
| 新安裝／既有偏好／第二次啟動不自動 Welcome | PASS | initialOnboardingVisibility、store 連接與 App 初始化靜態測試 |
| 實際全新資料庫初始化、已有文獻庫啟動、視窗拖曳／最大化／縮放 | NOT TESTED | 原啟動與視窗程式未改動，仍需 Windows 手動驗收 |
| PDF+PDF、原 PDF 搜尋／選取／註記、主題 | NOT TESTED | 核心元件未改；實機功能回歸仍需驗收 |
| V2 匯入解碼、頁碼同步、搜尋、安全外部網址、損壞隔離 | PASS | 原有 Node/Rust 自動測試；原生 GUI NOT TESTED |
| 不需 AI API／BabelDOC | PASS | 新流程靜態檢查與本機測試，沒有 AI 呼叫；實際斷網 GUI NOT TESTED |
| Windows NSIS 與 ZIP 建置 | 見 tests/windows-job.json | 只在遠端成功後附入證據，GUI 安裝測試仍為 NOT TESTED |

沒有產生假冒成功的 GUI 截圖。格式範例是合成內容，不含個人論文。
