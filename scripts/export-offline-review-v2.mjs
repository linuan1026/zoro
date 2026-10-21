import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const repo = process.cwd();
const output = process.argv[2];
if (!output || fs.existsSync(output)) throw new Error("Provide a fresh output directory");
const isV3 = process.env.ZORO_REVIEW_VERSION === "3";
const isV31 = process.env.ZORO_REVIEW_VERSION === "3.1";
const evidenceDirectory = isV31 ? "docs/review-v31/" : isV3 ? "docs/review-v3/" : "docs/review-v2/";
const base = isV31 ? "9b73ae531e3aecce9ff682b449676705d6faba3c" : isV3 ? "2022837a14620a59b136ec9665e12fcb977ae67c" : "d24f66b03d9f7f3d7a60156c77be9b0d0e8e9ddf";
const git = (...args) => execFileSync("git", args, { cwd: repo, maxBuffer: 64000000 });
const head = git("rev-parse", "HEAD").toString().trim();
const run = process.env.GITHUB_RUN_ID;
const actionsUrl = run ? `https://github.com/linuan1026/zoro/actions/runs/${run}` : "NOT RUN (local package)";
function write(relative, value) {
  const file = path.join(output, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}
function redact(value) {
  return value.replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\s"'<>]+/g, "<LOCAL_PATH>")
    .replace(/\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,})\b/g, "[REDACTED]");
}
const tracked = git("ls-tree", "-r", "--name-only", head).toString().trim().split("\n");
const sourceFiles = tracked.filter((name) => !/(^|\/)(\.git|node_modules|target|dist|\.env[^/]*)(\/|$)/.test(name) && !name.startsWith("docs/img/") && !/^docs\/review-v\d+\//.test(name) && !/\.(pdf|exe|zip|log)$/i.test(name));
for (const relative of sourceFiles) write(`source/${relative}`, git("show", `${head}:${relative}`));
write("changes/git-diff.patch", git("diff", "--binary", base, head));
write("changes/changed-files.txt", git("diff", "--name-status", base, head));
write("changes/git-status.txt", git("status", "--short", "--branch"));
write("changes/commit-history.txt", git("log", "--format=%H %s", `${base}..${head}`));
const info = `# 版本資訊\n\n- Repository: https://github.com/linuan1026/zoro\n- Branch: feat/offline-bilingual-reader\n- v2 base: ${base}\n- HEAD: ${head}\n- Original base: 599468e0c419842e3df5d105d170dccccf54af68 (fix/windows-pdf-settings-select)\n- PR: https://github.com/linuan1026/zoro/pull/1\n- Windows / review Actions: ${actionsUrl}\n- Generated UTC: ${new Date().toISOString()}\n`;
write("changes/repository-info.md", info);
let windowsStatus = "NOT RUN";
if (run) {
  const api = async (endpoint) => {
    const response = await fetch(`https://api.github.com/repos/linuan1026/zoro/${endpoint}`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub evidence ${response.status}: ${endpoint}`);
    return response;
  };
  const jobs = await (await api(`actions/runs/${run}/jobs`)).json();
  const windows = jobs.jobs.find((job) => job.name === "windows");
  if (!windows || windows.conclusion !== "success" || windows.head_sha !== head) throw new Error("Windows build evidence does not match successful HEAD");
  windowsStatus = "PASS (NSIS build/artifact; GUI NOT RUN)";
  write("tests/windows-job.json", JSON.stringify(windows, null, 2));
  write("tests/windows-job-full.log", redact(await (await api(`actions/jobs/${windows.id}/logs`)).text()));
  const artifacts = await (await api(`actions/runs/${run}/artifacts`)).json();
  write("tests/windows-artifacts.json", JSON.stringify(artifacts, null, 2));
  if (!artifacts.artifacts.some((artifact) => artifact.name === "Zoro-windows-x64-installer" && !artifact.expired)) throw new Error("Installer artifact missing");
}
for (const name of tracked.filter((name) => name.startsWith(evidenceDirectory))) write(`tests/local/${path.basename(name)}`, git("show", `${head}:${name}`));
write("tests/TEST_RESULTS.md", `# 測試證據\n\nWindows NSIS: ${windowsStatus}\nActions: ${actionsUrl}\n\n本機逐項命令與結果見 local/LOCAL_RESULTS.md；完整輸出含失敗紀錄見 local/local-validation.txt。\nWindows 原生 GUI、安裝後操作、WebView2 互動：NOT RUN。\n`);
write("README_FOR_CHATGPT.md", info.replace("v2 base:", "review base:") + "\n" + git("show", `${head}:${isV31 ? "docs/v31-review.md" : isV3 ? "docs/v3-review.md" : "docs/offline-reliability-review.md"}`).toString());
write("verification/FEATURE_VERIFICATION.md", `# 驗證範圍\n\nPASS 僅指下列實際自動測試，不代表 GUI 實測。\n\n| 項目 | 狀態／方法 |\n|---|---|\n| 損壞 JSON 隔離、排序、來源篩選、保留損壞檔 | PASS / Rust 暫存資料夾測試 |\n| Markdown/TXT 解碼與繁中／科學符號 | PASS / decodeTranslation 單元測試 |\n| Markdown 標題、清單、表格、公式、搜尋 | PASS / 實際 React 元件 SSR |\n| 錨點零／一／多、插值、末端、非法與邊界 | PASS / 純函式單元測試 |\n| 雙向回授、重新量測、清理 | PASS / EventTarget 與影格佇列模擬，非 GUI |\n| 安全網址、確認後開啟 | PASS / URL 與假 opener 測試；原生 GUI NOT TESTED |\n| 保存重開／刪除保留原 PDF | PASS / Rust 檔案重讀；應用重啟 NOT TESTED |\n| Windows NSIS | ${windowsStatus} |\n| 原生匯入、PDF 左欄／中文右欄、欄寬拖曳、獨立捲動、主題、選取複製 | NOT TESTED / 待 Windows GUI |\n| 實際同步、縮放、快速版本／分頁切換、上下筆導航 | NOT TESTED / 待 Windows GUI |\n| PDF+PDF、原 PDF 搜尋／註記、Windows 設定回歸 | NOT TESTED / 未改核心；有設定單元測試，仍待 GUI |\n| 安裝啟動與應用重啟恢復版本 | NOT TESTED / 待 Windows GUI |\n| 無外部 AI API | PASS / 靜態流程檢查，離線指令無 AI 呼叫；實際斷網 GUI NOT TESTED |\n| 圖片附件 | NOT TESTED / 未實作，刻意保留封鎖 |\n\n程式位置與測試函式請見 README 四項問題對照。無真實 GUI 截圖，未產生示意成功畫面。\n`);
if (isV3) write("verification/FEATURE_VERIFICATION.md", git("show", `${head}:docs/review-v3/FEATURE_VERIFICATION.md`));
if (isV31) write("verification/FEATURE_VERIFICATION.md", git("show", `${head}:docs/review-v31/FEATURE_VERIFICATION.md`));
function walk(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]); }
const dangerous = /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{25,}|gsk_[A-Za-z0-9]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,})\b/;
for (const file of walk(output)) if (dangerous.test(fs.readFileSync(file).toString())) throw new Error(`Credential-shaped value in ${path.relative(output, file)}`);
write("verification/SECURITY_SCAN.md", "# 封裝檢查\n\n只複製 Git 提交檔案與明確產生的證據；不讀取使用者資料目錄。排除 .env、PDF、exe、ZIP、node_modules、target、dist、.git 與既有截圖。檢查常見金鑰前綴；CI 證據中的本機路徑遮蔽，未寫出 GITHUB_TOKEN。沒有個人論文與執行快取。此掃描不是對所有機密的形式化證明。\n");
const manifest = walk(output).map((file) => { const bytes = fs.readFileSync(file); return { path: path.relative(output, file).replaceAll("\\", "/"), bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") }; });
write("MANIFEST.json", JSON.stringify({ head, base, files: manifest }, null, 2));
console.log(`Exported ${sourceFiles.length} source files; ${manifest.length} manifest entries; HEAD ${head}`);
