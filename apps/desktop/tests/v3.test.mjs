import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import React, { act, createElement as element, useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { createInstance } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { I18nextProvider, useTranslation } from "react-i18next";

const temporary = [];
async function compile(source) {
  let output = ts.transpile(fs.readFileSync(source, "utf8"), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX });
  for (const match of output.matchAll(/from "(\.[^"]+)"/g)) output = output.replace(match[0], `from "${(await compile(new URL(`${match[1]}.ts`, source))).href}"`);
  const file = new URL(`./.v3-${randomUUID()}.mjs`, import.meta.url);
  fs.writeFileSync(file, output); temporary.push(file); return file;
}
const alignment = await import((await compile(new URL("../src/lib/sentenceAlignment.ts", import.meta.url))).href);
const { normalizeUiLanguage, initialOnboardingVisibility } = await import((await compile(new URL("../src/lib/uiPreferences.ts", import.meta.url))).href);
const { TranslationMarkdown } = await import((await compile(new URL("../src/components/reader/TranslationMarkdown.tsx", import.meta.url))).href);
const { pdfQuoteRanges, useSentenceAlignment } = await import((await compile(new URL("../src/components/reader/useSentenceAlignment.ts", import.meta.url))).href);
for (const file of temporary) fs.unlinkSync(file);
const { validatePairs, importBilingualBundle, readAlignedDocument, normalizedText, locateQuote } = alignment;
const english = "Fulvestrant competes with estradiol to bind to ERα.";
const chinese = "Fulvestrant 會與雌二醇競爭結合 ERα。";
const pair = { id: "er-alpha", source: [{ page: 1, text: english }], target: [{ section: null, text: chinese }] };
const defaultPairs = [pair];
const bundle = (pairs = [pair], markdown = chinese) => JSON.stringify({ schema: "zoro.bilingual.v1", markdown, alignments: pairs });

test("bundle roundtrip persists explicit many-to-many/cross-page quotes without changing Markdown or legacy documents", () => {
  const pairs = [{ ...pair, source: [...pair.source, { page: 2, text: "Continuation." }], target: [...pair.target, { section: 2, text: "續句。" }] }];
  const markdown = `${chinese}\n<!-- zoro-page: 2 -->\n續句。`;
  const content = importBilingualBundle(bundle(pairs, markdown));
  assert.deepEqual(readAlignedDocument(content), { markdown, pairs, invalid: false });
  assert.deepEqual(readAlignedDocument("old plain text"), { markdown: "old plain text", pairs: [], invalid: false });
  assert.equal(readAlignedDocument("<!-- zoro-alignment-v1 broken -->\nold text").invalid, true);
  assert.equal(readAlignedDocument("<!-- zoro-alignment-v1 broken -->\nold text").markdown, "old text");
});

test("invalid IDs, duplicates, missing text, pages, sections, regions, schema, oversized and incomplete data fail closed", () => {
	assert.throws(() => validatePairs([{ ...pair, id: 123 }]));
  for (const value of [null, {}, [pair, pair], [{ ...pair, id: '<script>' }], [{ ...pair, source: [] }], [{ ...pair, source: [{ page: 0, text: "x" }] }], [{ ...pair, source: [{ page: 1, text: "x", region: [0.5, 0, 0.7, 1] }] }], [{ ...pair, target: [{ text: "x" }] }], [{ ...pair, target: [{ section: 1, text: "" }] }]]) assert.throws(() => validatePairs(value));
  for (const value of ['{', '{}', JSON.stringify({ schema: "wrong", markdown: chinese, alignments: [] }), bundle([pair], " "), bundle([pair], "x".repeat(10 * 1024 * 1024 + 1))]) assert.throws(() => importBilingualBundle(value));
});

test("normalization retains chemical symbols, matches across line hyphenation and ligatures, and rejects ambiguous repetitions", () => {
	assert.deepEqual(locateQuote("🧪 α = 10", { text: "α" }), { start: 3, end: 4 });
  assert.equal(normalizedText("Fulves-\ntrant ﬁ α µ H₂O ≤ 10").text, "Fulvestrant fi α μ H2O ≤ 10");
  const text = "Intro. Fulves-\ntrant competes with estradiol to bind to ERα.";
  assert.equal(text.slice(locateQuote(text, pair.source[0]).start, locateQuote(text, pair.source[0]).end), "Fulves-\ntrant competes with estradiol to bind to ERα.");
  assert.equal(locateQuote(`${english} ${english}`, pair.source[0]), null);
  assert.notEqual(locateQuote(`A. ${english} B. ${english}`, { text: english, prefix: "B." }), null);
  assert.equal(locateQuote("ERβ", { text: "ERα" }), null);
});

test("React sentence marks cover multiple formatting nodes, tables, one-to-many targets, and coexist with search/KaTeX safely", () => {
	const spoof = renderToStaticMarkup(element(TranslationMarkdown, { text: '<span data-alignment="er-alpha">wrong</span>', pairs: [pair], activeId: pair.id }));
	assert.doesNotMatch(spoof, /<[^>]+data-alignment=/);
  const pairs = [{ id: "table", source: pair.source, target: [{ section: 1, text: "雌二醇與 ERα。" }, { section: 1, text: "第二句。" }] }];
  const text = "| 藥物 | 說明 |\n| --- | --- |\n| Fulvestrant | **雌二醇**與 ERα。 |\n\n第二句。 $E=mc^2$";
  const render = (activeId, section = 1) => renderToStaticMarkup(element(TranslationMarkdown, { text, pairs, section, activeId, query: "ERα" }));
  const marked = render("table");
  assert.match(marked, /data-alignment="table"/); assert.match(marked, /data-active-alignment="table"/); assert.match(marked, /background-color: rgba/); assert.match(marked, /data-search="true"/); assert.match(marked, /<table>/); assert.match(marked, /class="katex"/);
  assert.doesNotMatch(render(null), /<style>/);
  assert.doesNotMatch(render("table", 2), /<[^>]+data-alignment=/);
  assert.doesNotMatch(renderToStaticMarkup(element(TranslationMarkdown, { text: '<script>alert(1)</script>\n\n'+chinese, pairs: [pair], activeId: pair.id })), /<script/);
  assert.doesNotMatch(renderToStaticMarkup(element(TranslationMarkdown, { text: `${chinese} ${chinese}`, pairs: [pair], activeId: pair.id })), /<[^>]+data-alignment=/);
});

const dom = new JSDOM('<div id="test-root"></div>', { url: "https://zoro.invalid" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, NodeFilter: dom.window.NodeFilter, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
let scale = 1;
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  const [left, top, width, height] = (this.dataset.rect ?? "0,0,1000,800").split(",").map(Number);
  return { left: left * scale, top: top * scale, width: width * scale, height: height * scale, right: (left + width) * scale, bottom: (top + height) * scale, x: left * scale, y: top * scale, toJSON() { return {}; } };
};
dom.window.Range.prototype.getBoundingClientRect = function () {
  const parent = this.startContainer.parentElement;
  const rect = parent.getBoundingClientRect();
  const length = this.startContainer.textContent.length || 1;
  const left = rect.left + rect.width * this.startOffset / length;
  const right = rect.left + rect.width * this.endOffset / length;
  return { ...rect, left, right, width: right - left };
};
dom.window.Range.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };

test("PDF range locator crosses multiple spans and lines, supports regions for duplicate two-column text, and recalculates zoom", () => {
  const page = document.createElement("div"); page.dataset.rect = "0,0,1000,800";
  page.innerHTML = '<div class="textLayer"><span data-rect="10,10,50,10">Fulves</span><span data-rect="60,10,50,10">trant competes</span><span data-rect="10,30,200,10"> with estradiol to bind to ERα.</span></div>';
  assert.equal(pdfQuoteRanges(page, pair.source[0]).length, 3);
  scale = 2; assert.equal(pdfQuoteRanges(page, pair.source[0]).length, 3); scale = 1;
  page.innerHTML = `<div class="textLayer"><span data-rect="10,10,300,10">${english}</span><span data-rect="600,10,300,10">${english}</span></div>`;
  assert.equal(pdfQuoteRanges(page, pair.source[0]).length, 0);
  assert.equal(pdfQuoteRanges(page, { ...pair.source[0], region: [0.5, 0, 0.5, 1] }).length, 1);
});

test("mounted React hover, reverse hover, rapid moves, pin/unpin, zoom, inactive tabs, version switch and cleanup", async () => {
  const root = createRoot(document.getElementById("test-root"));
  function Harness({ enabled = true, isActive = true, pairs = defaultPairs }) {
    const rootRef = useRef(null), textRef = useRef(null);
    const [hover, setHover] = useState(null), [pin, setPin] = useState(null);
    const onPin = useCallback((id) => setPin((previous) => previous === id ? null : id), []);
    const activeId = enabled ? hover ?? pin : null;
    const boxes = useSentenceAlignment({ rootRef, textRef, pairs, enabled, isActive, activeId, onHover: setHover, onPin });
    return element("div", { ref: rootRef }, element("div", { "data-original": true }, element("div", { className: "page", "data-page-number": 1 }, element("div", { className: "textLayer" }, element("span", { id: "source", "data-rect": "10,10,300,20" }, english)))), element("div", { ref: textRef, id: "target" }, element(TranslationMarkdown, { text: chinese, pairs, activeId })), element("output", { id: "active" }, `${activeId ?? ""}:${pin ?? ""}:${boxes.length}`));
  }
  const render = async (props = {}, key = "v1") => { await act(async () => root.render(element(Harness, { ...props, key }))); };
  const dispatch = async (target, type, x = 20, y = 15) => { await act(async () => { target.dispatchEvent(new window.MouseEvent(type, { bubbles: type !== "pointerleave", clientX: x, clientY: y })); await new Promise((resolve) => setTimeout(resolve, 8)); }); };
  await render();
  const originalTarget = document.querySelector('[data-alignment]');
  await dispatch(document.getElementById("source"), "pointermove");
  assert.equal(document.querySelector('[data-alignment]'), originalTarget);
  assert.match(document.getElementById("active").textContent, /^er-alpha::1$/);
  assert.equal(window.getComputedStyle(document.querySelector('[data-alignment]')).backgroundColor, "rgba(250, 204, 21, 0.32)");
  await dispatch(document.getElementById("source"), "click");
  await dispatch(document.querySelector("[data-original]"), "pointerleave");
  assert.match(document.getElementById("active").textContent, /^er-alpha:er-alpha:1$/);
  await dispatch(document.getElementById("source"), "click");
  assert.match(document.getElementById("active").textContent, /^::0$/);
  await dispatch(document.querySelector("[data-alignment]"), "pointermove");
  assert.match(document.getElementById("active").textContent, /^er-alpha/);
  await dispatch(document.getElementById("target"), "pointerleave");
  await act(async () => {
    const source = document.getElementById("source");
    source.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 15 }));
    source.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientX: 900, clientY: 700 }));
    await new Promise((resolve) => setTimeout(resolve, 8));
  });
  assert.equal(document.getElementById("active").textContent, "::0");
  scale = 2; await dispatch(document.getElementById("source"), "pointermove", 40, 30); scale = 1;
  assert.match(document.getElementById("active").textContent, /^er-alpha/);
  await render({ isActive: false }); assert.equal(document.getElementById("active").textContent, "::0");
  await render({}, "v2"); assert.equal(document.getElementById("active").textContent, "::0");
  await render({ pairs: [] }, "old"); await dispatch(document.getElementById("source"), "pointermove"); assert.equal(document.getElementById("active").textContent, "::0");
  await act(async () => root.unmount());
});

function flattened(object, prefix = "") {
  return Object.fromEntries(Object.entries(object).flatMap(([key, value]) => typeof value === "string" ? [[`${prefix}${key}`, value]] : Object.entries(flattened(value, `${prefix}${key}.`))));
}
const resource = (locale) => JSON.parse(fs.readFileSync(new URL(`../src/locales/${locale}.json`, import.meta.url), "utf8"));
test("all 1151 zh-TW keys, plural suffixes and interpolation names match English; Taiwan vocabulary and no common simplified remnants", () => {
	const example = JSON.parse(fs.readFileSync(new URL("../../../docs/examples/sentence-bundle.zoro.json", import.meta.url), "utf8"));
	assert.equal(readAlignedDocument(importBilingualBundle(JSON.stringify(example))).pairs.length, 5);
  const en = flattened(resource("en")), tw = flattened(resource("zh-TW"));
  assert.deepEqual(Object.keys(tw).sort(), Object.keys(en).sort());
  for (const [key, value] of Object.entries(en)) assert.deepEqual((tw[key].match(/{{[^}]+}}/g) ?? []).sort(), (value.match(/{{[^}]+}}/g) ?? []).sort(), key);
  assert.equal(tw["topBar.addPaper"], "新增論文"); assert.equal(tw["common.settings"], "設定"); assert.equal(tw["sidebar.noCollections"], "尚無集合"); assert.match(tw["topBar.searchPlaceholder"], /搜尋文獻庫/);
  assert.doesNotMatch(Object.values(tw).join("\n"), /添加|搜索|设置|暂无|文件夹|导入|下载|默认|鼠标|视频|保存|剪贴板|软件|数据库|服务器|用户|文库|关闭|启用|错误/);
});

test("Taiwan system language is detected without overriding explicit preferences; switching locale rerenders actual React controls", async () => {
  const i18n = createInstance();
  window.localStorage.removeItem("zoro-ui-language");
  Object.defineProperty(window.navigator, "languages", { configurable: true, value: ["zh-TW"] });
  Object.defineProperty(window.navigator, "language", { configurable: true, value: "zh-TW" });
  await i18n.use(LanguageDetector).init({ resources: { "zh-TW": { translation: resource("zh-TW") }, "zh-CN": { translation: resource("zh-CN") }, en: { translation: resource("en") } }, fallbackLng: "en", detection: { order: ["localStorage", "navigator"], lookupLocalStorage: "zoro-ui-language", caches: ["localStorage"], convertDetectedLanguage: normalizeUiLanguage } });
  assert.equal(i18n.language, "zh-TW");
  const root = createRoot(document.getElementById("test-root"));
  function Label() { const { t } = useTranslation(); return element("span", null, t("topBar.addPaper")); }
  await act(async () => root.render(element(I18nextProvider, { i18n }, element(Label))));
  assert.equal(document.getElementById("test-root").textContent, "新增論文");
  await act(async () => { await i18n.changeLanguage("en"); });
  assert.equal(document.getElementById("test-root").textContent, resource("en").topBar.addPaper);
  await act(async () => root.unmount());
  const next = createInstance();
  await next.use(LanguageDetector).init({ resources: { en: { translation: {} }, "zh-TW": { translation: {} } }, fallbackLng: "en", detection: { order: ["localStorage", "navigator"], lookupLocalStorage: "zoro-ui-language", convertDetectedLanguage: normalizeUiLanguage } });
  assert.equal(next.language, "en");
  assert.equal(normalizeUiLanguage("zh-Hant-TW"), "zh-TW"); assert.equal(normalizeUiLanguage("zh-CN"), "zh-CN");
  const source = fs.readFileSync(new URL("../src/lib/i18n.ts", import.meta.url), "utf8");
  assert.match(source, /"zh-TW":\s*\{ translation: \{ \.\.\.zhTW/);
});

test("fresh, returning and second startup never auto-open onboarding; normal initialization and manual help remain intact", () => {
  for (const saved of [null, "false", "true"]) {
    window.localStorage.clear(); if (saved !== null) window.localStorage.setItem("zoro-onboarding-completed", saved);
    assert.equal(initialOnboardingVisibility(), false); assert.equal(initialOnboardingVisibility(), false);
  }
  const store = fs.readFileSync(new URL("../src/stores/uiStore.ts", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(store, /showOnboarding: initialOnboardingVisibility\(\)/);
  assert.match(store, /restartOnboarding:[\s\S]*?showOnboarding: true/);
  for (const initialization of ["fetchPapers();", "fetchCollections();", "fetchTags();", "fetchAiConfig();"]) assert.ok(app.includes(initialization));
});
