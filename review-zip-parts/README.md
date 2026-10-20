# Review ZIP delivery only

Reviewed feature commit: d24f66b03d9f7f3d7a60156c77be9b0d0e8e9ddf.

This branch only delivers zoro-offline-bilingual-review.zip; it does not develop new features. ZIP parts are numbered and reassembled/checksummed by .github/workflows/export-offline-review.yml. The workflow extracts and verifies all manifest hashes, then uploads that directory as the zoro-offline-bilingual-review Artifact. Download the Artifact ZIP directly; its root contains README_FOR_CHATGPT.md, source/, changes/, tests/ and verification/.

No installer EXE, .env, credentials, .git database, node_modules, target, private user data or actual full papers are included. Existing upstream document screenshots are omitted to avoid confusing them with feature verification. Original public app icon assets remain. Logs are privacy-redacted. Local ZIP extraction and all 462 manifest file hashes passed.
