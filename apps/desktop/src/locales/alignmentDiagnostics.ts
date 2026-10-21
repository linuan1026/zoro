export const diagnosticEnglish = {
	toggle: "Sentence diagnostics / coverage",
	refresh: "Refresh rendered-page checks",
	export: "Export diagnostic JSON / TXT",
	inspect: "Inspect alignment ID",
	page: "Physical PDF page {{page}}",
	summary:
		"{{groups}} imported groups; supplied PDF pages: {{pages}}. This is NOT full-paper coverage.",
	missingPages: "Pages with no supplied entries: {{pages}}",
	none: "None",
	missingId: "This ID is not present in the imported data.",
	presentId: "ID exists in the imported data.",
	noHover:
		"No resolved ID at the pointer. A missing entry and an unresolved existing entry are different; inspect the page rows below.",
	privacy:
		"Export contains IDs, page numbers, status, counts and uncovered-region coordinates, not source/translation text, excerpts or file paths.",
	completeness:
		"Sentence completeness is not provable from punctuation. Labels are declarations or heuristics, not verified translation quality.",
	coverage:
		"Page {{page}}: {{groups}} groups; {{uncovered}} incompletely covered text fragments; loaded-text character coverage {{fraction}} (not semantic/document coverage).",
	source: "Source",
	target: "Translation",
	layer: "Text layer loaded: {{loaded}}",
	partial: "Only part of the target is marked (overlapping selectors)",
	count: "{{fragments}} fragments / {{lines}} lines / {{matches}} candidates",
	selection:
		"Hover remains active during text selection; selecting text does not pin. Toolbar controls are not treated as sentence clicks.",
	error: "Diagnostic export failed: {{error}}",
	status: {
		matched: "Uniquely located",
		duplicate: "Repeated / ambiguous",
		"not-found": "Text/context not found",
		"order-unresolved": "Geometric reading order ambiguous",
		"page-not-loaded": "Page not rendered",
		"text-layer-not-loaded": "Text layer not loaded",
		"text-layer-empty": "No measurable text (loading / scanned PDF possible)",
		"region-empty": "No text inside supplied region",
		"section-unavailable": "Translation section not available",
		"overlap-conflict": "Target conflicts with another alignment",
		"declared-fragment": "Declared partial fragment",
		"declared-full-unverified": "Declared full sentence (not verified)",
		"ending-present-unverified":
			"Sentence-ending punctuation present (not proof)",
		"possible-fragment": "Possible partial fragment / no sentence ending",
	},
};

export const diagnosticTraditionalChinese: typeof diagnosticEnglish = {
	toggle: "逐句診斷／覆蓋率",
	refresh: "重新檢查已呈現頁面",
	export: "匯出診斷 JSON／TXT",
	inspect: "檢查對照 ID",
	page: "PDF 實體頁碼 {{page}}",
	summary:
		"已匯入 {{groups}} 組；資料涵蓋 PDF 頁碼：{{pages}}。這不代表整篇論文已完成對照。",
	missingPages: "未提供對照資料的頁碼：{{pages}}",
	none: "無",
	missingId: "此 ID 不存在於匯入資料。",
	presentId: "此 ID 已存在於匯入資料。",
	noHover:
		"滑鼠目前沒有成功定位的 ID。資料未收錄與已收錄但定位失敗不同，請查看下方該頁各組診斷。",
	privacy:
		"匯出僅包含 ID、頁碼、狀態、計數與未涵蓋區域座標，不含原文、譯文、片段內容或檔案路徑。",
	completeness:
		"句子是否完整不能只靠句尾標點判定。以下僅為資料聲明或啟發式提示，不保證完整句子或翻譯品質。",
	coverage:
		"第 {{page}} 頁：{{groups}} 組；{{uncovered}} 個文字片段未完全涵蓋；已載入文字的字元覆蓋率 {{fraction}}（不是語意或全文翻譯覆蓋率）。",
	source: "英文來源",
	target: "中文譯文",
	layer: "文字層已載入：{{loaded}}",
	partial: "只有部分譯句可標記（對照範圍互相重疊）",
	count: "{{fragments}} 個文字片段／{{lines}} 行／{{matches}} 個候選",
	selection:
		"文字選取期間仍可滑鼠懸停；選字不會固定句子，工具列按鈕也不視為句子點擊。",
	error: "診斷匯出失敗：{{error}}",
	status: {
		matched: "唯一定位成功",
		duplicate: "重複匹配／有歧義",
		"not-found": "找不到文字或上下文",
		"order-unresolved": "幾何閱讀順序有歧義",
		"page-not-loaded": "頁面尚未呈現",
		"text-layer-not-loaded": "文字層尚未載入",
		"text-layer-empty": "沒有可量測文字（可能仍載入或為掃描 PDF）",
		"region-empty": "指定區域內沒有文字",
		"section-unavailable": "譯文分段不存在或尚未呈現",
		"overlap-conflict": "譯文與其他對照範圍衝突",
		"declared-fragment": "資料聲明為部分片段",
		"declared-full-unverified": "資料聲明為完整句子（未驗證）",
		"ending-present-unverified": "有句尾標點（不代表一定完整）",
		"possible-fragment": "可能為半句片段／沒有句尾標點",
	},
};
