# Navidrome Client

Beautiful native desktop client for [Navidrome](https://www.navidrome.org/) and other [Subsonic](http://www.subsonic.org/pages/api.jsp) / OpenSubsonic-compatible music servers. Built with [Electrobun](https://electrobun.dev) + [Bun](https://bun.sh) + [SolidJS](https://www.solidjs.com/).

> Status: early development (v0.1). macOS-first.

## Install

Download the latest build for your platform from the [**Releases page**](https://github.com/kravetsone/navidrome-client/releases/latest).

### macOS (arm64 / Intel)

Builds are currently **unsigned** — macOS Gatekeeper will refuse to launch the app on first run. Two options:

1. Right-click the app in `/Applications` → **Open** → confirm the dialog. Only needed once.
2. Or run this once in Terminal to strip the quarantine flag:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Navidrome Client.app"
   ```

Pick `macos-arm64` for Apple Silicon (M1/M2/M3/M4), `macos-x64` for Intel Macs.

### Linux (x64)

Download the `.AppImage`, `chmod +x` it, and run. `.tar.gz` and `.deb` variants are also published.

### Windows (x64)

Download the `.exe`. Windows SmartScreen will show "Windows protected your PC" — click **More info** → **Run anyway**. (Signed builds are on the roadmap.)

## Development

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
bun run dev       # watch mode
# or
bun run start     # vite build + electrobun dev
```

## Build

```bash
bun run build
```

Artifacts land in `build/`.

## Release

Tag-driven. Pushing `vX.Y.Z` triggers the `Release` workflow, which builds for all four platforms and publishes a draft GitHub Release with the artifacts attached. Bump `version` in `package.json`, commit, then:

```bash
git tag v0.1.0
git push --tags
```

## License

MIT © kravetsone
