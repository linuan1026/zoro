# Offline sentence correspondence: zoro.bilingual.v1

Choose **Import bilingual sentence bundle (.json)** in a library PDF's existing
translation toolbar. Select one UTF-8 (or BOM UTF-16) JSON file, maximum 10 MiB.
The bundle includes the complete Markdown and alignment selectors; no manual database,
JSON editing inside Zoro, AI provider or network access is required. See the complete
synthetic example in `docs/examples/sentence-bundle.zoro.json`.

```json
{
  "schema": "zoro.bilingual.v1",
  "markdown": "<!-- zoro-page: 1 -->\nFulvestrant 會與雌二醇競爭結合 ERα。",
  "alignments": [{
    "id": "er-alpha-1",
    "source": [{"page": 1, "text": "Fulvestrant competes with estradiol to bind to ERα."}],
    "target": [{"section": 1, "text": "Fulvestrant 會與雌二醇競爭結合 ERα。"}]
  }]
}
```

## Fields and contract for ChatGPT-generated bundles

- `schema`: exactly `zoro.bilingual.v1`. `markdown`: full translated Markdown string,
  not an excerpt or a path. JSON escaping is required for newlines, quotes and LaTeX backslashes.
- `alignments`: up to 5,000 entries. Each `id` is unique, 1–80 ASCII letters, digits,
  hyphens or underscores. IDs are document-local, persistent and never inferred from array indices.
- `source`: 1–32 explicit PDF text fragments per entry. `page` is the physical PDF page
  number starting at 1, not printed pagination. `text` is exact extracted English text.
  Use multiple fragments for a cross-page sentence or separated columns; each has its own page selector.
- Optional `prefix` / `suffix` on every source or target quote specify immediately adjacent
  normalized visible context (whitespace around the quote boundary is ignored). Include
  enough context to distinguish repeated sentences; do not guess an occurrence number.
- Optional source `region`: `[left, top, width, height]` in 0–1 fractions of the displayed
  physical page bounding box, top-left origin, after PDF rotation. It limits text to the
  rectangle using text-fragment centers. Use accurate column/figure bounds to disambiguate
  repeated text. Region coordinates are stable under zoom but must match the PDF rotation.
- `target`: 1–32 Chinese rendered-text quotes. `section` is the corresponding
  `<!-- zoro-page: N -->` section number in the Markdown, or **null** for the preamble /
  an unanchored document. This is a Markdown section selector, not a promise of PDF pagination.
  `text` is visible text, not Markdown delimiters. Formatting nodes may be crossed; table
  cells / paragraphs contribute whitespace. Formula internals and image descriptions are excluded.
- Quotes: 1–10,000 characters, context up to 1,000 characters. Page/section numbers must
  be positive safe integers; regions must fit entirely inside the page and have positive size.
- One-to-one: one fragment on each side. One-to-many: one source, multiple targets.
  Many-to-one: multiple sources, one target. Many-to-many / cross-page: arrays on both sides.
  Put shared/overlapping correspondences in one group; conflicting IDs are deliberately not guessed.

ChatGPT should produce this schema as a downloadable `.json`, retain all Markdown,
insert increasing physical-page markers where known, and include only verified quotes.
Do not invent English text, PDF coordinates or context. Uncertain mappings should be omitted.
The synthetic example is not a real paper and is only aligned if its English text exists
in the selected PDF. It is not evidence of real-PDF GUI acceptance.

## Matching, interaction and limitations

`sentenceAlignment.ts` validates, normalizes and uniquely resolves TextQuote selectors.
NFKC handles ligatures / compatible subscripts and micro-sign equivalents; case and Greek
identity are retained. Whitespace is collapsed; soft hyphens and lower-case line-wrap
hyphenation are handled. A match requires exactly one candidate after context/region
filtering. Ambiguous, absent or conflicting selectors produce no highlight.

`useSentenceAlignment.ts` reads existing PDF.js text-layer DOM without rewriting it,
maps normalized offsets back to multiple Text/Range fragments and hit-tests their live
rectangles. Large column jumps introduce a barrier instead of concatenating unrelated
columns. DOM reading order is preserved rather than guessed. A PDF with missing, scrambled
or image-only text layers may remain unmapped; no OCR or approximate semantic matching is used.
Text layers sometimes split chemical names without recoverable geometry; not matching is
preferred over falsely claiming alignment. Zoom/lazy rendering/layout changes invalidate
cached ranges. Pointer events are rAF-coalesced; inactive tabs/version unmount dispose listeners.

Hover previews correspondence in either direction; click a sentence to pin, click it again
or use **Unpin sentence** to clear. Normal text selection is preserved. Search marks and
sentence spans are React-owned HAST render nodes after sanitization/KaTeX. The original
Markdown is not altered. English overlays are React-owned rectangles with pointer events
disabled. Yellow is translucent in both themes. Automatic right-pane scrolling defaults
off and has its own checkbox; sentence correspondence and page scroll synchronization are
independent controls. Turning on both auto-follow and page sync may also move the PDF via
the existing guarded page mapping, so leave one off when independent comparison is preferred.

## Persistence and compatibility

The UI converts the JSON bundle to the existing Markdown record: an internal leading
`<!-- zoro-alignment-v1 BASE64 -->` comment stores UTF-8 JSON selectors, followed by the
unchanged Markdown. Base64 prevents HTML comment breakout. The JSON import filename's
extension becomes `.md` in version management. The final persisted UTF-8 record must fit
the existing 10 MiB backend limit. `readAlignedDocument` removes the internal header before
rendering, validates it again on load, and disables bad metadata without discarding readable
Markdown. Do not author the internal comment manually; use the importable JSON format.

The existing Rust atomic JSON storage / UUID paths / source-PDF relation / corruption
isolation / delete semantics are unchanged. No database migration, new Rust command,
Tauri permission or broad filesystem capability is needed. Old Markdown/TXT remains usable.
External-link confirmation and image blocking are unchanged. Data is still under the
configured user data directory, not the installation directory; there are no new AI calls.
