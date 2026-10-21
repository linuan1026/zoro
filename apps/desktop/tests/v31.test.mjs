import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import React, { act, createElement as element, useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

const temporary = [];
async function compile(source) {
  let output = ts.transpile(fs.readFileSync(source, "utf8"), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX });
  for (const match of output.matchAll(/from "(\.[^"]+)"/g)) output = output.replace(match[0], `from "${(await compile(new URL(`${match[1]}.ts`, source))).href}"`);
  const file = new URL(`./.v31-${randomUUID()}.mjs`, import.meta.url);
  fs.writeFileSync(file, output); temporary.push(file); return file;
}
const { resolvePdfQuote } = await import((await compile(new URL("../src/lib/pdfSentenceLocator.ts", import.meta.url))).href);
const { alignmentCoverage, diagnosticExport } = await import((await compile(new URL("../src/lib/alignmentDiagnostics.ts", import.meta.url))).href);
const { validatePairs, quoteCompleteness } = await import((await compile(new URL("../src/lib/sentenceAlignment.ts", import.meta.url))).href);
const { useSentenceAlignment } = await import((await compile(new URL("../src/components/reader/useSentenceAlignment.ts", import.meta.url))).href);
const { TranslationMarkdown } = await import((await compile(new URL("../src/components/reader/TranslationMarkdown.tsx", import.meta.url))).href);
const { diagnosticEnglish, diagnosticTraditionalChinese } = await import((await compile(new URL("../src/locales/alignmentDiagnostics.ts", import.meta.url))).href);
for (const file of temporary) fs.unlinkSync(file);

const dom = new JSDOM('<div id="test-root"></div>', { url: "https://zoro.invalid" });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, NodeFilter: dom.window.NodeFilter, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
let scale = 1;
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  const [left, top, width, height] = (this.dataset.rect ?? "0,0,1000,800").split(",").map(Number);
  return { left: left * scale, top: top * scale, width: width * scale, height: height * scale, right: (left + width) * scale, bottom: (top + height) * scale };
};
dom.window.Range.prototype.getBoundingClientRect = function () {
  const rect = this.startContainer.parentElement.getBoundingClientRect();
  const length = this.startContainer.length || 1;
  const left = rect.left + rect.width * this.startOffset / length;
  const right = rect.left + rect.width * this.endOffset / length;
  return { ...rect, left, right, width: right - left };
};
dom.window.Range.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };
const source = "Fulvestrant competes with estradiol to bind to ERα.";
const target = "Fulvestrant 會與雌二醇競爭結合 ERα。";
const pairs = [{ id: "complete", source: [{ page: 1, text: source, completeness: "full-sentence" }], target: [{ section: null, text: target, completeness: "full-sentence" }] }];
const span = (text, x, y, width = 200, height = 10) => `<span data-rect="${x},${y},${width},${height}">${text}</span>`;
const fragments = [span("Fulves-", 10, 10, 50), span("trant competes", 10, 30), span("with estradiol ", 10, 50, 100), span("to bind to ERα.", 110, 50, 100)];
function page(html, layer = true) {
  const result = document.createElement("div"); result.className = "page"; result.dataset.pageNumber = "1";
  result.innerHTML = layer ? `<div class="textLayer">${html}</div>` : html;
  return result;
}

test("exact geometry reconstruction covers a complete sentence across three lines/four spans despite scrambled DOM and zoom", () => {
  const pdf = page([fragments[2], fragments[0], fragments[3], fragments[1]].join(""));
  for (const zoom of [1, 2, 0.75]) {
    scale = zoom;
    const result = resolvePdfQuote(pdf, pairs[0].source[0]);
    assert.equal(result.status, "matched"); assert.equal(result.lines, 3); assert.equal(result.fragments, 4);
    assert.equal(result.ranges.map((range) => range.toString()).join("|"), "Fulves-|trant competes|with estradiol |to bind to ERα.");
  }
  scale = 1;
});

test("two columns are not interleaved; adjacent unrelated captions are not joined; repeated sentences require context or region", () => {
  const pdf = page([fragments[2], span("Unrelated right column.", 600, 10), fragments[0], span("Figure 1 unrelated.", 600, 30), fragments[3], fragments[1]].join(""));
  assert.equal(resolvePdfQuote(pdf, pairs[0].source[0]).status, "matched");
  assert.equal(resolvePdfQuote(pdf, { text: "Fulves-Unrelated right column." }).status, "not-found");
  const repeated = page(span(source, 10, 10, 300) + span(source, 600, 10, 300));
  assert.equal(resolvePdfQuote(repeated, { text: source }).status, "duplicate");
  assert.equal(resolvePdfQuote(repeated, { text: source, region: [0.5, 0, 0.5, 1] }).status, "matched");
  const contextual = page(span(`A. ${source} B. ${source}`, 10, 10, 600));
  assert.equal(resolvePdfQuote(contextual, { text: source, prefix: "B." }).matchCount, 1);
});

test("Greek identity, Unicode compatibility scripts and adjacent superscripts retain exact node/Range offsets", () => {
  const pdf = page(span("ERα H₂O ", 10, 20, 80) + span("2", 90, 15, 5, 6) + span(" β ≤ 10.", 95, 20, 70));
  const result = resolvePdfQuote(pdf, { text: "ERα H2O 2 β ≤ 10." });
  assert.equal(result.status, "matched"); assert.equal(result.fragments, 3); assert.equal(result.lines, 1);
  assert.equal(resolvePdfQuote(pdf, { text: "ERβ H2O 2 β ≤ 10." }).status, "not-found");
  const superscript = page(span("ER", 10, 20, 20) + span("α", 32, 15, 5, 6) + span(".", 39, 20, 5));
  assert.equal(resolvePdfQuote(superscript, { text: "ERα." }).status, "matched");
});

test("missing page/layer, empty layer, empty region, exact text absence and ambiguous line continuation are distinct", () => {
  assert.equal(resolvePdfQuote(null, { text: source }).status, "page-not-loaded");
  assert.equal(resolvePdfQuote(page("", false), { text: source }).status, "text-layer-not-loaded");
  assert.equal(resolvePdfQuote(page(""), { text: source }).status, "text-layer-empty");
  assert.equal(resolvePdfQuote(page(fragments.join("")), { text: "not provided in PDF" }).status, "not-found");
  assert.equal(resolvePdfQuote(page(fragments.join("")), { text: source, region: [0.8, 0.8, 0.1, 0.1] }).status, "region-empty");
  const ambiguous = page(span("Start", 20, 10, 100, 20) + span("left", 0, 40, 25) + span("right", 55, 40, 25));
  assert.equal(resolvePdfQuote(ambiguous, { text: "Start left" }).status, "order-unresolved");
});

test("partial selectors highlight only supplied text; completeness declarations are unverified and old selectors remain valid", () => {
  const fragment = { page: 1, text: "with estradiol", completeness: "fragment" };
  const result = resolvePdfQuote(page(fragments.join("")), fragment);
  assert.equal(result.ranges.map((range) => range.toString()).join(""), fragment.text);
  assert.equal(quoteCompleteness(fragment), "declared-fragment");
  assert.equal(quoteCompleteness({ text: "Only a fragment." }), "ending-present-unverified");
  assert.equal(quoteCompleteness(pairs[0].source[0]), "declared-full-unverified");
  assert.equal(quoteCompleteness({ text: "No ending" }), "possible-fragment");
  assert.doesNotThrow(() => validatePairs([{ ...pairs[0], source: [{ page: 1, text: source }] }]));
  assert.throws(() => validatePairs([{ ...pairs[0], source: [{ ...fragment, completeness: "verified" }] }]));
});

function reportFixture(extra = []) {
  const root = document.createElement("div");
  const pdf = document.createElement("div"); pdf.dataset.original = "true"; pdf.append(page(fragments.join(""))); root.append(pdf);
  const text = document.createElement("div");
  text.innerHTML = `<section><article>${renderToStaticMarkup(element(TranslationMarkdown, { text: `**Fulvestrant** 會與雌二醇競爭結合 ERα。`, pairs: [...pairs, ...extra] }))}</article></section>`;
  root.append(text);
  return alignmentCoverage(root, text, [...pairs, ...extra], 5);
}

test("coverage distinguishes absent IDs, existing unlocatable quotes, partial data and unloaded pages without exporting paper text", () => {
  const extra = [{ id: "missing-text", source: [{ page: 1, text: "An absent complete sentence." }], target: [{ section: null, text: "不存在的譯句。" }] }, { id: "unloaded", source: [{ page: 3, text: "partial data", completeness: "fragment" }], target: [{ section: 3, text: "部分資料" }] }];
  const report = reportFixture(extra);
  assert.deepEqual(report.suppliedPages, [1, 3]); assert.deepEqual(report.pagesWithoutEntries, [2, 4, 5]);
  assert.equal(report.importedGroups, 3);
  assert.equal(report.entries[0].source[0].lines, 3);
  assert.equal(report.entries[0].target[0].status, "matched");
  assert.equal(report.entries[1].source[0].status, "not-found");
  assert.equal(report.entries[2].source[0].status, "page-not-loaded");
  assert.equal(report.entries[2].source[0].completeness, "declared-fragment");
  assert.equal(diagnosticExport(report, 1, "absent-id").presentInImportedData, false);
  assert.equal(diagnosticExport(report, 1, "complete").presentInImportedData, true);
  const json = JSON.stringify(diagnosticExport(report, 1, "complete"));
  for (const secret of [source, target, "An absent complete sentence.", "不存在的譯句。", "partial data"]) assert.ok(!json.includes(secret));
  assert.equal(report.pageCoverage[0].matchedTextFraction, 1);
  const partial = reportFixture([{ id: "partial", source: [{ page: 2, text: "not loaded" }], target: [{ section: null, text: "ERα。" }] }]);
  assert.equal(partial.entries[0].target[0].status, "partial-conflict");
  const partialRoot = document.createElement("div"); partialRoot.innerHTML = `<div data-original>${page(span("Unmapped text.", 10, 10)).outerHTML}</div>`;
  const uncovered = alignmentCoverage(partialRoot, document.createElement("div"), [], 1);
  assert.equal(uncovered.pageCoverage[0].uncoveredAreas.length, 1);
  assert.equal(uncovered.pageCoverage[0].matchedTextFraction, 0);
});

test("full Chinese targets cross formatting/table nodes, preserve formulas and one-to-many selectors without extending supplied fragments", () => {
  const multiple = [{ ...pairs[0], target: [{ section: null, text: target }, { section: null, text: "另一個完整譯句。" }] }];
  const html = renderToStaticMarkup(element(TranslationMarkdown, { text: `| 譯句 |\n| --- |\n| **Fulvestrant** 會與雌二醇競爭結合 ERα。 |\n\n另一個完整譯句。\n\n$E=mc^2$`, pairs: multiple, activeId: "complete" }));
  const container = document.createElement("div"); container.innerHTML = html;
  assert.equal(Array.from(container.querySelectorAll('[data-alignment-targets~="complete:0"]')).map((node) => node.textContent).join(""), target);
  assert.equal(Array.from(container.querySelectorAll('[data-alignment-targets~="complete:1"]')).map((node) => node.textContent).join(""), "另一個完整譯句。");
  assert.ok(container.querySelector("table")); assert.ok(container.querySelector(".katex"));
  container.innerHTML = renderToStaticMarkup(element(TranslationMarkdown, { text: target, pairs: [{ ...pairs[0], target: [{ section: null, text: "雌二醇" }] }] }));
  assert.equal(container.querySelector("[data-alignment]").textContent, "雌二醇");
});

test("mounted hover on every line highlights all ranges; selection, toolbar, pin, reverse hover and delayed layer remain compatible", async () => {
  const root = createRoot(document.getElementById("test-root"));
  function Harness({ loaded = true }) {
    const rootRef = useRef(null), textRef = useRef(null);
    const [hover, setHover] = useState(null), [pin, setPin] = useState(null);
    const onPin = useCallback((id) => setPin((previous) => previous === id ? null : id), []);
    const activeId = hover ?? pin;
    const boxes = useSentenceAlignment({ rootRef, textRef, pairs, enabled: true, isActive: true, activeId, onHover: setHover, onPin });
    return element("div", { ref: rootRef }, element("div", { "data-original": true }, element("div", { className: "page", "data-page-number": 1 }, loaded && element("div", { className: "textLayer", dangerouslySetInnerHTML: { __html: fragments.join("") } })), element("button", { id: "selection-toolbar" }, "selection")), element("div", { ref: textRef }, element(TranslationMarkdown, { text: target, pairs, activeId })), element("output", null, `${activeId ?? ""}:${pin ?? ""}:${boxes.length}`));
  }
  const render = async (loaded) => act(async () => root.render(element(Harness, { loaded })));
  const dispatch = async (node, type, y = 15) => act(async () => { node.dispatchEvent(new window.MouseEvent(type, { bubbles: type !== "pointerleave", clientX: 20, clientY: y })); await new Promise((resolve) => setTimeout(resolve, 12)); });
  await render(false);
  await dispatch(document.querySelector(".page"), "pointermove");
  assert.equal(document.querySelector("output").textContent, "::0");
  await render(true);
  for (const y of [15, 35, 55]) {
    await dispatch(document.querySelector(".page"), "pointermove", y);
    assert.equal(document.querySelector("output").textContent, "complete::4");
  }
  const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(document.querySelector(".textLayer span")); selection.addRange(range);
  await dispatch(document.querySelector(".page"), "click");
  assert.equal(document.querySelector("output").textContent, "complete::4");
  assert.equal(selection.toString(), "Fulves-");
  await dispatch(document.getElementById("selection-toolbar"), "pointermove");
  assert.equal(document.querySelector("output").textContent, "complete::4");
  selection.removeAllRanges();
  await dispatch(document.querySelector(".page"), "click");
  await dispatch(document.querySelector("[data-original]"), "pointerleave");
  assert.equal(document.querySelector("output").textContent, "complete:complete:4");
  await dispatch(document.querySelector(".page"), "click");
  assert.equal(document.querySelector("output").textContent, "::0");
  await dispatch(document.querySelector("[data-alignment]"), "pointermove");
  assert.equal(document.querySelector("output").textContent, "complete::4");
  await act(async () => root.unmount());
});

test("diagnostic namespace preserves interpolation and export grants no blanket filesystem scope", () => {
  const flatten = (value, prefix = "") => Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => typeof entry === "string" ? [[`${prefix}${key}`, entry]] : Object.entries(flatten(entry, `${prefix}${key}.`))));
  const english = flatten(diagnosticEnglish), chinese = flatten(diagnosticTraditionalChinese);
  assert.deepEqual(Object.keys(chinese), Object.keys(english));
  for (const key of Object.keys(english)) assert.deepEqual((english[key].match(/{{[^}]+}}/g) ?? []).sort(), (chinese[key].match(/{{[^}]+}}/g) ?? []).sort());
  const capabilities = JSON.parse(fs.readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"));
  assert.ok(capabilities.permissions.includes("fs:allow-write-text-file"));
  assert.ok(!capabilities.permissions.some((entry) => typeof entry === "object" && /write/.test(entry.identifier) && JSON.stringify(entry).includes("**")));
  const commands = fs.readFileSync(new URL("../src/lib/commands.ts", import.meta.url), "utf8");
  assert.match(commands, /exportAlignmentDiagnostics[\s\S]*?await save\([\s\S]*?if \(path\) await writeTextFile\(path, content\)/);
});
