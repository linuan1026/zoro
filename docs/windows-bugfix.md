# Windows settings fixes

The settings editor hydrates its AI/PDF drafts once. Subsequent `loadAiConfig()` calls refresh persisted metadata only, so an AI auto-save cannot overwrite PDF edits during their 1500 ms debounce. Prompt reset explicitly replaces only prompt fields. Failed PDF saves retain the draft and display the backend error. AI config updates commit their in-memory copy only after writing config.toml succeeds. No library data or translation language mappings are changed; custom `zh-TW` remains supported.

Native select controls declare the active CSS color scheme and explicit option/optgroup foreground and background colors for WebView2.

Run `node --test apps/desktop/tests/settings-regression.test.mjs`, desktop type-check, and `cargo test --all`. The regression tests execute the real loader with mocked IPC, including a stale read during PDF debounce and overlapping initial reads. Rust tests round-trip PDF enablement and `zh-TW` through config.toml in a temporary directory. Windows GUI validation still requires WebView2: enable PDF translation, wait for auto-save, restart, and check the checkbox and dropdown text in both themes.

## Build an installer from a branch

Push `fix/windows-pdf-settings-select` to GitHub to trigger **Windows installer (branch)** automatically without merging main. Open that branch's run in Actions and download **Zoro-windows-x64-installer** from Artifacts, then extract the `.exe`. This workflow builds an unsigned x64 NSIS installer without updater artifacts and does not publish a release. It also supports workflow_dispatch if GitHub shows the Run workflow button. Do not use the existing Release workflow for a private test build: it publishes releases and builds all platforms.

The available checkout was `badb101`; no v0.1.3 tag was present, and GitHub DNS/proxy access failed. These changes have not been verified against the exact v0.1.3 release or a Windows GUI.
