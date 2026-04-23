# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Requires Bun 1.3+. No linter or test runner is configured — `tsc --noEmit` is the only static check (ESNext, `strict`, `noUnusedLocals`, `noUnusedParameters`).

```bash
bun install
bun run dev         # electrobun dev --watch (webview bundle only, no HMR)
bun run dev:hmr     # Vite dev server on :5173 + electrobun dev, true HMR
bun run start       # one-shot vite build + electrobun dev (no watch)
bun run build       # production: vite build → electrobun build
bun run build:canary | build:release   # channeled builds for the updater
bunx tsc --noEmit   # type-check
```

Dev-mode HMR: `src/bun/index.ts` probes `http://localhost:5173` — if Vite is up the BrowserWindow loads it directly, otherwise falls back to the bundled `views://mainview/index.html`. Run `dev:hmr` to get the Vite server; `dev` alone gives rebuild-on-save but no live reload.

Release is tag-driven: bump `version` in `package.json`, push a `vX.Y.Z` tag → `.github/workflows/release.yml` builds all four platforms and drafts a GitHub Release. CI (`ci.yml`) only does a macOS-arm64 build — no tests run.

## Architecture

Two-process Electrobun app. **Never import across the process boundary** except through `src/shared/`.

```
src/bun/       Bun main process — window, SQLite, OS integrations (tray, menu, shortcuts, Discord RPC)
src/mainview/  SolidJS SPA — rendered in a BrowserView (Vite root is src/mainview, index.html is here)
src/shared/    RPC schema + persistence/discord payload types. Types-only — imported by both sides.
```

### RPC is the only bridge

`src/shared/rpc-schema.ts` defines `AppRPCSchema` with two halves (`bun` and `webview`), each with typed `requests`. `src/bun/index.ts` calls `BrowserView.defineRPC<AppRPCSchema>({ handlers: { requests: {...} } })`; `src/mainview/lib/electroview.ts` mirrors it with `Electroview.defineRPC<AppRPCSchema>`. When adding cross-process calls, edit the schema first, then implement both handler sides — the types will enforce the rest.

Current request surface: persistence snapshot/mutations, Discord presence, now-playing meta (tray title), and `playerControl` (tray → webview play/pause/next/prev).

### Persistence: SQLite lives in Bun, mirrored to nanostores in the webview

`src/bun/db.ts` opens `navidrome-client.db` in `Utils.paths.userData`, runs `PRAGMA user_version` migrations, and exposes three tables: `kv` (JSON blobs keyed by string), `servers` (ordered list), `history` (capped ring, `HISTORY_LIMIT` in `src/shared/persistence.ts`).

Webview boot (`src/mainview/main.tsx` → `boot()`) order matters:
1. `hydratePersistence()` — RPC call `persistenceSnapshot` pulls `{kv, servers, history}` once.
2. `hydrateServers/Player/History()` — nanostores read from the snapshot synchronously.
3. `restoreQueryCache` + `attachQueryPersister` — TanStack Query cache is serialized into the same `kv` table.
4. `initDiscordPresence` + `installNowPlayingBridge` — wire side-effects.

Writes go through `src/mainview/lib/persistence.ts`, which debounces `kvSet` (200ms per key) and fires server/history mutations as fire-and-forget RPC calls. If you add persistent state, prefer the `kv` bucket unless you need ordered rows.

### Data layer: TanStack Solid Query, server-scoped keys

`src/mainview/lib/queries/` is the boundary between UI and the Subsonic API. Rules:

- **Every query key starts with `["server", activeServerId, ...]`** (`qk.*` builders in `keys.ts`). Switching servers invalidates everything automatically.
- `client.ts` disables retries for `SubsonicError` and `InvalidEndpointError` (user/config errors, not transient). Preserve this when adding new error classes.
- Route-level preload: each `<Route>` in `App.tsx` has a `preload` function from `lib/queries/preload.ts` that warms the cache before navigation.
- `useActiveClient.ts` gives you a reactive `SubsonicClient` tied to the active server — use it instead of constructing clients ad-hoc.

### Subsonic client

`src/mainview/lib/subsonic/client.ts`. Token+salt MD5 auth (via `spark-md5`); `authParams({stable: true})` reuses a cached salt so `<audio>` stream URLs don't change across renders (otherwise the browser refetches). `normalizeServerUrl` strips trailing `/` and `/rest`. Error hierarchy: `SubsonicError` (API said no), `NetworkError` (fetch failed), `InvalidEndpointError` (not a Subsonic server). `API_VERSION = 1.16.1`, `CLIENT_NAME = "Navidrome-Client"`.

For any new Subsonic endpoint work, invoke the `subsonic-api` skill — it covers OpenSubsonic extensions, Navidrome quirks (IDs-as-strings, `search3` without Lucene, `ReverseProxyUserHeader`, `ND_BASEURL`, CVE-2025-27112), and ships working templates.

### UI state: nanostores, not signals

Domain state lives in `src/mainview/stores/` (`player`, `servers`, `history`, `toast`, `lightbox`, `sleepTimer`, `discord-presence`, `search-palette`). Components subscribe with `@nanostores/solid`'s `useStore`. Reactive derived values are Solid signals or `computed(...)` atoms. `player.ts` is the source of truth for queue/index/position/volume/repeat/lyricsMode — the audio element is driven from `lib/player/engine.ts`.

### Routing & shell

`@solidjs/router` in `App.tsx`. `Root` mounts `AppShell` → `ServerGuard` (redirects to `/connect` when no active server) → route component. Window is `titleBarStyle: "hiddenInset"` with `transparent: true` — the CSS vibrancy simulation in `styles/` assumes this.

### OS integrations (Bun side)

`menu.ts` (native app menu, wires copy/paste/cut), `tray.ts` (tray icon + now-playing meta + global shortcuts that round-trip through `playerControl` RPC), `discord-presence.ts` (via `@xhayper/discord-rpc`, gated by user setting), `cover-art.ts` (bun-side cover fetching when needed).

## Design direction

"Cinematic Native", dark-first, macOS-first. Display font: **Instrument Serif**. Beauty is a first-class requirement — when in doubt, invoke the `web-design-guidelines` skill (Vercel's taste rubric) or `extract-design-system` (to mine reference apps like Apple Music/Doppler). For Mac-native patterns, `macos-design-guidelines` (Apple HIG).

## Installed skills worth knowing

`.agents/skills/` (symlinked into `.claude/skills/`):

- `subsonic-api` — invoke proactively for any Subsonic/Navidrome API work
- `electrobun-best-practices`, `electrobun-rpc-patterns`, `electrobun-window-management`, `electrobun-native-ui`, `electrobun-distribution`, `electrobun-debugging`
- `solidjs-patterns`, `tanstack-query-best-practices`
- `web-design-guidelines`, `extract-design-system`, `macos-design-guidelines`
- `publish-release`

## Keeping this file honest

A `SessionStart` hook in `.claude/settings.json` diffs this file's mtime against `package.json`, `src/shared/rpc-schema.ts`, `src/bun/index.ts`, `electrobun.config.ts`, and the `src/mainview/features/` directory listing. When any are newer, it injects a reminder to review CLAUDE.md against reality before continuing. When you make structural changes (new RPC request, new feature route, renamed top-level dir, new major dependency), update the relevant section here in the same commit.
