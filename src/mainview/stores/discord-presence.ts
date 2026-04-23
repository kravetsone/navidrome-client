import { appRPC } from "../lib/electroview";
import type { PresencePayload } from "../../shared/discord";
import type { DiscordRuntimePrefs } from "../../shared/rpc-schema";
import {
	$currentSong,
	$isPlaying,
	$position,
	$duration,
	_seekRequested,
} from "./player";
import { $discord } from "./preferences";

const DEBOUNCE_MS = 800;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function pushPresence() {
	const prefs = $discord.get();
	if (!prefs.enabled) {
		appRPC.request.clearDiscordPresence().catch(() => {});
		return;
	}
	const song = $currentSong.get();
	if (!song) {
		appRPC.request.clearDiscordPresence().catch(() => {});
		return;
	}
	const payload: PresencePayload = {
		title: song.title,
		artist: song.artist,
		album: song.album,
		duration: $duration.get() || song.duration,
		position: $position.get(),
		isPlaying: $isPlaying.get(),
	};
	appRPC.request.setDiscordPresence(payload).catch(() => {});
}

function scheduleUpdate() {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(pushPresence, DEBOUNCE_MS);
}

function toRuntime(prefs: ReturnType<typeof $discord.get>): DiscordRuntimePrefs {
	return {
		enabled: prefs.enabled,
		showCoverArt: prefs.showCoverArt,
		showTimestamps: prefs.showTimestamps,
		clearWhenPaused: prefs.clearWhenPaused,
	};
}

export function initDiscordPresence() {
	// Seed bun-side runtime prefs from the hydrated store so the decision to
	// connect (or not) on startup matches the user's last-saved preference.
	appRPC.request.setDiscordPrefs(toRuntime($discord.get())).catch(() => {});

	$currentSong.subscribe(scheduleUpdate);
	$isPlaying.subscribe(scheduleUpdate);
	_seekRequested.subscribe((v) => {
		if (v !== null) scheduleUpdate();
	});
	$discord.listen((prefs) => {
		appRPC.request.setDiscordPrefs(toRuntime(prefs)).catch(() => {});
		// Changing presence flags (show cover, timestamps) should refresh the
		// currently-published activity, not just affect the next one.
		scheduleUpdate();
	});
}
