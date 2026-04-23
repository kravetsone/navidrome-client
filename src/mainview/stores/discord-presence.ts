import { appRPC } from "../lib/electroview";
import type { PresencePayload } from "../../shared/discord";
import {
	$currentSong,
	$isPlaying,
	$position,
	$duration,
	_seekRequested,
} from "./player";

const DEBOUNCE_MS = 800;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function pushPresence() {
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

export function initDiscordPresence() {
	$currentSong.subscribe(scheduleUpdate);
	$isPlaying.subscribe(scheduleUpdate);
	_seekRequested.subscribe((v) => {
		if (v !== null) scheduleUpdate();
	});
}
