---
name: publish-release
description: Cut a new GitHub Release end-to-end — bump version, push tag, watch the Release workflow, generate beautiful release notes from commits since the previous tag, overwrite the draft notes, and publish. Use when the user says "release", "publish version X", "ship", "выпусти релиз", "опубликуй", "сделай релиз", "cut a release", or similar phrasing that asks to produce a new GitHub Release of this Electrobun app. One command from "we want to ship" to "users can download on the Releases page".
license: MIT
---

# Publish Release

End-to-end release orchestrator for the Navidrome Client Electrobun app. Replaces the manual "bump → tag → push → wait → edit notes → publish" dance with a single skill invocation.

## When invoked

User examples: `/publish-release`, `/publish-release minor`, `/publish-release 0.2.0`, "сделай релиз", "release 0.2.0", "ship a patch".

Argument forms:
- `patch` / `minor` / `major` — semver bump from current version
- `X.Y.Z` — explicit version
- empty — ask the user via AskUserQuestion what bump they want

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth status`). If not, stop and tell user to run `gh auth login`.
- Clean git working tree (or user's explicit OK to stash).
- On `main` branch, up-to-date with `origin/main`.
- `package.json` exists and is readable.
- `.github/workflows/release.yml` exists (the tag-triggered workflow).

## Workflow

Follow these steps in order. Do not skip. Announce each step briefly before executing it.

### 1. Preflight

Run in parallel:
```bash
gh auth status
git status --porcelain
git rev-parse --abbrev-ref HEAD
git fetch origin --tags --quiet
git describe --tags --abbrev=0 2>/dev/null || echo "NO_PREVIOUS_TAG"
```

Abort with a clear message if:
- `gh` not authenticated
- Not on `main` (unless user explicitly overrides)
- Working tree dirty → offer to stash, commit, or abort
- Local `main` behind `origin/main` → user needs to pull first

Remember the previous tag (e.g. `v0.1.0`) — you'll need it for the commit range later. If `NO_PREVIOUS_TAG`, use the initial commit (`git rev-list --max-parents=0 HEAD`).

### 2. Resolve target version

Read current version:
```bash
node -p "require('./package.json').version"
```

- If arg is `patch`/`minor`/`major` → compute next version from semver.
- If arg looks like `X.Y.Z` (or `X.Y.Z-rc.N`) → use it verbatim.
- If no arg → AskUserQuestion with four options: patch (default), minor, major, custom.

Validate target version does NOT already exist as a tag:
```bash
git rev-parse "v<target>" 2>/dev/null && echo EXISTS || echo OK
```

### 3. Bump version + commit

Edit `package.json` — update `"version": "<target>"`. `electrobun.config.ts` already reads from `package.json`, so no second edit needed.

```bash
git add package.json
git commit -m "chore: release v<target>"
```

### 4. Create annotated tag and push

Use an annotated tag (not lightweight). Tag message = "Release v<target>". Push commit first, then tag.

```bash
git push origin main
git tag -a "v<target>" -m "Release v<target>"
git push origin "v<target>"
```

### 5. Watch the Release workflow

The `v*` tag triggers `.github/workflows/release.yml` with four matrix jobs + a release job. Find the run:

```bash
gh run list --workflow=release.yml --event=push --limit=1 --json databaseId,status,headBranch,createdAt
```

The freshest run for the tag is yours. Stream it:

```bash
gh run watch <databaseId> --exit-status
```

Or poll every ~30s with `gh run view <databaseId> --json status,conclusion,jobs` if `watch` is unavailable. Expected runtime: 10–15 minutes.

**If any job fails:** dump the failing job's log (`gh run view <databaseId> --log-failed`), show the user the relevant excerpt, and ask: (a) re-run failed jobs (`gh run rerun <databaseId> --failed`), (b) abort + delete tag, (c) inspect manually. Do not proceed to publish with a broken matrix.

### 6. Verify draft release exists with all artifacts

```bash
gh release view "v<target>" --json assets,isDraft,url
```

Expected asset filenames (based on this repo's Electrobun config):
- `stable-macos-arm64-NavidromeClient.dmg`
- `stable-macos-x64-NavidromeClient.dmg`
- `stable-linux-x64-NavidromeClient*` (`.AppImage` / `.tar.zst` / similar)
- `stable-win-x64-NavidromeClient*` (`.exe` / `.msi`)
- `*update.json` files (used by the updater; fine to include)

If any platform is missing, surface it to the user before proceeding — maybe a matrix job silently produced nothing.

### 7. Generate release notes

Gather commits since the previous tag:

```bash
git log "<prev-tag>..v<target>" --pretty=format:"%H%x09%s%x09%an" --no-merges
```

(Use a tab separator so splitting is safe.) Also fetch the contributor list for the "Thanks" footer.

**Categorize commits.** Detect these patterns on the subject line (case-insensitive):

| Pattern | Section |
|---|---|
| `feat:` / `feat(scope):` / starts with `add ` / `new ` | ### New features |
| `fix:` / starts with `fix ` / `bugfix` | ### Bug fixes |
| `perf:` / contains `performance` / `faster` | ### Performance |
| `refactor:` / `cleanup` / `simplify` | ### Internal |
| `docs:` | ### Documentation |
| `chore:` / `ci:` / `build:` / `test:` | Omit from user-facing notes |
| Starts with `Phase N.M:` | Try to infer from body — `Phase 4.6: Favorites + Recent views` → New feature. Fall back to ### Changes. |
| `!:` suffix on type, or body has `BREAKING CHANGE:` | ### Breaking changes (top section) |

Claude should use judgment when a commit does not match a pattern — read the message, decide the likely category, place accordingly.

**Release notes template** (skip empty sections):

```markdown
## Navidrome Client v<target>

### Download

Grab the build for your platform from the assets below:

- **macOS (Apple Silicon)** — `stable-macos-arm64-NavidromeClient.dmg`
- **macOS (Intel)** — `stable-macos-x64-NavidromeClient.dmg`
- **Linux (x64)** — `stable-linux-x64-*` (AppImage recommended)
- **Windows (x64)** — `stable-win-x64-*`

> **macOS first-launch workaround** — builds are currently unsigned. Right-click the app in `/Applications` → **Open**, or run once in Terminal: `xattr -dr com.apple.quarantine "/Applications/Navidrome Client.app"`

### Breaking changes

- <subject> ([`<short-sha>`](<commit-url>))

### New features

- <subject> ([`<short-sha>`](<commit-url>))

### Bug fixes

- <subject> ([`<short-sha>`](<commit-url>))

### Performance

- <subject> ([`<short-sha>`](<commit-url>))

### Internal

- <subject> ([`<short-sha>`](<commit-url>))

### Contributors

Thanks to <@handle>, <@handle> — your work is in this release.

---

**Full changelog**: https://github.com/kravetsone/navidrome-client/compare/<prev-tag>...v<target>
```

Rules for writing the bullets:
- Strip the conventional-commit prefix from the subject (`feat: add foo` → `add foo`), then sentence-case it.
- Do NOT include commits with subjects `chore: release v*` (the release commit itself) or merge commits.
- If a `Phase N.M: <desc>` commit appears, render as `<desc> (Phase N.M)`.
- Keep it terse. No "This commit does X" filler. Copy the subject, clean it, link the SHA.
- Omit any section that has zero bullets.
- If the total release would have < 1 meaningful user-facing bullet (i.e. only chore/ci), fall back to writing a single sentence summary and skip all sections.

Write the final notes to a temp file:
```bash
mktemp -t relnotes.XXXXXX.md
```

### 8. Overwrite draft notes, show to user, confirm publish

```bash
gh release edit "v<target>" \
  --title "Navidrome Client v<target>" \
  --notes-file <tempfile>
gh release view "v<target>"
```

Present the rendered notes to the user along with the asset list. Ask via AskUserQuestion: **Publish now?** Options: (a) Publish, (b) Keep as draft (you'll edit / publish manually later), (c) Unpublish + delete the tag (abort).

If Publish:
```bash
gh release edit "v<target>" --draft=false --latest
```

Print the public release URL. Done.

If Keep as draft: print `gh release view "v<target>" --web` so user can finish it. Done.

If Abort: `gh release delete "v<target>" --yes --cleanup-tag` and revert the version bump commit. (Only do this one if user explicitly confirms — destructive.)

## Quick reference commands

```bash
# Current version
node -p "require('./package.json').version"

# Previous tag
git describe --tags --abbrev=0

# Commits since previous tag
git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges

# Latest run for the release workflow
gh run list --workflow=release.yml --limit=1

# Stream a run
gh run watch <id> --exit-status

# Release asset list
gh release view v<target> --json assets --jq '.assets[].name'

# Publish a draft
gh release edit v<target> --draft=false --latest
```

## Failure modes

| Symptom | Recovery |
|---|---|
| `gh` not authed | Stop. User runs `gh auth login`. |
| Dirty working tree | Ask: stash / commit / abort. |
| Tag already exists | Stop. User picks a different version. |
| Matrix job fails | Dump failing log. Offer rerun-failed / abort (delete tag + revert commit). |
| Workflow succeeds but a platform artifact is missing | Warn, show what's present, let user decide. |
| `gh run watch` not available | Poll `gh run view --json status,conclusion` every ~30s until status=`completed`. |
| Release draft already exists from a previous failed attempt | Overwrite its notes and assets; do not create a duplicate. |

## Non-goals / do not do

- Do NOT push without user-initiated invocation of this skill. The skill is the trigger.
- Do NOT amend or rewrite already-published tags.
- Do NOT run `git push --force`.
- Do NOT remove commits other than the version-bump commit during abort, and only with explicit user confirmation.
- Do NOT skip the workflow-watch step and publish before artifacts exist.

## Notes for future maintenance

- If the Electrobun artifact naming changes (e.g. DMG → PKG, or channel prefix changes), update the Download section in the notes template.
- If macOS signing + notarization gets wired up, remove the "first-launch workaround" callout from the template.
- If additional platforms (macOS universal, linux-arm64) get added to `release.yml`, add them to the expected-assets check in step 6 and to the Download section.
