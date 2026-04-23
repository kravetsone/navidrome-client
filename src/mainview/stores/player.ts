import { atom, computed } from "nanostores";
import type { Song } from "../lib/subsonic";

export type RepeatMode = "off" | "all" | "one";

const VOLUME_KEY = "navidrome-client.volume";

function loadVolume(): number {
	try {
		const raw = localStorage.getItem(VOLUME_KEY);
		if (raw === null) return 0.8;
		const v = Number(raw);
		if (!Number.isFinite(v)) return 0.8;
		return Math.max(0, Math.min(1, v));
	} catch {
		return 0.8;
	}
}

export const $queue = atom<Song[]>([]);
export const $currentIndex = atom<number>(-1);
export const $isPlaying = atom<boolean>(false);
export const $position = atom<number>(0);
export const $duration = atom<number>(0);
export const $volume = atom<number>(loadVolume());
export const $repeat = atom<RepeatMode>("off");
export const $shuffle = atom<boolean>(false);
export const $history = atom<Song[]>([]);
export const $nowPlayingOpen = atom<boolean>(false);
export const $queueOpen = atom<boolean>(false);

export const $currentSong = computed(
	[$queue, $currentIndex],
	(queue, index) => (index >= 0 && index < queue.length ? queue[index]! : null),
);

export const $hasQueue = computed($queue, (q) => q.length > 0);

$volume.subscribe((v) => {
	try {
		localStorage.setItem(VOLUME_KEY, String(v));
	} catch {}
});

export function playSong(song: Song) {
	$queue.set([song]);
	$currentIndex.set(0);
	$isPlaying.set(true);
}

export function playQueue(songs: Song[], startIndex = 0) {
	if (songs.length === 0) return;
	const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
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
		let next = current;
		while (next === current) next = Math.floor(Math.random() * q.length);
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
