#!/usr/bin/env bun
/**
 * Validates every entry in public-servers.json against the same connect flow
 * the app runs in ConnectView — probeServer() → ping + (optional) OpenSubsonic
 * extension discovery. Prints a pass/fail line per server and exits non-zero
 * if anything failed, so CI can block a PR that ships a broken community
 * server.
 *
 *   bun run scripts/validate-community-servers.ts
 *   bun run scripts/validate-community-servers.ts path/to/other.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { probeServer } from "../src/mainview/lib/subsonic/probe";
import {
	InvalidEndpointError,
	NetworkError,
	SubsonicError,
} from "../src/mainview/lib/subsonic/types";
import type { CommunityServerList } from "../src/mainview/lib/queries/community-servers";

const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const PROBE_TIMEOUT_MS = 15_000;

async function main() {
	const path = resolve(process.argv[2] ?? "public-servers.json");
	const raw = readFileSync(path, "utf8");
	const list = JSON.parse(raw) as CommunityServerList;

	if (!Array.isArray(list.servers) || list.servers.length === 0) {
		console.error(red(`No servers in ${path}`));
		process.exit(1);
	}

	console.log(bold(`Validating ${list.servers.length} servers from ${path}\n`));

	const failures: string[] = [];

	for (const server of list.servers) {
		const label = `${server.name} ${dim(`(${server.url})`)}`;
		process.stdout.write(`  … ${label}`);
		const started = Date.now();

		try {
			const result = await withTimeout(
				probeServer({
					url: server.url,
					username: server.username,
					authMode: "password",
					secret: server.password,
				}),
				PROBE_TIMEOUT_MS,
			);
			const tookMs = Date.now() - started;
			const caps = result.caps;
			const typeMismatch =
				server.type !== caps.type &&
				// JSON may say "navidrome" while caps also say "navidrome" — pass.
				// But if JSON claims "navidrome" and server pings as plain subsonic,
				// flag it so the list stays accurate.
				!(server.type === "opensubsonic" && caps.openSubsonic);
			process.stdout.write(
				`\r  ${green("✓")} ${label} ${dim(`— ${caps.type} ${caps.serverVersion} · ${tookMs}ms`)}\n`,
			);
			if (typeMismatch) {
				console.log(
					`      ${red("!")} type mismatch: JSON says "${server.type}", server reports "${caps.type}"`,
				);
				failures.push(`${server.id}: type mismatch`);
			}
			for (const w of result.warnings) console.log(`      ${dim(`· ${w}`)}`);
		} catch (err) {
			const tookMs = Date.now() - started;
			process.stdout.write(
				`\r  ${red("✗")} ${label} ${dim(`— ${tookMs}ms`)}\n`,
			);
			console.log(`      ${red(describeError(err))}`);
			failures.push(`${server.id}: ${describeError(err)}`);
		}
	}

	console.log();
	if (failures.length > 0) {
		console.error(
			red(bold(`${failures.length}/${list.servers.length} server(s) failed validation:`)),
		);
		for (const f of failures) console.error(red(`  - ${f}`));
		process.exit(1);
	}
	console.log(green(bold(`All ${list.servers.length} servers passed.`)));
}

function describeError(err: unknown): string {
	if (err instanceof SubsonicError) {
		return `API rejected credentials (code ${err.code}): ${err.message}`;
	}
	if (err instanceof InvalidEndpointError) {
		return `Not a Subsonic endpoint: ${err.message}${err.detail ? ` — ${err.detail}` : ""}`;
	}
	if (err instanceof NetworkError) {
		return `Network error: ${err.message}`;
	}
	if (err instanceof Error) return err.message;
	return String(err);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new NetworkError(`Timed out after ${ms}ms`)), ms),
		),
	]);
}

main().catch((err) => {
	console.error(red(`Unexpected failure: ${String(err)}`));
	process.exit(1);
});
