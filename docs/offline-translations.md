# Offline bilingual reading

Open a library PDF and choose **Import translation** in the reader toolbar. Select
a `.md` or `.txt` translation created outside Zoro. The document opens beside the
original PDF immediately. No translation provider, BabelDOC, subscription, API key,
or network connection is used by this feature.

The version selector reopens saved translations, switches versions, or returns to
the original PDF. Import again to add another version, including files with the
same name. Delete translation removes only the selected translation after confirmation.
The existing translated-PDF button still opens the original PDF + translated PDF mode.

Markdown supports GFM tables, headings, emphasis, lists, Unicode, subscript and
superscript HTML, and KaTeX `$inline$` / `$$display$$` math. Raw HTML is sanitized
before math rendering; KaTeX trust is disabled. Images remain blocked, with an alt-text
placeholder, to prevent tracking and arbitrary local-file reads. Valid absolute HTTP(S)
links are explicit buttons: native confirmation precedes opening the external browser.
Credentials, whitespace, control characters, backslashes and all other URL schemes are rejected.
No remote resource is fetched just by rendering. Opening a link is optional and requires a network connection. TXT is rendered
as selectable plain text. Supported encodings are strict UTF-8 (with or without
BOM) and UTF-16 LE/BE with BOM. Empty, binary and over-10-MiB documents are rejected.
HTML file import is not supported.

Use the divider to resize panes; the ratio is retained locally. The right pane has
its own font size, search with previous/next matches, and scroll position.

## Page mapping

Place markers on their own lines outside fenced code blocks, in increasing order:

```markdown
<!-- zoro-page: 1 -->
# 第一頁
原文第一頁的完整譯文。

<!-- zoro-page: 2 -->
原文第二頁的完整譯文。
```

These are **physical PDF page numbers**, starting at 1, not printed page labels.
Synchronization starts disabled. With markers, enable Sync scrolling for both
directions. Exact anchor starts are used; positions between known anchors are
interpolated approximately. Before the first anchor there is no mapping, and after
the last anchor synchronization interpolates approximately to the two actual scroll-range
ends. Even with a single anchor, only its page start is exact; the entire tail is approximate.
The toolbar reports exact page start, approximate position, or no available mapping.
Missing PDF pages and
out-of-range markers cannot be matched. Duplicate or decreasing markers do not
create new anchors. Without markers the document remains independently scrollable
and synchronization is disabled. Use the page-anchor selector, the current-PDF-page
button, or a translation section's Original PDF button for explicit jumps, even
when synchronization is off.

## Storage and integration

Tauri commands `list_offline_translations`, `import_offline_translation` and
`delete_offline_translation` are exposed through `src/lib/commands.ts`. Documents
are stored as individual UUID-named JSON files in
`<Zoro data directory>/offline-translations/<paper UUID>/`. Each record includes
the source PDF filename, original document name, format, content, and import time.
The default data directory is `%USERPROFILE%/.zoro` on Windows; configured data
directories are respected. No database migration is required. Back up this folder
with the rest of the data directory. These documents are local and are not
registered as WebDAV attachments. Version selection and pane ratio are local UI
preferences; reopening a PDF restores its last selected available translation.
Font size and synchronization reset when switching translation versions.

The original `PdfAnnotationViewer` is reused for search, selection, zoom and
annotations. `translationStore` and the BabelDOC commands are unchanged. Imports
use Tauri's native file dialog and the dialog-scoped file-read permission; no
unrestricted filesystem permission is added. Backend write/delete paths use
validated UUIDs under the application's data directory and never target source PDFs.

Select **繁體中文** in appearance settings for Traditional Chinese offline-reader
controls. Other application controls currently inherit the existing Chinese locale.

## Reliability and limitations (v2)

`list_documents` isolates unreadable/invalid JSON records without deleting or overwriting
them, and logs only filenames, error category and location, never document contents.
Missing storage directories return an empty list; other directory/enumeration errors propagate.
Valid records remain filtered by source PDF and sorted newest first.

`mapTranslationPosition` rejects nonfinite, reversed and inaccessible geometry and clamps
both scroll ranges. `bindTranslationScroll` suppresses programmatic echo events and cancels
pending frames on disposal. Resize/mutation observers recalculate layout after font, pane,
window, PDF zoom and delayed-page changes; tab deactivation/version replacement cleans up.

Search marks are HAST nodes produced after sanitization and KaTeX, then rendered by React;
TXT marks are React elements. DOM access only reads marks and scrolls the container. Searches
are literal and case-insensitive, within each rendered text node. Formulas, image descriptions
and matches spanning formatting boundaries are excluded (also explained in the search tooltip).
The reader keys the component by translation ID, resetting search state on version switches.

Controlled image attachments are deferred: they require a persisted resource manifest,
path containment/symlink protection, raster signatures/MIME/size validation and lifecycle cleanup.
Do not enable unrestricted HTML, remote images or arbitrary local paths as a workaround.
