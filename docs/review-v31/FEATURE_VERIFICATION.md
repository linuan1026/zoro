# V3.1 功能驗證範圍

PASS 僅代表下面實際執行的方法，不是 Windows GUI 測試。

| 項目 | 結果 | 證據／位置 |
|---|---|---|
| 完整英文跨三行／四 span／錯序 DOM | PASS | v31.test.mjs；resolvePdfQuote，精確 Range 內容／片段與行數 |
| 雙欄、相鄰右欄圖說不交錯 | PASS | 合成座標測試；不等同所有真實排版 |
| 同頁重複句子拒絕；region／上下文唯一解 | PASS | v31 幾何／上下文測試 |
| Unicode、Greek 區別、跨行斷字、相鄰上下標 | PASS | v31；沿用 normalizedText |
| 半句不擴張、完整性標示不冒充驗證 | PASS | quoteCompleteness／Range；舊 schema 相容 |
| JSON 無 ID vs 有 ID 但定位失敗 | PASS | diagnosticExport／alignmentCoverage |
| 缺頁、缺文字層、空層、空 region、重複、行序不明 | PASS | v31 分類斷言 |
| 中文全句／格式節點／表格／公式／一對多 | PASS | 真實 TranslationMarkdown SSR；公式保留但不定位其內文 |
| 譯句範圍衝突的部分標記可診斷 | PASS | 重疊 target 測試 |
| 任意一行 hover 皆啟用整組所有 Range | PASS | 掛載 React/JSDOM，四矩形／三行；座標模擬 |
| 選取不 pin，工具列不覆蓋 hover，pin／解除／反向 | PASS | 掛載 hook 測試，非原生工具列 |
| 延遲文字層／縮放／快速移動／版本與分頁清理 | PASS | V3 + V3.1 單元與掛載測試 |
| 覆蓋頁面／每頁數量／未涵蓋區域，不把組數當全篇 | PASS | coverage assertions + UI 程式檢查 |
| 匯出資料無原文／譯文／節錄 | PASS | JSON 字串負向斷言；原生 Save 尚未 GUI 測試 |
| 新訊息鍵／插值相同，無廣域寫入權限 | PASS | namespace／capability 測試 |
| 原有 V2/V3 自動回歸 | PASS | 35 Node + 60 Rust，5 Rust 網路測試 ignored |
| 既有繁中／Welcome 不變 | PASS | Git 差異檢查、原 V3 鍵／初始化回歸；非 GUI |
| 私人 SERD PDF 與原 44 組資料 | NOT TESTED | 未提供檔案，不能區分該檔每句的具體成因 |
| 真實 Windows 安裝、文字層、跨行滑鼠、縮放與浮動工具列 | NOT TESTED | 需安裝本次 NSIS 實測 |
| 原生匯出 JSON／TXT 與重新啟動 | NOT TESTED | 需確認 dialog 動態權限與保存操作 |
| PDF+PDF／PDF 搜尋／註記／主題／欄寬／頁碼同步 | NOT TESTED | 未更動核心；自動回歸不能代替 GUI |
| Windows NSIS／審查 ZIP | 依本包 tests/windows-job.json | CI 成功後才產生包含實際日誌的 Artifact |

## 建議 Windows 驗收

用同一 PDF 與完整的 bundle 比較：已知只有半句的 ID、完整三行 ID、未收錄句子、
重複句子的 region、未載入頁面。開啟診斷，匯出報告，確認頁碼／組數／狀態，不需分享正文。
再驗證拖曳選字、註記、浮動工具列、固定／解除、切換版本／分頁、縮放、重啟與 PDF+PDF。
若缺字或讀序錯誤，分享不含正文的診斷報告；完整性疑慮另核對原 JSON。
