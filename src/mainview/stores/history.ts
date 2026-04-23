import { atom } from "nanostores";
import type { Song } from "../lib/subsonic";

export interface HistoryEntry {
	songId: string;
	playedAt: number;
	song: Song;
}

const KEY = "navidrome-client.history";
const LIMIT = 200;

function load(): HistoryEntry[] {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as HistoryEntry[];
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(e) =>
				e &&
				typeof e.songId === "string" &&
				typeof e.playedAt === "number" &&
				e.song &&
				typeof e.song.id === "string",
		);
	} catch {
		return [];
	}
}

export const $playHistory = atom<HistoryEntry[]>(load());

$playHistory.subscribe((entries) => {
	try {
		localStorage.setItem(KEY, JSON.stringify(entries.slice(0, LIMIT)));
	} catch {}
});

export function recordPlay(song: Song) {
	const now = Date.now();
	const prev = $playHistory.get();
	const last = prev[0];
	if (last && last.songId === song.id && now - last.playedAt < 30_000) return;
	const next = [{ songId: song.id, playedAt: now, song }, ...prev].slice(0, LIMIT);
	$playHistory.set(next);
}
