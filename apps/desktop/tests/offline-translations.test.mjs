import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function importSource(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const compiled = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX });
  const { writeFile, unlink } = await import("node:fs/promises");
  const { randomUUID } = await import("node:crypto");
  const file = new URL(`./.offline-${randomUUID()}.mjs`, import.meta.url);
  const dependencies = [];
  let output = compiled;
  for (const match of compiled.matchAll(/from "(\.[^\"]+)"/g)) {
    const dependency = new URL(`${match[1]}.ts`, new URL(relativePath, import.meta.url));
    const dependencyFile = new URL(`./.offline-${randomUUID()}.mjs`, import.meta.url);
    await writeFile(dependencyFile, ts.transpile(readFileSync(dependency, "utf8"), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }));
    output = output.replace(match[0], `from "${dependencyFile.href}"`);
    dependencies.push(dependencyFile);
  }
  await writeFile(file, output);
  try { return await import(file.href); }
  finally { await Promise.all([file, ...dependencies].map((path) => unlink(path))); }
}

const { splitTranslation, mapTranslationOffset, decodeTranslation } = await importSource("../src/lib/offlineTranslation.ts");
const { TranslationMarkdown } = await importSource("../src/components/reader/TranslationMarkdown.tsx");

test("page anchors preserve preamble and ignore fenced, duplicate and decreasing markers", () => {
  const sections = splitTranslation("前言\r\n<!-- zoro-page: 2 -->\r\n中文 α\n```md\n<!-- zoro-page: 9 -->\n```\n<!-- zoro-page: 2 -->\n<!-- zoro-page: 1 -->\n<!-- zoro-page: 5 -->\n末頁");
  assert.deepEqual(sections.map((section) => section.page), [null, 2, 5]);
  assert.match(sections[1].text, /zoro-page: 9/);
  assert.match(sections[1].text, /中文 α/);
  assert.deepEqual(splitTranslation("普通文字 β ≤ ≥"), [{ page: null, text: "普通文字 β ≤ ≥" }]);
});

test("unequal PDF and text lengths interpolate reversibly between real anchors", () => {
  const points = [{ pdf: 100, text: 0 }, { pdf: 900, text: 2000 }, { pdf: 1800, text: 2500 }];
  assert.equal(mapTranslationOffset(points, 500, "pdf"), 1000);
  assert.equal(mapTranslationOffset(points, 1000, "text"), 500);
  assert.equal(mapTranslationOffset(points, 900, "pdf"), 2000);
  assert.equal(mapTranslationOffset(points, 0, "pdf"), null);
  assert.equal(mapTranslationOffset(points, 3000, "text"), null);
  assert.equal(mapTranslationOffset([], 0, "pdf"), null);
});

test("strict UTF-8 and BOM UTF-16 preserve Chinese and scientific symbols", () => {
  const text = "繁體中文 α β μ Δ ≤ ≥ 化合物 [12]";
  assert.equal(decodeTranslation(new TextEncoder().encode(text)), text);
  assert.equal(decodeTranslation(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)])), text);
  assert.equal(decodeTranslation(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")])), text);
  const bigEndian = Buffer.from(text, "utf16le").swap16();
  assert.equal(decodeTranslation(Buffer.concat([Buffer.from([0xfe, 0xff]), bigEndian])), text);
  for (const bytes of [Buffer.from([0xff]), Buffer.from("\0binary"), Buffer.from("  "), Buffer.alloc(10 * 1024 * 1024 + 1)]) assert.throws(() => decodeTranslation(bytes));
});

test("actual Markdown component renders tables, math, headings, emphasis and scientific notation", () => {
  const html = renderToStaticMarkup(createElement(TranslationMarkdown, { text: "# 中文 α β μ Δ ≤ ≥\n\n**粗體** *斜體* H<sub>2</sub>O x<sup>2</sup> [12]\n\n- 清單\n\n| 化合物 | 濃度 |\n| --- | --- |\n| NaCl | 10 μM |\n\n$E=mc^2$\n\n$$\n\\frac{\\alpha}{\\beta}\n$$" }));
  for (const pattern of [/<h1>/, /<strong>粗體<\/strong>/, /<em>斜體<\/em>/, /<sub>2<\/sub>/, /<sup>2<\/sup>/, /<table>/, /<li>/, /katex-display/, /class="katex"/, /NaCl/, /α β μ Δ ≤ ≥/, /\[12\]/]) assert.match(html, pattern);
});

test("untrusted Markdown cannot execute scripts, fetch images or navigate local paths", () => {
  const html = renderToStaticMarkup(createElement(TranslationMarkdown, { text: '<script>alert(1)</script>\n\n<img src="file:///C:/secret" onerror="alert(2)">\n\n![remote](https://attacker.invalid/track)\n\n<iframe src="https://attacker.invalid"></iframe>\n\n[local](file:///C:/secret) [bad](javascript:alert)\n\n<div onclick="alert(3)" style="background:url(https://attacker.invalid)">safe</div>\n\n$\\href{https://attacker.invalid}{x}$' }));
  assert.doesNotMatch(html, /<script|<img|<iframe|onclick=|onerror=|href=|src=|style="background/i);
  assert.match(html, /safe/);
});
