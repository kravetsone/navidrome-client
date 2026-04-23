import { atom, computed } from "nanostores";
import type { Song } from "../lib/subsonic";
import { getSnapshot, persistKv } from "../lib/persistence";

export type RepeatMode = "off" | "all" | "one";
export type LyricsMode = "off" | "panel" | "cinematic";

const DEFAULT_VOLUME = 0.8;

function clampVolume(v: unknown): number {
	if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_VOLUME;
	return Math.max(0, Math.min(1, v));
}

function asRepeat(v: unknown): RepeatMode {
	return v === "all" || v === "one" ? v : "off";
}

function asLyricsMode(v: unknown): LyricsMode {
	return v === "panel" || v === "cinematic" ? v : "off";
}

export const $queue = atom<Song[]>([]);
export const $currentIndex = atom<number>(-1);
const shufflePlayed = new Set<string>();
let shuffleQueueRef: Song[] | null = null;

function resetShuffleHistory() {
	shufflePlayed.clear();
	shuffleQueueRef = null;
}

function pickShuffleNext(q: Song[], current: number): number {
	if (q.length <= 1) return current;
	if (shuffleQueueRef !== q) {
		shufflePlayed.clear();
		shuffleQueueRef = q;
	}
	const currentSong = q[current];
	if (currentSong) shufflePlayed.add(currentSong.id);

	let candidates = q
		.map((s, i) => ({ s, i }))
		.filter(({ s, i }) => i !== current && !shufflePlayed.has(s.id));

	// Round complete: reset, exclude only the current.
	if (candidates.length === 0) {
		shufflePlayed.clear();
		if (currentSong) shufflePlayed.add(currentSong.id);
		candidates = q.map((s, i) => ({ s, i })).filter(({ i }) => i !== current);
		if (candidates.length === 0) return current;
	}

	// Weight starred 2x; everything else 1.
	const weights = candidates.map(({ s }) => (s.starred ? 2 : 1));
	const total = weights.reduce((a, b) => a + b, 0);
	let r = Math.random() * total;
	for (let k = 0; k < candidates.length; k++) {
		r -= weights[k]!;
		if (r <= 0) return candidates[k]!.i;
	}
	return candidates[candidates.length - 1]!.i;
}
export const $isPlaying = atom<boolean>(false);
export const $position = atom<number>(0);
export const $duration = atom<number>(0);
export const $volume = atom<number>(DEFAULT_VOLUME);
export const $repeat = atom<RepeatMode>("off");
export const $shuffle = atom<boolean>(false);
export const $history = atom<Song[]>([]);
export const $nowPlayingOpen = atom<boolean>(false);
export const $queueOpen = atom<boolean>(false);
export const $lyricsMode = atom<LyricsMode>("off");

let wired = false;

export function hydratePlayer(): void {
	const { kv } = getSnapshot();
	$volume.set(clampVolume(kv.volume));
	$repeat.set(asRepeat(kv.repeat));
	$shuffle.set(Boolean(kv.shuffle));
	$lyricsMode.set(asLyricsMode(kv.lyricsMode));

	if (!wired) {
		wired = true;
		$volume.listen((v) => persistKv("volume", v));
		$repeat.listen((v) => persistKv("repeat", v));
		$shuffle.listen((v) => persistKv("shuffle", v));
		$lyricsMode.listen((v) => persistKv("lyricsMode", v));
	}
}

export const $currentSong = computed(
	[$queue, $currentIndex],
	(queue, index) => (index >= 0 && index < queue.length ? queue[index]! : null),
);

export const $hasQueue = computed($queue, (q) => q.length > 0);

export function playSong(song: Song) {
	$queue.set([song]);
	$currentIndex.set(0);
	$isPlaying.set(true);
}

export function playQueue(songs: Song[], startIndex = 0) {
	if (songs.length === 0) return;
	const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
	resetShuffleHistory();
	$queue.set(songs.slice());
	$currentIndex.set(idx);
	$isPlaying.set(true);
}

export function playNext() {
	const q = $queue.get();
	if (q.length === 0) return;
	const current = $currentIndex.get();
	const shuffle = $shuffle.get();
	const repeat = $repeat.get();

	if (shuffle && q.length > 1) {
		const next = pickShuffleNext(q, current);
		$currentIndex.set(next);
		$isPlaying.set(true);
		return;
	}

	if (current < q.length - 1) {
		$currentIndex.set(current + 1);
		$isPlaying.set(true);
		return;
	}
	if (repeat === "all") {
		$currentIndex.set(0);
		$isPlaying.set(true);
		return;
	}
	$isPlaying.set(false);
}

export function playPrevious() {
	const pos = $position.get();
	if (pos > 3) {
		$position.set(0);
		_seekRequested.set(0);
		return;
	}
	const q = $queue.get();
	const current = $currentIndex.get();
	if (current > 0) {
		$currentIndex.set(current - 1);
		$isPlaying.set(true);
		return;
	}
	if ($repeat.get() === "all" && q.length > 0) {
		$currentIndex.set(q.length - 1);
		$isPlaying.set(true);
		return;
	}
	$position.set(0);
	_seekRequested.set(0);
}

export function togglePlay() {
	if ($currentIndex.get() < 0) return;
	$isPlaying.set(!$isPlaying.get());
}

export const _seekRequested = atom<number | null>(null);

export function seek(seconds: number) {
	const clamped = Math.max(0, seconds);
	$position.set(clamped);
	_seekRequested.set(clamped);
}

export function setVolume(v: number) {
	$volume.set(Math.max(0, Math.min(1, v)));
}

export function toggleShuffle() {
	resetShuffleHistory();
	$shuffle.set(!$shuffle.get());
}

export function cycleRepeat() {
	const m = $repeat.get();
	$repeat.set(m === "off" ? "all" : m === "all" ? "one" : "off");
}

export function openNowPlaying() {
	if ($currentIndex.get() >= 0) $nowPlayingOpen.set(true);
}

export function closeNowPlaying() {
	$nowPlayingOpen.set(false);
}

export function toggleLyricsPanel() {
	const mode = $lyricsMode.get();
	$lyricsMode.set(mode === "off" ? "panel" : "off");
}

export function enterLyricsCinematic() {
	$lyricsMode.set("cinematic");
}

export function exitLyricsCinematic() {
	$lyricsMode.set("panel");
}

export function closeLyrics() {
	$lyricsMode.set("off");
}

export function toggleQueue() {
	$queueOpen.set(!$queueOpen.get());
}

export function closeQueue() {
	$queueOpen.set(false);
}

export function addToQueue(songs: Song | Song[]) {
	const list = Array.isArray(songs) ? songs : [songs];
	if (list.length === 0) return;
	const q = $queue.get();
	if (q.length === 0) {
		playQueue(list, 0);
		return;
	}
	$queue.set([...q, ...list]);
}

export function playNextInQueue(songs: Song | Song[]) {
	const list = Array.isArray(songs) ? songs : [songs];
	if (list.length === 0) return;
	const q = $queue.get();
	if (q.length === 0) {
		playQueue(list, 0);
		return;
	}
	const idx = $currentIndex.get();
	const insertAt = Math.max(0, idx) + 1;
	$queue.set([...q.slice(0, insertAt), ...list, ...q.slice(insertAt)]);
}

export function insertIntoQueue(songs: Song | Song[], atIndex: number) {
	const list = Array.isArray(songs) ? songs : [songs];
	if (list.length === 0) return;
	const q = $queue.get();
	if (q.length === 0) {
		playQueue(list, 0);
		return;
	}
	const insertAt = Math.max(0, Math.min(atIndex, q.length));
	$queue.set([...q.slice(0, insertAt), ...list, ...q.slice(insertAt)]);
	const current = $currentIndex.get();
	if (current >= 0 && insertAt <= current) {
		$currentIndex.set(current + list.length);
	}
}

export function jumpTo(index: number) {
	const q = $queue.get();
	if (index < 0 || index >= q.length) return;
	$currentIndex.set(index);
	$isPlaying.set(true);
}

export function reorderQueue(fromIndex: number, toIndex: number) {
	const q = $queue.get();
	if (fromIndex === toIndex) return;
	if (fromIndex < 0 || fromIndex >= q.length) return;
	if (toIndex < 0 || toIndex >= q.length) return;
	const copy = q.slice();
	const [moved] = copy.splice(fromIndex, 1);
	if (!moved) return;
	copy.splice(toIndex, 0, moved);
	const current = $currentIndex.get();
	let newCurrent = current;
	if (current === fromIndex) newCurrent = toIndex;
	else if (fromIndex < current && toIndex >= current) newCurrent = current - 1;
	else if (fromIndex > current && toIndex <= current) newCurrent = current + 1;
	$queue.set(copy);
	if (newCurrent !== current) $currentIndex.set(newCurrent);
}

export function removeFromQueue(index: number) {
	const q = $queue.get();
	if (index < 0 || index >= q.length) return;
	const current = $currentIndex.get();
	if (index === current) {
		const copy = q.slice();
		copy.splice(index, 1);
		$queue.set(copy);
		if (copy.length === 0) {
			$currentIndex.set(-1);
			$isPlaying.set(false);
		} else {
			$currentIndex.set(Math.min(index, copy.length - 1));
			$isPlaying.set(true);
		}
		return;
	}
	const copy = q.slice();
	copy.splice(index, 1);
	$queue.set(copy);
	if (index < current) $currentIndex.set(current - 1);
}
