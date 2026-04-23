import { atom, computed } from "nanostores";
import { getSnapshot, persistKv } from "../lib/persistence";

// ─── types ─────────────────────────────────────────────────────────────────

export type AccentName = "gold" | "blue" | "purple" | "green" | "pink" | "custom";
export type Density = "comfortable" | "compact";
export type AudioBackend = "auto" | "html5" | "webaudio";
export type StreamQuality = "auto" | "low" | "medium" | "high" | "custom";
export type TranscodeFormat = "raw" | "mp3" | "opus";
export type RadioLookahead = 3 | 5 | 8;

export interface AppearancePrefs {
	accent: AccentName;
	customAccent: string; // hex
	density: Density;
	reduceMotion: boolean;
	ambientBackground: boolean;
}

export interface PlaybackPrefs {
	audioBackend: AudioBackend;
	preloadSeconds: number;
	scrobbleThresholdPercent: number;
	streamQuality: StreamQuality;
	transcodeFormat: TranscodeFormat;
	maxBitrate: 0 | 96 | 128 | 192 | 256 | 320;
	radioLookahead: RadioLookahead;
}

export interface DiscordPrefs {
	enabled: boolean;
	showCoverArt: boolean;
	showTimestamps: boolean;
	clearWhenPaused: boolean;
}

export interface Preferences {
	appearance: AppearancePrefs;
	playback: PlaybackPrefs;
	discord: DiscordPrefs;
}

export const DEFAULT_PREFERENCES: Preferences = {
	appearance: {
		accent: "gold",
		customAccent: "#e8b86a",
		density: "comfortable",
		reduceMotion: false,
		ambientBackground: true,
	},
	playback: {
		audioBackend: "auto",
		preloadSeconds: 10,
		scrobbleThresholdPercent: 50,
		streamQuality: "auto",
		transcodeFormat: "raw",
		maxBitrate: 0,
		radioLookahead: 5,
	},
	discord: {
		enabled: true,
		showCoverArt: true,
		showTimestamps: true,
		clearWhenPaused: false,
	},
};

// ─── sanitizers ────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function asAccent(v: unknown): AccentName {
	return v === "blue" || v === "purple" || v === "green" || v === "pink" || v === "custom"
		? v
		: "gold";
}

function asHex(v: unknown, fallback: string): string {
	return typeof v === "string" && HEX_RE.test(v) ? v : fallback;
}

function asDensity(v: unknown): Density {
	return v === "compact" ? "compact" : "comfortable";
}

function asBackend(v: unknown): AudioBackend {
	return v === "html5" || v === "webaudio" ? v : "auto";
}

function asQuality(v: unknown): StreamQuality {
	return v === "low" || v === "medium" || v === "high" || v === "custom" ? v : "auto";
}

function asFormat(v: unknown): TranscodeFormat {
	return v === "mp3" || v === "opus" ? v : "raw";
}

function asBitrate(v: unknown): PlaybackPrefs["maxBitrate"] {
	return v === 96 || v === 128 || v === 192 || v === 256 || v === 320 ? v : 0;
}

function asLookahead(v: unknown): RadioLookahead {
	return v === 3 || v === 8 ? v : 5;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
	if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
	return Math.max(min, Math.min(max, Math.round(v)));
}

function asBool(v: unknown, fallback: boolean): boolean {
	return typeof v === "boolean" ? v : fallback;
}

function sanitize(raw: unknown): Preferences {
	const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	const a = (r.appearance && typeof r.appearance === "object" ? r.appearance : {}) as Record<
		string,
		unknown
	>;
	const p = (r.playback && typeof r.playback === "object" ? r.playback : {}) as Record<
		string,
		unknown
	>;
	const d = (r.discord && typeof r.discord === "object" ? r.discord : {}) as Record<
		string,
		unknown
	>;
	return {
		appearance: {
			accent: asAccent(a.accent),
			customAccent: asHex(a.customAccent, DEFAULT_PREFERENCES.appearance.customAccent),
			density: asDensity(a.density),
			reduceMotion: asBool(a.reduceMotion, DEFAULT_PREFERENCES.appearance.reduceMotion),
			ambientBackground: asBool(
				a.ambientBackground,
				DEFAULT_PREFERENCES.appearance.ambientBackground,
			),
		},
		playback: {
			audioBackend: asBackend(p.audioBackend),
			preloadSeconds: clampInt(p.preloadSeconds, 3, 30, 10),
			scrobbleThresholdPercent: clampInt(p.scrobbleThresholdPercent, 20, 95, 50),
			streamQuality: asQuality(p.streamQuality),
			transcodeFormat: asFormat(p.transcodeFormat),
			maxBitrate: asBitrate(p.maxBitrate),
			radioLookahead: asLookahead(p.radioLookahead),
		},
		discord: {
			enabled: asBool(d.enabled, DEFAULT_PREFERENCES.discord.enabled),
			showCoverArt: asBool(d.showCoverArt, DEFAULT_PREFERENCES.discord.showCoverArt),
			showTimestamps: asBool(d.showTimestamps, DEFAULT_PREFERENCES.discord.showTimestamps),
			clearWhenPaused: asBool(
				d.clearWhenPaused,
				DEFAULT_PREFERENCES.discord.clearWhenPaused,
			),
		},
	};
}

// ─── store ─────────────────────────────────────────────────────────────────

export const $preferences = atom<Preferences>(DEFAULT_PREFERENCES);

// Per-section computed atoms — components subscribing to just one section
// don't re-render when an unrelated section changes.
export const $appearance = computed($preferences, (p) => p.appearance);
export const $playback = computed($preferences, (p) => p.playback);
export const $discord = computed($preferences, (p) => p.discord);

let wired = false;

export function hydratePreferences(): void {
	const { kv } = getSnapshot();
	$preferences.set(sanitize(kv.preferences));
	if (!wired) {
		wired = true;
		$preferences.listen((v) => persistKv("preferences", v));
	}
}

// ─── setters ───────────────────────────────────────────────────────────────

/**
 * Immutably update one field in a preferences section. Safer than exposing
 * `$preferences.set` because it guarantees the other sections survive.
 */
export function setPref<
	S extends keyof Preferences,
	K extends keyof Preferences[S],
>(section: S, key: K, value: Preferences[S][K]): void {
	const cur = $preferences.get();
	$preferences.set({
		...cur,
		[section]: { ...cur[section], [key]: value },
	});
}

export function resetPreferences(): void {
	$preferences.set(DEFAULT_PREFERENCES);
}
