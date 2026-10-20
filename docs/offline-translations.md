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
before math rendering; KaTeX trust is disabled. Images and clickable links are
disabled to prevent remote requests and local-file navigation. TXT is rendered
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
the last anchor synchronization uses that anchor's start. Missing PDF pages and
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
