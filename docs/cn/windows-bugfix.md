# Windows 設定修正

AI/PDF 編輯欄位只在首次載入時初始化。之後 `loadAiConfig()` 僅更新已儲存資訊，避免 AI 自動儲存覆蓋仍在等待 1500 ms 延遲儲存的 PDF 編輯。重設提示詞只更新提示詞欄位。PDF 儲存失敗會保留編輯內容並顯示後端錯誤；Rust 先成功寫入 config.toml，才提交記憶體設定。未更動文獻資料或語言對應，自訂 `zh-TW` 仍可使用。

原生下拉選單明確指定 CSS color-scheme，以及 option/optgroup 的前景與背景色，改善 WebView2 顯示。

驗證指令：`node --test apps/desktop/tests/settings-regression.test.mjs`、桌面型別檢查及 `cargo test --all`。前端測試直接執行實際載入函式，模擬 PDF 延遲儲存期間的舊回應及重疊初始讀取。Rust 測試使用暫存目錄驗證 PDF 啟用及 `zh-TW` 寫入後重新讀取。Windows GUI 仍需實機驗證：啟用 PDF、等待儲存、重新啟動，並檢查深淺主題的選項文字。

## 從分支編譯 Windows 安裝檔

推送 `fix/windows-pdf-settings-select` 分支至 GitHub，會自動觸發 **Windows installer (branch)**，無需合併 main。開啟 Actions 中該分支的執行紀錄；完成後下載 Artifacts 中的 **Zoro-windows-x64-installer**，解壓取得 `.exe`。此流程只產生未簽章的 x64 NSIS 安裝檔，不發布 Release，也不產生更新器簽章檔。也保留 workflow_dispatch 入口，若 GitHub 顯示 Run workflow，可選擇修正分支手動執行。既有 Release 流程會發布版本並建置全部平台，不適合私人測試建置。

環境提供的基準為 `badb101`，未提供 v0.1.3 標籤；GitHub DNS／代理連線失敗。因此尚未對精確 v0.1.3 或 Windows GUI 完成驗證。
