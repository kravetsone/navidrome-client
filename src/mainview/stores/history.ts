import { atom } from "nanostores";
import type { Song } from "../lib/subsonic";
import {
	getSnapshot,
	persistHistoryAdd,
	persistHistoryClear,
} from "../lib/persistence";

export interface HistoryEntry {
	songId: string;
	playedAt: number;
	song: Song;
}

const LIMIT = 200;

export const $playHistory = atom<HistoryEntry[]>([]);

function isValid(e: unknown): e is HistoryEntry {
	if (!e || typeof e !== "object") return false;
	const o = e as HistoryEntry;
	return (
		typeof o.songId === "string" &&
		typeof o.playedAt === "number" &&
		!!o.song &&
		typeof o.song.id === "string"
	);
}

export function hydrateHistory(): void {
	const snap = getSnapshot();
	const entries = snap.history.filter(isValid).slice(0, LIMIT);
	$playHistory.set(entries);
}

export function recordPlay(song: Song) {
	const now = Date.now();
	const prev = $playHistory.get();
	const last = prev[0];
	if (last && last.songId === song.id && now - last.playedAt < 30_000) return;
	const entry: HistoryEntry = { songId: song.id, playedAt: now, song };
	const next = [entry, ...prev].slice(0, LIMIT);
	$playHistory.set(next);
	persistHistoryAdd({ songId: entry.songId, playedAt: entry.playedAt, song: entry.song });
}

export function clearHistory() {
	$playHistory.set([]);
	persistHistoryClear();
}
