# Private workspace sync

The existing journal and trading data remain in browser storage. Pair the Mac website and iPhone Journal section once under **Settings → Your private workspace**. The same code grants read/write access and decrypts the workspace; protect it like a password. Full backups deliberately exclude this code. Anyone using an unpaired browser continues to have a local workspace.

A Vercel private Blob store backs `/api/workspace`. Set `BLOB_READ_WRITE_TOKEN` and `SYNC_WORKSPACE_ID` in this project's environment. The latter is the SHA-256/base64url hash of a 256-bit HKDF-derived authorization key. The server rejects unpaired callers and does not receive the master pairing code or encryption key. Never put real journal data, keys, or backup files in this repository or app bundle.

Clients derive separate authentication and AES-256-GCM encryption keys with HKDF-SHA256. Each upload has a random 96-bit nonce, authenticated workspace ID, and a gzip-compressed payload. Conditional ETag writes prevent one device from overwriting an unseen revision. Record-level causal versions merge independent changes; concurrent edits keep the losing note as a `sync-recovery` copy, and all conflicting values can be exported from Settings. Deletions are tombstones. No automatic purge occurs.

Changes save locally first, upload after a short pause, and download when the app returns to the foreground, comes online, or the user presses **Sync now**. An open, idle page also checks every five minutes to keep usage reasonable on Hobby. Remote updates wait until the user leaves an input/editor. The browser app shell is cached for offline use after a successful first load. A newly installed device needs an initial internet connection to pair and download data.

## Validation

`npm run check` runs lint, data/analytics tests, encryption/merge tests, an authenticated API test, a simulated two-device transport test (including stale writes and edits in progress), and the journal's final-keystroke persistence regression test, followed by a production build.

The integration uses the existing `jounalindex.vercel.app` origin, preserving its local data. Deployment must include the serverless `api` directory, not only `dist`. The iPhone section is a persistent app-bound WKWebView in the existing signed suite; it does not consume another free-development app slot.
