#!/usr/bin/env bun
/*
 * End-to-end auto-updater harness.
 *
 * Builds the current package.json version as the "installed" app, bumps the
 * patch number, builds that as the "update", then serves the update.json +
 * tarball over http://localhost:8787 for the installed app to discover.
 *
 * Invoke via `bun run test:updater`.
 *
 * macOS only for now — the project ships macOS-first and the path glue
 * (.app bundle discovery, xattr hint) reflects that.
 */

import { spawnSync } from "bun";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const PORT = Number(process.env.UPDATER_TEST_PORT ?? 8787);
const REPO_ROOT = resolve(import.meta.dir, "..");
const STAGING_DIR = resolve("/tmp/navidrome-updater-test");
const INSTALLED_DIR = join(STAGING_DIR, "installed");
const SERVE_DIR = join(STAGING_DIR, "serve");
const PKG_PATH = join(REPO_ROOT, "package.json");
const ARTIFACTS_DIR = join(REPO_ROOT, "artifacts");
const BUILD_DIR = join(REPO_ROOT, "build");

if (process.platform !== "darwin") {
	console.error(
		"test:updater is macOS-only for now. PRs welcome for win/linux launch glue.",
	);
	process.exit(1);
}

function run(cmd: string[], env?: Record<string, string>) {
	const result = spawnSync({
		cmd,
		cwd: REPO_ROOT,
		env: { ...process.env, ...env },
		stdout: "inherit",
		stderr: "inherit",
	});
	if (result.exitCode !== 0) {
		throw new Error(`${cmd.join(" ")} exited ${result.exitCode}`);
	}
}

function copyTree(from: string, to: string) {
	if (!existsSync(from)) throw new Error(`Missing source: ${from}`);
	mkdirSync(to, { recursive: true });
	cpSync(from, to, { recursive: true, dereference: true });
}

function bumpPatch(v: string): string {
	const [maj, min, pat] = v.split(".").map(Number);
	if ([maj, min, pat].some((n) => Number.isNaN(n))) {
		throw new Error(`Can't parse version: ${v}`);
	}
	return `${maj}.${min}.${pat + 1}`;
}

function findAppBundle(root: string): string | null {
	// Prefer the stable-channel build: the dev-channel bundle is also present
	// in build/ from `bun run dev`, and Electrobun's updater hard-short-circuits
	// on channel === "dev" so we must not hand that one to the user.
	if (!existsSync(root)) return null;
	const hits: string[] = [];
	const stack = [root];
	while (stack.length) {
		const dir = stack.pop()!;
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			if (entry.endsWith(".app")) {
				hits.push(full);
				continue;
			}
			try {
				if (statSync(full).isDirectory()) stack.push(full);
			} catch {
				/* skip */
			}
		}
	}
	const stable = hits.find((p) => p.includes("/stable-"));
	return stable ?? hits.find((p) => !p.includes("/dev-")) ?? hits[0] ?? null;
}

const pkgRaw = readFileSync(PKG_PATH, "utf8");
const pkg = JSON.parse(pkgRaw);
const vOld: string = pkg.version;
const vNew = bumpPatch(vOld);

const baseUrl = `http://localhost:${PORT}`;

console.log(`\n Updater test harness`);
console.log(`   installed:  v${vOld}`);
console.log(`   update:     v${vNew}`);
console.log(`   serve:      ${baseUrl}`);
console.log(`   staging:    ${STAGING_DIR}\n`);

rmSync(STAGING_DIR, { recursive: true, force: true });
mkdirSync(SERVE_DIR, { recursive: true });
mkdirSync(INSTALLED_DIR, { recursive: true });

const buildEnv = { ELECTROBUN_BASE_URL: baseUrl };

let pkgRestored = false;
function restorePkg() {
	if (pkgRestored) return;
	writeFileSync(PKG_PATH, pkgRaw);
	pkgRestored = true;
}
process.on("SIGINT", () => {
	restorePkg();
	process.exit(130);
});

try {
	console.log(`[1/4] Building v${vOld} (the "installed" app)…`);
	rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
	run(["bun", "run", "build:release"], buildEnv);
	copyTree(ARTIFACTS_DIR, join(INSTALLED_DIR, "artifacts"));
	copyTree(BUILD_DIR, join(INSTALLED_DIR, "build"));

	console.log(`\n[2/4] Bumping package.json → v${vNew}`);
	writeFileSync(
		PKG_PATH,
		pkgRaw.replace(`"version": "${vOld}"`, `"version": "${vNew}"`),
	);

	console.log(`\n[3/4] Building v${vNew} (the update)…`);
	rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
	run(["bun", "run", "build:release"], buildEnv);

	for (const name of readdirSync(ARTIFACTS_DIR)) {
		if (
			name.endsWith("-update.json") ||
			name.endsWith(".tar.zst") ||
			name.endsWith(".tar.gz")
		) {
			cpSync(join(ARTIFACTS_DIR, name), join(SERVE_DIR, name));
		}
	}
} finally {
	restorePkg();
	console.log("\nRestored package.json.");
}

const installedApp = findAppBundle(join(INSTALLED_DIR, "build"));
const served = readdirSync(SERVE_DIR).sort();

console.log(`\n[4/4] Serving update artifacts on :${PORT}`);
console.log(`
┌──────────────────────────────────────────────────────────────────────
│ Installed v${vOld}:
│   ${installedApp ?? `(no .app bundle found in ${INSTALLED_DIR}/build)`}
│
│ Update v${vNew} being served from ${SERVE_DIR}:
${served.map((f) => "│   " + f).join("\n")}
│
│ To run the test:
│   1. Launch the installed app. On a fresh bundle macOS will quarantine:
│        xattr -dr com.apple.quarantine "${installedApp ?? "<path>"}"
│        open "${installedApp ?? "<path>"}"
│   2. Wait for the updater tick (default 15s). Banner → Downloading →
│      Ready. Click Restart and confirm the new version comes up.
│   3. To skip the wait, launch with:
│        UPDATER_STARTUP_DELAY_MS=2000 open -a "${installedApp ?? "<path>"}" --args
│      (the installed app inherits the env; the delay applies on next check.)
│
│ Ctrl-C here to stop the HTTP server.
└──────────────────────────────────────────────────────────────────────
`);

Bun.serve({
	port: PORT,
	async fetch(req) {
		const { pathname } = new URL(req.url);
		const file = Bun.file(join(SERVE_DIR, pathname));
		const exists = await file.exists();
		const status = exists ? 200 : 404;
		console.log(`  [${status}] ${req.method} ${pathname}`);
		if (!exists) return new Response("Not found", { status: 404 });
		return new Response(file, {
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Cache-Control": "no-store",
			},
		});
	},
});
