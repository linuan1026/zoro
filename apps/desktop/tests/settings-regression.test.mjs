import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual loader in isolation; no WebView or React test runner needed.
const source = readFileSync(new URL("../src/routes/settings.tsx", import.meta.url), "utf8");
const loader = source.split("const loadAiConfig = useCallback(")[1].split("\n\t}, []);")[0] + "\n\t}";
const compiled = ts.transpile(`(${loader})`, { target: ts.ScriptTarget.ES2022 });
function harness() {
  const values = {};
  let config = {
    nativeLang: "zh-TW", translationPrompts: {}, providers: [],
    pdfTranslation: { enabled: false },
  };
  const context = {
    aiConfigLoadedRef: { current: false }, pdfConfigLoadedRef: { current: false },
    commands: { getAiConfig: async () => config },
    logger: { error: (...args) => { throw new Error(JSON.stringify(args)); } },
  };
  for (const name of loader.match(/\bset[A-Z]\w+/g)) {
    context[name] = (value) => { values[name] = value; };
  }
  const load = vm.runInNewContext(compiled, context);
  return { load, values, context, setConfig: (value) => { config = value; } };
}

test("AI refresh during PDF debounce preserves enabled draft and custom zh-TW", async () => {
  const { load, values, context } = harness();
  await load();
  assert.equal(values.setPdfEnabled, false);
  assert.equal(values.setAiNativeLang, "__custom__");
  assert.equal(values.setCustomNativeLang, "zh-TW");
  context.setPdfEnabled(true); // User checks the box before the debounce fires.
  await load(); // AI save returns the old persisted PDF value.
  assert.equal(values.setPdfEnabled, true);
  assert.equal(values.setCustomNativeLang, "zh-TW");
});

test("overlapping initial reads hydrate only once", async () => {
  const { load, values, context } = harness();
  let resolve;
  context.commands.getAiConfig = () => new Promise((r) => { resolve = r; });
  const pending = load();
  context.commands.getAiConfig = async () => ({ nativeLang: "zh-TW", translationPrompts: {}, pdfTranslation: { enabled: true } });
  await load();
  resolve({ pdfTranslation: { enabled: false } });
  await pending;
  assert.equal(values.setPdfEnabled, true);
});

function pdfSaveHarness(updateAiConfig) {
  const handler = source.split("const handlePdfTranslationSave = ")[1].split("\n\t};")[0] + "\n\t}";
  const values = { key: "old-key" };
  const context = {
    pdfEnabled: true, pdfBabeldocCmd: "babeldoc", pdfUseAiConfig: true,
    pdfCustomApiKey: "old-key", pdfCustomBaseUrl: "", pdfCustomModel: "",
    pdfQps: 4, pdfExtraArgs: "--no-dual",
    commands: { updateAiConfig },
    setPdfSaving: (value) => { values.saving = value; },
    setPdfCustomApiKey: (update) => { values.key = update(values.key); },
    setPdfTestResult: (value) => { values.result = value; },
    loadAiConfig: async () => {}, fetchAiConfig: async () => {},
    logger: { error: () => {} },
  };
  const save = vm.runInNewContext(ts.transpile(`(${handler})`, { target: ts.ScriptTarget.ES2022 }), context);
  return { save, values };
}

test("PDF save sends enablement and preserves a newly typed key while IPC is pending", async () => {
  let resolve;
  let input;
  const { save, values } = pdfSaveHarness((value) => {
    input = value;
    return new Promise((r) => { resolve = r; });
  });
  const pending = save();
  assert.equal(input.pdfTranslation.enabled, true);
  assert.equal(input.pdfTranslation.customApiKey, "old-key");
  values.key = "new-key";
  resolve();
  await pending;
  assert.equal(values.key, "new-key");
  assert.equal(values.saving, false);
});

test("PDF write failure displays the error and retains the key for retry", async () => {
  const { save, values } = pdfSaveHarness(async () => { throw new Error("Access denied"); });
  await save();
  assert.equal(values.result.ok, false);
  assert.match(values.result.msg, /Access denied/);
  assert.equal(values.key, "old-key");
  assert.equal(values.saving, false);
});
