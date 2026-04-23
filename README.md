# Navidrome Client

A cinematic desktop client for [Navidrome](https://www.navidrome.org/) and other [Subsonic](http://www.subsonic.org/pages/api.jsp) / OpenSubsonic-compatible music servers.

Cross-platform — ships as `.app` / `.dmg`, `.AppImage` / `.deb` / `.tar.gz`, and `.exe`. Dark-first; macOS is the primary polish target. Built on [Electrobun](https://electrobun.dev) + [Bun](https://bun.sh) + [SolidJS](https://www.solidjs.com/) — uses the OS webview (WKWebView / WebView2 / WebKitGTK), no Chromium bundled, starts in a blink.

> Status: early development (v0.1). Ships as a real `.app` / `.dmg` / `.AppImage` / `.exe` with tag-driven auto-updates.

## Features

**Library**
- Home, Albums, Artists, Playlists, Favorites, Recently played
- Full-text search across tracks, albums, artists (server-side `search3`)
- Album, artist, and playlist detail views with artwork lightbox

**Playback**
- Gapless `<audio>` engine driven by a nanostore-backed queue
- Repeat (off / all / one), shuffle, sleep timer
- Smart Radio — seeds similar tracks from the current song and keeps the queue warm
- Synced lyrics (LRC via OpenSubsonic `getLyricsBySongId`) with tiered blur and active-line focus
- Ambient cover-art gradient prewarmed for the next track to avoid flashes

**System integration (macOS)**
- Native app menu (copy/paste/cut wired), tray icon with now-playing metadata
- Global media-key shortcuts round-tripping through typed RPC to the webview
- Discord Rich Presence via `@xhayper/discord-rpc`, gated by setting
- `hiddenInset` titlebar + CSS vibrancy — feels like a first-party Mac app

**Multi-server**
- Add multiple Subsonic/Navidrome servers, switch between them instantly
- Every TanStack Query key is namespaced by `activeServerId` — no cross-server leakage
- Cached query results persist to SQLite so the app is warm on relaunch

## Install

Download the latest build for your platform from the [**Releases page**](https://github.com/kravetsone/navidrome-client/releases/latest).

### macOS (Apple Silicon / Intel)

Builds are currently **unsigned** — Gatekeeper will refuse to launch on first run. One-time fix:

```bash
xattr -dr com.apple.quarantine "/Applications/Navidrome Client.app"
```

Or right-click the app → **Open** → confirm the dialog once. Pick `macos-arm64` for M1/M2/M3/M4, `macos-x64` for Intel.

### Linux (x64)

Download the `.AppImage`, `chmod +x`, run. `.tar.gz` and `.deb` variants are also published.

### Windows (x64)

Download the `.exe`. SmartScreen shows "Windows protected your PC" — click **More info** → **Run anyway**. Code signing is on the roadmap.

## Development

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
bun run dev         # electrobun watch mode (rebuild on save, no HMR)
bun run dev:hmr     # Vite on :5173 + electrobun dev → true HMR
bun run start       # one-shot vite build + electrobun dev
bunx tsc --noEmit   # type-check (the only static check configured)
```

In `dev:hmr` mode, the Bun process probes `http://localhost:5173` on window boot — if Vite is up the BrowserView loads it directly, otherwise falls back to the bundled webview.

## Architecture at a glance

```
src/bun/       Bun main process — window, SQLite, tray, menu, shortcuts, Discord RPC
src/mainview/  SolidJS SPA — renders inside a BrowserView
src/shared/    RPC schema + types — imported by both sides, never any runtime code
```

One rule: **never import across the process boundary** except through `src/shared/`. All cross-process calls go through the typed RPC defined in `src/shared/rpc-schema.ts` — edit the schema first, then implement both handler sides.

SQLite lives in Bun (`navidrome-client.db` in `Utils.paths.userData`) with three tables: `kv` (JSON blobs), `servers` (ordered list), `history` (capped ring). The webview hydrates once on boot via a single `persistenceSnapshot` RPC and keeps nanostores in sync from there; writes are debounced back to Bun.

## Build

```bash
bun run build           # vite build + electrobun build
bun run build:canary    # channeled build → canary updater feed
bun run build:release   # channeled build → stable updater feed
```

Artifacts land in `build/<channel>-<platform>-<arch>/`: the `.app` / `.exe` / `.AppImage`, a `.dmg` (macOS), a `.tar.zst` patch bundle, and an `update.json` manifest for the in-app updater.

## Release

Tag-driven. Bump `version` in `package.json`, commit, then:

```bash
git tag v0.1.0
git push --tags
```

The `Release` workflow builds for all four platforms (`macos-arm64`, `macos-x64`, `linux-x64`, `win-x64`) and drafts a GitHub Release with the artifacts attached. The in-app updater reads from `https://github.com/kravetsone/navidrome-client/releases/latest/download`.

## Contributing

Issues and PRs welcome. Two things to know before you start:

- There is no linter and no test runner. `bunx tsc --noEmit` is the only static check — keep it green.
- The codebase has a `CLAUDE.md` that describes the architectural invariants (process boundary, server-scoped query keys, nanostores for domain state, persistence flow). It's the fastest way to get oriented.

## License

MIT © kravetsone
