import { SubsonicClient, normalizeServerUrl } from "./client";
import type { ServerCaps, ServerConfig, ServerType, SpeedTestResult } from "./types";

export interface ProbeDraft {
	url: string;
	username: string;
	authMode: "apiKey" | "password";
	secret: string;
}

export interface ProbeResult {
	caps: ServerCaps;
	warnings: string[];
	speed: SpeedTestResult;
}

function detectType(ping: { type?: string; openSubsonic?: boolean; serverName?: string }): ServerType {
	const t = ping.type?.toLowerCase();
	if (t === "navidrome" || ping.serverName?.toLowerCase() === "navidrome") return "navidrome";
	if (ping.openSubsonic) return "opensubsonic";
	return "subsonic";
}

export async function probeServer(draft: ProbeDraft): Promise<ProbeResult> {
	const normalized = normalizeServerUrl(draft.url);
	const client = new SubsonicClient({
		url: normalized,
		username: draft.username,
		authMode: draft.authMode,
		secret: draft.secret,
	});

	const warnings: string[] = [];
	const ping = await client.ping();
	const openSubsonic = Boolean(ping.openSubsonic);

	let extensions: Array<{ name: string; versions: number[] }> = [];
	if (openSubsonic) {
		try {
			const ext = await client.getOpenSubsonicExtensions();
			extensions = ext.openSubsonicExtensions ?? [];
		} catch (e) {
			warnings.push("OpenSubsonic extension discovery failed — some features may be unavailable");
		}
	}

	const speed = await client.speedTest();

	return {
		caps: {
			type: detectType(ping),
			serverVersion: ping.serverVersion ?? ping.version ?? "unknown",
			serverName: ping.serverName,
			openSubsonic,
			extensions,
			lastProbedAt: Date.now(),
		},
		warnings,
		speed,
	};
}

export function draftToConfig(draft: ProbeDraft, caps: ServerCaps, name?: string): ServerConfig {
	const normalized = normalizeServerUrl(draft.url);
	const id =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: Math.random().toString(36).slice(2);
	return {
		id,
		name: name?.trim() || deriveName(normalized, draft.username),
		url: normalized,
		username: draft.username,
		authMode: draft.authMode,
		secret: draft.secret,
		caps,
	};
}

function deriveName(url: string, username: string): string {
	try {
		const u = new URL(url);
		return `${username}@${u.hostname}`;
	} catch {
		return username;
	}
}
