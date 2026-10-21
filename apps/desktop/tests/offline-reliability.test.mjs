import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const files = [];
async function load(path) {
  const source = new URL(path, import.meta.url);
  let compiled = ts.transpile(readFileSync(source, "utf8"), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX });
  for (const match of compiled.matchAll(/from "(\.[^\"]+)"/g)) {
    const dependency = await compile(new URL(`${match[1]}.ts`, source));
    compiled = compiled.replace(match[0], `from "${dependency.href}"`);
  }
  const file = new URL(`./.reliability-${randomUUID()}.mjs`, import.meta.url);
  files.push(file); writeFileSync(file, compiled);
  return import(file.href);
}
async function compile(source) {
  const file = new URL(`./.reliability-${randomUUID()}.mjs`, import.meta.url);
  let compiled = ts.transpile(readFileSync(source, "utf8"), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 });
  for (const match of compiled.matchAll(/from "(\.[^\"]+)"/g)) compiled = compiled.replace(match[0], `from "${(await compile(new URL(`${match[1]}.ts`, source))).href}"`);
  files.push(file); writeFileSync(file, compiled); return file;
}
const mapping = await load("../src/lib/offlineTranslation.ts");
const { bindTranslationScroll } = await load("../src/lib/translationScroll.ts");
const { searchParts, safeTranslationUrl, openConfirmedTranslationUrl } = await load("../src/lib/translationContent.ts");
const { TranslationMarkdown, TranslationPlainText } = await load("../src/components/reader/TranslationMarkdown.tsx");
for (const file of files) unlinkSync(file);
const { mapTranslationPosition: map, splitTranslation } = mapping;
const bounds = { pdf: 1000, text: 3000 };

test("zero, single and sparse anchors distinguish exact, interpolated and unmapped positions", () => {
  assert.equal(map([], 100, "pdf", bounds), null);
  const single = [{ pdf: 200, text: 400 }];
  assert.equal(map(single, 0, "pdf", bounds), null);
  assert.deepEqual(map(single, 200, "pdf", bounds), { offset: 400, precision: "exact" });
  assert.deepEqual(map(single, 600, "pdf", bounds), { offset: 1700, precision: "approximate" });
  assert.deepEqual(map(single, 1700, "text", bounds), { offset: 600, precision: "approximate" });
  const points = [...single, { pdf: 500, text: 1000 }, { pdf: 800, text: 2400 }];
  assert.deepEqual(map(points.slice(0, 2), 350, "pdf", bounds), { offset: 700, precision: "approximate" });
  assert.equal(map(points, 650, "pdf", bounds).offset, 1700);
  assert.deepEqual(map(points, 900, "pdf", bounds), { offset: 2700, precision: "approximate" });
  assert.equal(map(points, 2700, "text", bounds).offset, 900);
});

test("mapping clamps both scroll ranges and rejects degenerate, nonfinite and inverted geometry", () => {
  const points = [{ pdf: 0, text: 0 }, { pdf: 400, text: 600 }, { pdf: 400, text: 700 }, { pdf: 300, text: 800 }, { pdf: NaN, text: 10 }, { pdf: 800, text: 500 }, { pdf: 1500, text: 2000 }];
  assert.equal(map(points, -100, "pdf", bounds).offset, 0);
  assert.equal(map(points, 2000, "pdf", bounds).offset, 3000);
  assert.equal(map(points, 4000, "text", bounds).offset, 1000);
  assert.equal(map(points, NaN, "pdf", bounds), null);
  assert.equal(map(points, 100, "pdf", { pdf: 0, text: -1 }), null);
  assert.deepEqual(map([{ pdf: 0, text: 0 }], 10, "pdf", { pdf: 0, text: 0 }), { offset: 0, precision: "exact" });
  assert.deepEqual(map([{ pdf: 1000, text: 100 }], 500, "text", bounds), { offset: 1000, precision: "approximate" });
});

test("invalid, duplicate, reversed and fenced anchors do not create false page correspondence", () => {
  const text = "intro\n<!-- zoro-page: 0 -->\n<!-- zoro-page: -2 -->\n<!-- zoro-page: 99999999999999999999 -->\n<!-- zoro-page: 2 -->\nA\n<!-- zoro-page: 2 -->\n<!-- zoro-page: 1 -->\n~~~md\n<!-- zoro-page: 3 -->\n~~~\n<!-- zoro-page: 7 -->\nB";
  assert.deepEqual(splitTranslation(text).map((section) => section.page), [null, 2, 7]);
});

test("bidirectional scroll echo is suppressed, geometry refreshes, and disposal cancels pending work", () => {
  let nextId = 0;
  const tasks = new Map();
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => { tasks.set(++nextId, callback); return nextId; };
  globalThis.cancelAnimationFrame = (id) => tasks.delete(id);
  const flush = () => {
    let count = 0;
    while (tasks.size) { assert.ok(++count < 5, "scroll feedback loop"); const [id, callback] = tasks.entries().next().value; tasks.delete(id); callback(); }
  };
  class Pane extends EventTarget {
    value = 0; scrollHeight; clientHeight = 100; writes = 0;
    constructor(maximum) { super(); this.scrollHeight = maximum + 100; }
    get scrollTop() { return this.value; }
    set scrollTop(value) { this.value = Math.min(this.scrollHeight - this.clientHeight, Math.max(0, value)); this.writes++; this.dispatchEvent(new Event("scroll")); }
  }
  try {
    const pdf = new Pane(1000), text = new Pane(3000);
    let points = [];
    let precision;
    const binding = bindTranslationScroll(pdf, text, () => points, (value) => { precision = value; });
    flush(); assert.equal(precision, "unmapped"); assert.equal(text.writes, 0);
    points = [{ pdf: 200, text: 400 }];
    pdf.scrollTop = 600; flush(); assert.equal(text.scrollTop, 1700);
    text.dispatchEvent(new Event("scroll")); flush(); assert.equal(pdf.scrollTop, 600);
    text.scrollTop = 2350; flush(); assert.equal(pdf.scrollTop, 800);
    pdf.dispatchEvent(new Event("scroll")); flush(); assert.equal(text.scrollTop, 2350);
    text.scrollHeight = 4000; binding.refresh(); flush(); assert.ok(pdf.scrollTop < 800);
    points = [{ pdf: 200, text: 600 }]; binding.refresh(); flush(); assert.equal(precision, "approximate");
    pdf.scrollTop = 300; binding.dispose(); flush(); const before = text.writes;
    pdf.scrollTop = 900; binding.refresh(); flush(); assert.equal(text.writes, before);
  } finally { globalThis.requestAnimationFrame = previousRequest; globalThis.cancelAnimationFrame = previousCancel; }
});

const render = (text, query = "", component = TranslationMarkdown) => renderToStaticMarkup(createElement(component, { text, query }));
const count = (html) => (html.match(/data-search="true"/g) ?? []).length;
test("React-owned Markdown highlights Chinese, case-insensitive English and literal special characters", () => {
  assert.equal(count(render("中文 中文", "中文")), 2);
  assert.equal(count(render("Alpha ALPHA alpha", "aLpHa")), 3);
  assert.equal(count(render("a+b [12] a+b", "a+b")), 2);
  assert.equal(count(render("word", "missing")), 0);
  assert.equal(count(render("word", "")), 0);
  assert.deepEqual(searchParts("a.* a.*", "a.*").filter((part) => part.match).map((part) => part.text), ["a.*", "a.*"]);
  assert.equal(count(render("中文 中文", "中文", TranslationPlainText)), 2);
});

test("table structure and KaTeX survive search, clearing, format changes and version replacement", () => {
  const text = "| Name | 值 |\n| --- | --- |\n| Alpha | 中文 |\n\n$\\alpha + 1$\n\n**Alpha**";
  for (let index = 0; index < 4; index++) {
    const html = render(text, "Alpha");
    assert.equal(count(html), 2); assert.match(html, /<table>/); assert.match(html, /class="katex"/);
    assert.doesNotMatch(html, /class="katex"[\s\S]*?<mark[\s\S]*?<\/annotation>/);
    assert.equal(count(render(text, "")), 0);
    assert.equal(count(render("new version", "Alpha")), 0);
    assert.equal(count(render("new TXT", "TXT", TranslationPlainText)), 1);
  }
});

test("safe links are explicit external-browser actions, unsafe URLs and all images stay inert", () => {
  for (const value of ["javascript:alert(1)", "file:///C:/secret", "data:text/html,x", "//example.org", "https://user:pass@example.org", "https://example.org\\evil", "https://example.org\npath", "http://"]) assert.equal(safeTranslationUrl(value), null);
  assert.equal(safeTranslationUrl("https://doi.org/10.1/ABC"), "https://doi.org/10.1/ABC");
  assert.equal(safeTranslationUrl("http://example.org"), "http://example.org/");
  const html = render('[DOI](https://doi.org/10.1/x) [bad](javascript:alert) [local](file:///secret) ![figure](https://attacker.invalid/tracker)\n\n<img src="file:///secret" onerror="bad()"><script>alert(1)</script>', "DOI");
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<img|<script|src=|href=|onerror=/i);
  assert.match(html, /offline.imageBlocked/);
});

test("external opener validates before confirmation and opens only after explicit acceptance", async () => {
  const calls = [];
  const open = async (url) => { calls.push(url); };
  await assert.rejects(openConfirmedTranslationUrl("file:///secret", async () => { throw new Error("must not prompt"); }, open), /Invalid external URL/);
  await openConfirmedTranslationUrl("https://doi.org/10.1/x", async () => false, open);
  assert.deepEqual(calls, []);
  await openConfirmedTranslationUrl("https://doi.org/10.1/x", async () => true, open);
  assert.deepEqual(calls, ["https://doi.org/10.1/x"]);
});
