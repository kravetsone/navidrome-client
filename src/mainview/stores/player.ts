import { atom, computed } from "nanostores";
import type { Song } from "../lib/subsonic";
import { getSnapshot, persistKv } from "../lib/persistence";
import { $activeServerId, $queueServerId } from "./servers";
import { pushToast } from "./toast";

export type RepeatMode = "off" | "all" | "one";
export type LyricsMode = "off" | "panel" | "cinematic";
export type QueueSource = "user" | "radio";

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

function isSong(v: unknown): v is Song {
	if (!v || typeof v !== "object") return false;
	const s = v as Song;
	return typeof s.id === "string" && typeof s.title === "string";
}

function sanitizeQueue(v: unknown): Song[] {
	if (!Array.isArray(v)) return [];
	return v.filter(isSong);
}

function clampIndex(v: unknown, len: number): number {
	if (typeof v !== "number" || !Number.isInteger(v)) return -1;
	if (v < 0 || v >= len) return len > 0 ? 0 : -1;
	return v;
}

function sanitizePosition(v: unknown): number {
	if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
	return v;
}

export const $queue = atom<Song[]>([]);
export const $currentIndex = atom<number>(-1);
export const $queueSources = atom<Record<string, QueueSource>>({});
export const $smartRadio = atom<boolean>(false);
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
let resumePosition = 0;
// Bumps on any queue-replacing action (playSong/playQueue). Hydrate does NOT
// bump, so smart radio can distinguish boot-time rehydration from a fresh
// user intent. Also lets async consumers detect "my snapshot is stale".
let queueGeneration = 0;
// Flips true on the first user-driven queue action of the session. Used by
// smart radio to ignore $queue.listen firing during hydration.
let userTouchedQueue = false;

export function getQueueGeneration(): number {
	return queueGeneration;
}

export function hasUserTouchedQueue(): boolean {
	return userTouchedQueue;
}

const POSITION_WRITE_INTERVAL_MS = 10_000;
let positionTimer: ReturnType<typeof setInterval> | null = null;

function writePosition() {
	persistKv("position", $position.get());
}

function startPositionTicker() {
	if (positionTimer != null) return;
	positionTimer = setInterval(writePosition, POSITION_WRITE_INTERVAL_MS);
}

function stopPositionTicker() {
	if (positionTimer == null) return;
	clearInterval(positionTimer);
	positionTimer = null;
}

export function consumeResumePosition(): number {
	const p = resumePosition;
	resumePosition = 0;
	return p;
}

export function hydratePlayer(): void {
	const { kv } = getSnapshot();
	$volume.set(clampVolume(kv.volume));
	$repeat.set(asRepeat(kv.repeat));
	$shuffle.set(Boolean(kv.shuffle));
	$lyricsMode.set(asLyricsMode(kv.lyricsMode));
	$smartRadio.set(Boolean(kv.smartRadio));

	const queue = sanitizeQueue(kv.queue);
	const index = clampIndex(kv.currentIndex, queue.length);
	$queue.set(queue);
	$currentIndex.set(index);
	// Backfill queueServerId for upgrades from before cross-server awareness:
	// if we restored a queue but no queueServerId was persisted, assume it
	// belongs to the currently active server (that's the only server that
	// existed when the queue was enqueued under the old code path).
	if (queue.length > 0 && $queueServerId.get() === null) {
		$queueServerId.set($activeServerId.get());
	}
	if (queue.length === 0) {
		$queueServerId.set(null);
	}
	const pos = sanitizePosition(kv.position);
	$position.set(pos);
	resumePosition = index >= 0 ? pos : 0;
	// Always restore paused.
	$isPlaying.set(false);

	if (!wired) {
		wired = true;
		$volume.listen((v) => persistKv("volume", v));
		$repeat.listen((v) => persistKv("repeat", v));
		$shuffle.listen((v) => persistKv("shuffle", v));
		$lyricsMode.listen((v) => persistKv("lyricsMode", v));
		$smartRadio.listen((v) => persistKv("smartRadio", v));
		$queue.listen((q) => persistKv("queue", q));
		$currentIndex.listen((i) => persistKv("currentIndex", i));
		$isPlaying.listen((playing) => {
			if (playing) {
				startPositionTicker();
			} else {
				stopPositionTicker();
				writePosition();
			}
		});
		window.addEventListener("beforeunload", writePosition);
	}
}

export const $currentSong = computed(
	[$queue, $currentIndex],
	(queue, index) => (index >= 0 && index < queue.length ? queue[index]! : null),
);

export const $hasQueue = computed($queue, (q) => q.length > 0);

function claimQueueServer() {
	$queueServerId.set($activeServerId.get());
}

function canMutateQueue(): boolean {
	const active = $activeServerId.get();
	const queueSrv = $queueServerId.get();
	if (queueSrv === null || active === null) return true;
	return active === queueSrv;
}

function warnCrossServerMutation() {
	pushToast("Switch back to the playing server to modify the queue.", {
		variant: "info",
	});
}

export function playSong(song: Song) {
	// If the same track is already current, don't wipe the queue — just ensure
	// playback. Also covers re-clicking the now-playing row.
	const q = $queue.get();
	const current = $currentIndex.get();
	if (current >= 0 && q[current]?.id === song.id) {
		$isPlaying.set(true);
		return;
	}
	queueGeneration++;
	userTouchedQueue = true;
	$queue.set([song]);
	$queueSources.set({});
	claimQueueServer();
	$currentIndex.set(0);
	$isPlaying.set(true);
}

export function playQueue(songs: Song[], startIndex = 0) {
	if (songs.length === 0) return;
	const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
	queueGeneration++;
	userTouchedQueue = true;
	resetShuffleHistory();
	$queue.set(songs.slice());
	$queueSources.set({});
	claimQueueServer();
	$currentIndex.set(idx);
	$isPlaying.set(true);
}

export function appendRadioTracks(songs: Song[]) {
	if (songs.length === 0) return;
	const existing = $queue.get();
	const existingIds = new Set(existing.map((s) => s.id));
	const deduped = songs.filter((s) => !existingIds.has(s.id));
	if (deduped.length === 0) return;
	$queue.set([...existing, ...deduped]);
	const sources = { ...$queueSources.get() };
	for (const s of deduped) {
		if (!sources[s.id]) sources[s.id] = "radio";
	}
	$queueSources.set(sources);
}

export function toggleSmartRadio() {
	$smartRadio.set(!$smartRadio.get());
}

export function clearQueue() {
	$queue.set([]);
	$queueSources.set({});
	$currentIndex.set(-1);
	$isPlaying.set(false);
	$queueServerId.set(null);
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

function dedupAgainst(list: Song[], queue: Song[]): Song[] {
	if (queue.length === 0) return list;
	const present = new Set(queue.map((s) => s.id));
	return list.filter((s) => !present.has(s.id));
}

export function addToQueue(songs: Song | Song[]) {
	const list = Array.isArray(songs) ? songs : [songs];
	if (list.length === 0) return;
	const q = $queue.get();
	if (q.length === 0) {
		playQueue(list, 0);
		return;
	}
	if (!canMutateQueue()) {
		warnCrossServerMutation();
		return;
	}
	const fresh = dedupAgainst(list, q);
	if (fresh.length === 0) return;
	userTouchedQueue = true;
	$queue.set([...q, ...fresh]);
}

export function playNextInQueue(songs: Song | Song[]) {
	const list = Array.isArray(songs) ? songs : [songs];
	if (list.length === 0) return;
	const q = $queue.get();
	if (q.length === 0) {
		playQueue(list, 0);
		return;
	}
	if (!canMutateQueue()) {
		warnCrossServerMutation();
		return;
	}
	const fresh = dedupAgainst(list, q);
	if (fresh.length === 0) return;
	userTouchedQueue = true;
	const idx = $currentIndex.get();
	const insertAt = Math.max(0, idx) + 1;
	$queue.set([...q.slice(0, insertAt), ...fresh, ...q.slice(insertAt)]);
}

export function insertIntoQueue(songs: Song | Song[], atIndex: number) {
	const list = Array.isArray(songs) ? songs : [songs];
	if (list.length === 0) return;
	const q = $queue.get();
	if (q.length === 0) {
		playQueue(list, 0);
		return;
	}
	if (!canMutateQueue()) {
		warnCrossServerMutation();
		return;
	}
	const fresh = dedupAgainst(list, q);
	if (fresh.length === 0) return;
	userTouchedQueue = true;
	const insertAt = Math.max(0, Math.min(atIndex, q.length));
	$queue.set([...q.slice(0, insertAt), ...fresh, ...q.slice(insertAt)]);
	const current = $currentIndex.get();
	if (current >= 0 && insertAt <= current) {
		$currentIndex.set(current + fresh.length);
	}
}

export function jumpTo(index: number) {
	const q = $queue.get();
	if (index < 0 || index >= q.length) return;
	userTouchedQueue = true;
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
			$queueServerId.set(null);
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
