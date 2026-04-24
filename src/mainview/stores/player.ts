import { atom, computed } from "nanostores";
import type { Song } from "../lib/subsonic";
import { getSnapshot, persistKv } from "../lib/persistence";
import { $activeServerId, $queueServerId } from "./servers";
import { $playHistory } from "./history";
import { pushToast } from "./toast";

export type RepeatMode = "off" | "all" | "one";
export type LyricsMode = "off" | "panel" | "cinematic";
export type QueueSource = "radio";
export type PlaybackSource = "context" | "user";

const DEFAULT_VOLUME = 0.8;

// ─── sanitizers ────────────────────────────────────────────────────────────

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

function asPlaybackSource(v: unknown): PlaybackSource | null {
	return v === "context" || v === "user" ? v : null;
}

function isSong(v: unknown): v is Song {
	if (!v || typeof v !== "object") return false;
	const s = v as Song;
	return typeof s.id === "string" && typeof s.title === "string";
}

function sanitizeSongs(v: unknown): Song[] {
	if (!Array.isArray(v)) return [];
	return v.filter(isSong);
}

function sanitizeIndexArray(v: unknown, len: number): number[] {
	if (!Array.isArray(v)) return [];
	const out: number[] = [];
	const seen = new Set<number>();
	for (const x of v) {
		if (typeof x !== "number" || !Number.isInteger(x)) continue;
		if (x < 0 || x >= len) continue;
		if (seen.has(x)) continue;
		seen.add(x);
		out.push(x);
	}
	return out;
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

// ─── atoms ─────────────────────────────────────────────────────────────────

/**
 * Context queue: the album/playlist/radio you're playing FROM. Tracks here are
 * driven by contextIndex and shuffleOrder. Radio top-up appends here.
 */
export const $contextQueue = atom<Song[]>([]);
export const $contextIndex = atom<number>(-1);

/**
 * User queue: explicit "Add to queue"/"Play next" items. FIFO — each entry is
 * popped into playback when the current track ends, *before* advancing the
 * context. Items are consumed on play (not kept in history).
 */
export const $userQueue = atom<Song[]>([]);

/**
 * Upcoming shuffled context indices. Populated when shuffle is on; each
 * advance shifts the head. Empty when shuffle is off.
 */
export const $shuffleOrder = atom<number[]>([]);

/**
 * Where the currently-playing track came from. "user" means we're playing a
 * popped user-queue track (contextIndex is pinned at the last context track).
 */
export const $currentSource = atom<PlaybackSource | null>(null);

/**
 * The user-queue song currently playing (if $currentSource === "user"). Not
 * part of $userQueue — popped on playback.
 */
export const $currentUserTrack = atom<Song | null>(null);

/** Tags on queued tracks (only "radio" today). */
export const $queueSources = atom<Record<string, QueueSource>>({});

export const $smartRadio = atom<boolean>(false);
export const $isPlaying = atom<boolean>(false);
export const $position = atom<number>(0);
export const $duration = atom<number>(0);
export const $volume = atom<number>(DEFAULT_VOLUME);
export const $repeat = atom<RepeatMode>("off");
export const $shuffle = atom<boolean>(false);
export const $nowPlayingOpen = atom<boolean>(false);
export const $queueOpen = atom<boolean>(false);
export const $lyricsMode = atom<LyricsMode>("off");

// ─── derived ───────────────────────────────────────────────────────────────

export const $currentSong = computed(
	[$currentSource, $currentUserTrack, $contextQueue, $contextIndex],
	(source, userTrack, ctx, idx) => {
		if (source === "user") return userTrack;
		if (source === "context" && idx >= 0 && idx < ctx.length) return ctx[idx]!;
		return null;
	},
);

export const $hasQueue = computed(
	[$contextQueue, $userQueue],
	(ctx, user) => ctx.length > 0 || user.length > 0,
);

/**
 * Flat view of all queued songs for consumers that just need to find by id
 * (e.g. optimistic star updates). Don't rely on ordering.
 */
export const $queue = computed(
	[$contextQueue, $userQueue, $currentUserTrack],
	(ctx, user, cur) => {
		const seen = new Set<string>();
		const out: Song[] = [];
		for (const s of ctx) if (!seen.has(s.id)) { seen.add(s.id); out.push(s); }
		for (const s of user) if (!seen.has(s.id)) { seen.add(s.id); out.push(s); }
		if (cur && !seen.has(cur.id)) out.push(cur);
		return out;
	},
);

// ─── radio integration bookkeeping ─────────────────────────────────────────

let wired = false;
let resumePosition = 0;
// Bumps on any queue-replacing action. Hydrate does NOT bump, so async radio
// fetches can detect "my snapshot is stale" and bail.
let queueGeneration = 0;
// Flips true on the first user-driven queue action of the session. Lets smart
// radio ignore $contextQueue.listen firing during hydration.
let userTouchedQueue = false;

export function getQueueGeneration(): number {
	return queueGeneration;
}

export function hasUserTouchedQueue(): boolean {
	return userTouchedQueue;
}

/**
 * Peek the track that will play next (without advancing state). Used by the
 * audio engine for preloading.
 */
export function peekNextSong(): Song | null {
	const user = $userQueue.get();
	if (user.length > 0) return user[0]!;
	const ctx = $contextQueue.get();
	if (ctx.length === 0) return null;
	const idx = $contextIndex.get();
	if ($shuffle.get()) {
		const order = $shuffleOrder.get();
		if (order.length > 0) return ctx[order[0]!] ?? null;
		return null;
	}
	if (idx >= 0 && idx < ctx.length - 1) return ctx[idx + 1]!;
	if ($repeat.get() === "all" && ctx.length > 0) return ctx[0]!;
	return null;
}

// ─── persistence ───────────────────────────────────────────────────────────

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
	// Smart radio defaults ON for fresh installs — the whole point of the
	// "one song → endless similar" flow is most useful when it's a no-op to
	// enable. Explicit "false" persists and wins for users who toggled off.
	$smartRadio.set(kv.smartRadio === undefined ? true : Boolean(kv.smartRadio));

	// Migrate from legacy flat queue (pre-Spotify-model) if new keys are absent.
	const rawContext = kv.contextQueue ?? kv.queue;
	const rawContextIndex = kv.contextIndex ?? kv.currentIndex;
	const ctx = sanitizeSongs(rawContext);
	const ctxIdx = clampIndex(rawContextIndex, ctx.length);
	const userQ = sanitizeSongs(kv.userQueue);
	const sources: Record<string, QueueSource> = {};
	if (kv.queueSources && typeof kv.queueSources === "object") {
		for (const [k, v] of Object.entries(kv.queueSources)) {
			if (v === "radio") sources[k] = "radio";
		}
	}
	const source = asPlaybackSource(kv.currentSource);
	const userTrack = isSong(kv.currentUserTrack) ? kv.currentUserTrack : null;

	$contextQueue.set(ctx);
	$contextIndex.set(ctxIdx);
	$userQueue.set(userQ);
	$queueSources.set(sources);
	$shuffleOrder.set(sanitizeIndexArray(kv.shuffleOrder, ctx.length));

	if (source === "user" && userTrack) {
		$currentSource.set("user");
		$currentUserTrack.set(userTrack);
	} else if (ctxIdx >= 0) {
		$currentSource.set("context");
		$currentUserTrack.set(null);
	} else {
		$currentSource.set(null);
		$currentUserTrack.set(null);
	}

	// Backfill queueServerId for upgrades from before cross-server awareness.
	const hasAny =
		$contextQueue.get().length > 0 ||
		$userQueue.get().length > 0 ||
		$currentUserTrack.get() !== null;
	if (hasAny && $queueServerId.get() === null) {
		$queueServerId.set($activeServerId.get());
	}
	if (!hasAny) $queueServerId.set(null);

	const pos = sanitizePosition(kv.position);
	$position.set(pos);
	resumePosition = $currentSong.get() ? pos : 0;
	// Always restore paused.
	$isPlaying.set(false);

	if (!wired) {
		wired = true;
		$volume.listen((v) => persistKv("volume", v));
		$repeat.listen((v) => persistKv("repeat", v));
		$shuffle.listen((v) => persistKv("shuffle", v));
		$lyricsMode.listen((v) => persistKv("lyricsMode", v));
		$smartRadio.listen((v) => persistKv("smartRadio", v));
		$contextQueue.listen((v) => persistKv("contextQueue", v));
		$contextIndex.listen((v) => persistKv("contextIndex", v));
		$userQueue.listen((v) => persistKv("userQueue", v));
		$shuffleOrder.listen((v) => persistKv("shuffleOrder", v));
		$queueSources.listen((v) => persistKv("queueSources", v));
		$currentSource.listen((v) => persistKv("currentSource", v));
		$currentUserTrack.listen((v) => persistKv("currentUserTrack", v));
		$isPlaying.listen((playing) => {
			if (playing) {
				// Resuming a hydrated queue is a legitimate user intent to
				// listen — treat it as "touched" so smart radio top-up will
				// fire when the queue runs low. Without this, users who
				// close/reopen the app and just hit Play never see radio
				// kick in (hydration doesn't touch this flag).
				userTouchedQueue = true;
				startPositionTicker();
			} else {
				stopPositionTicker();
				writePosition();
			}
		});
		window.addEventListener("beforeunload", writePosition);
	}
}

// ─── queue patching (optimistic star/rating updates) ───────────────────────

/**
 * Patch queued song snapshots across both queues and the current user-track.
 * Queues cache a snapshot at enqueue time, so TanStack Query cache patches
 * don't reach them — this is how we keep the current-song UI in sync.
 */
export function patchQueueSong(id: string, patch: Partial<Song>): void {
	const ctx = $contextQueue.get();
	if (ctx.some((s) => s.id === id)) {
		$contextQueue.set(ctx.map((s) => (s.id === id ? { ...s, ...patch } : s)));
	}
	const user = $userQueue.get();
	if (user.some((s) => s.id === id)) {
		$userQueue.set(user.map((s) => (s.id === id ? { ...s, ...patch } : s)));
	}
	const cur = $currentUserTrack.get();
	if (cur && cur.id === id) {
		$currentUserTrack.set({ ...cur, ...patch });
	}
}

// ─── cross-server guard ────────────────────────────────────────────────────

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

// ─── shuffle order ─────────────────────────────────────────────────────────

function regenerateShuffleOrder() {
	if (!$shuffle.get()) {
		$shuffleOrder.set([]);
		return;
	}
	const ctx = $contextQueue.get();
	const cur = $contextIndex.get();
	if (ctx.length <= 1) {
		$shuffleOrder.set([]);
		return;
	}
	const indices: number[] = [];
	for (let i = 0; i < ctx.length; i++) {
		if (i !== cur) indices.push(i);
	}
	for (let i = indices.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[indices[i], indices[j]] = [indices[j]!, indices[i]!];
	}
	$shuffleOrder.set(indices);
}

// ─── playback primitives ───────────────────────────────────────────────────

export function playSong(song: Song) {
	// Re-clicking the playing context track restarts it (Spotify behaviour).
	if ($currentSource.get() === "context" && $currentSong.get()?.id === song.id) {
		seek(0);
		$isPlaying.set(true);
		return;
	}
	queueGeneration++;
	userTouchedQueue = true;
	// Claim server BEFORE mutating any $currentSong dependency. The audio
	// engine listens on $currentSong (computed from source+userTrack+ctx+idx)
	// and resolves the stream URL against $queueServer — if we claim after
	// the sets, early fires see a null server and bail, and since $currentSong
	// doesn't change again afterward syncCurrentSong never re-runs.
	claimQueueServer();
	$contextQueue.set([song]);
	$contextIndex.set(0);
	$currentSource.set("context");
	$currentUserTrack.set(null);
	$queueSources.set({});
	$shuffleOrder.set([]);
	regenerateShuffleOrder();
	$isPlaying.set(true);
}

export function playQueue(songs: Song[], startIndex = 0) {
	if (songs.length === 0) return;
	const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
	// eslint-disable-next-line no-console
	console.info("[playQueue]", {
		startIndex,
		idx,
		songs: songs.map((s) => ({ id: s.id, title: s.title })),
		prevCtx: $contextQueue.get().map((s) => ({ id: s.id, title: s.title })),
		prevIdx: $contextIndex.get(),
		prevCurrentId: $currentSong.get()?.id,
	});
	queueGeneration++;
	userTouchedQueue = true;
	claimQueueServer();
	$contextQueue.set(songs.slice());
	$contextIndex.set(idx);
	$currentSource.set("context");
	$currentUserTrack.set(null);
	$queueSources.set({});
	// userQueue is preserved across context changes (Spotify behaviour).
	regenerateShuffleOrder();
	$isPlaying.set(true);
	// eslint-disable-next-line no-console
	console.info("[playQueue:after]", {
		ctx: $contextQueue.get().map((s) => ({ id: s.id, title: s.title })),
		idx: $contextIndex.get(),
		currentId: $currentSong.get()?.id,
	});
}

export function appendRadioTracks(songs: Song[]) {
	if (songs.length === 0) return;
	const ctx = $contextQueue.get();
	const existing = new Set(ctx.map((s) => s.id));
	const deduped = songs.filter((s) => !existing.has(s.id));
	if (deduped.length === 0) return;
	const startIdx = ctx.length;
	$contextQueue.set([...ctx, ...deduped]);
	const sources = { ...$queueSources.get() };
	for (const s of deduped) {
		if (!sources[s.id]) sources[s.id] = "radio";
	}
	$queueSources.set(sources);
	// Extend shuffle order so new tracks are reachable.
	if ($shuffle.get()) {
		const order = $shuffleOrder.get().slice();
		for (let i = 0; i < deduped.length; i++) order.push(startIdx + i);
		$shuffleOrder.set(order);
	}
}

export function toggleSmartRadio() {
	$smartRadio.set(!$smartRadio.get());
}

export function clearQueue() {
	$contextQueue.set([]);
	$contextIndex.set(-1);
	$userQueue.set([]);
	$shuffleOrder.set([]);
	$queueSources.set({});
	$currentSource.set(null);
	$currentUserTrack.set(null);
	$isPlaying.set(false);
	$queueServerId.set(null);
}

// ─── user queue actions ────────────────────────────────────────────────────

export function addToQueue(songs: Song | Song[]) {
	const list = Array.isArray(songs) ? songs.slice() : [songs];
	if (list.length === 0) return;
	// Nothing playing yet — treat as a fresh play context so the user
	// doesn't stare at silence after clicking "Add to queue".
	if (!$currentSong.get() && $contextQueue.get().length === 0) {
		playQueue(list, 0);
		return;
	}
	if (!canMutateQueue()) {
		warnCrossServerMutation();
		return;
	}
	userTouchedQueue = true;
	$userQueue.set([...$userQueue.get(), ...list]);
	pushToast(
		list.length === 1 ? "Added to queue" : `Added ${list.length} tracks to queue`,
		{ variant: "success", duration: 1800 },
	);
}

export function playNextInQueue(songs: Song | Song[]) {
	const list = Array.isArray(songs) ? songs.slice() : [songs];
	if (list.length === 0) return;
	if (!$currentSong.get() && $contextQueue.get().length === 0) {
		playQueue(list, 0);
		return;
	}
	if (!canMutateQueue()) {
		warnCrossServerMutation();
		return;
	}
	userTouchedQueue = true;
	$userQueue.set([...list, ...$userQueue.get()]);
	pushToast(
		list.length === 1 ? "Playing next" : `${list.length} tracks up next`,
		{ variant: "success", duration: 1800 },
	);
}

// ─── advance / rewind ──────────────────────────────────────────────────────

function advanceContext(): boolean {
	const ctx = $contextQueue.get();
	if (ctx.length === 0) return false;
	const cur = $contextIndex.get();
	const repeat = $repeat.get();
	if ($shuffle.get()) {
		let order = $shuffleOrder.get();
		if (order.length === 0) {
			if (repeat !== "all" || ctx.length <= 1) return false;
			regenerateShuffleOrder();
			order = $shuffleOrder.get();
			if (order.length === 0) return false;
		}
		const next = order[0]!;
		$shuffleOrder.set(order.slice(1));
		$contextIndex.set(next);
		return true;
	}
	if (cur < ctx.length - 1) {
		$contextIndex.set(cur + 1);
		return true;
	}
	if (repeat === "all") {
		$contextIndex.set(0);
		return true;
	}
	return false;
}

export function playNext() {
	const user = $userQueue.get();
	if (user.length > 0) {
		const [first, ...rest] = user;
		$userQueue.set(rest);
		$currentUserTrack.set(first!);
		$currentSource.set("user");
		$isPlaying.set(true);
		return;
	}
	if (advanceContext()) {
		$currentSource.set("context");
		$currentUserTrack.set(null);
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
	// Walk real listen history — handles shuffle correctly.
	const history = $playHistory.get();
	const current = $currentSong.get();
	let start = 0;
	if (current && history[0]?.songId === current.id) start = 1;
	const entry = history[start];
	if (!entry) {
		$position.set(0);
		_seekRequested.set(0);
		return;
	}
	const ctx = $contextQueue.get();
	const ctxIdx = ctx.findIndex((s) => s.id === entry.songId);
	if (ctxIdx >= 0) {
		$contextIndex.set(ctxIdx);
		$currentSource.set("context");
		$currentUserTrack.set(null);
		$isPlaying.set(true);
		if ($shuffle.get()) regenerateShuffleOrder();
		return;
	}
	// Song was a past user-queue pop — replay it as a transient user track.
	$currentUserTrack.set(entry.song);
	$currentSource.set("user");
	$isPlaying.set(true);
}

export function togglePlay() {
	if (!$currentSong.get()) return;
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
	const next = !$shuffle.get();
	$shuffle.set(next);
	if (next) regenerateShuffleOrder();
	else $shuffleOrder.set([]);
}

export function cycleRepeat() {
	const m = $repeat.get();
	$repeat.set(m === "off" ? "all" : m === "all" ? "one" : "off");
}

// ─── UI opens ──────────────────────────────────────────────────────────────

export function openNowPlaying() {
	if ($currentSong.get()) $nowPlayingOpen.set(true);
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

// ─── jump / reorder / remove ───────────────────────────────────────────────

export function jumpToContext(index: number) {
	const ctx = $contextQueue.get();
	if (index < 0 || index >= ctx.length) return;
	userTouchedQueue = true;
	$contextIndex.set(index);
	$currentSource.set("context");
	$currentUserTrack.set(null);
	$isPlaying.set(true);
	if ($shuffle.get()) regenerateShuffleOrder();
}

/**
 * Pick a specific user-queue track to play now. Earlier user-queue items are
 * discarded (Spotify "skip to this" behaviour — you've clearly said "not them").
 */
export function jumpToUserQueue(index: number) {
	const user = $userQueue.get();
	if (index < 0 || index >= user.length) return;
	userTouchedQueue = true;
	const song = user[index]!;
	$userQueue.set(user.slice(index + 1));
	$currentUserTrack.set(song);
	$currentSource.set("user");
	$isPlaying.set(true);
}

export function reorderUserQueue(fromIndex: number, toIndex: number) {
	const user = $userQueue.get();
	if (fromIndex === toIndex) return;
	if (fromIndex < 0 || fromIndex >= user.length) return;
	if (toIndex < 0 || toIndex >= user.length) return;
	const copy = user.slice();
	const [moved] = copy.splice(fromIndex, 1);
	if (!moved) return;
	copy.splice(toIndex, 0, moved);
	$userQueue.set(copy);
}

export function removeFromUserQueue(index: number) {
	const user = $userQueue.get();
	if (index < 0 || index >= user.length) return;
	const copy = user.slice();
	copy.splice(index, 1);
	$userQueue.set(copy);
}

/**
 * Insert tracks into the user queue at a specific position (used by the
 * drag-and-drop row targets). Out-of-range → appends.
 */
export function insertIntoUserQueue(songs: Song | Song[], atIndex: number) {
	const list = Array.isArray(songs) ? songs.slice() : [songs];
	if (list.length === 0) return;
	if (!$currentSong.get() && $contextQueue.get().length === 0) {
		playQueue(list, 0);
		return;
	}
	if (!canMutateQueue()) {
		warnCrossServerMutation();
		return;
	}
	userTouchedQueue = true;
	const user = $userQueue.get();
	const at = Math.max(0, Math.min(atIndex, user.length));
	$userQueue.set([...user.slice(0, at), ...list, ...user.slice(at)]);
}

export function removeFromContext(index: number) {
	const ctx = $contextQueue.get();
	if (index < 0 || index >= ctx.length) return;
	const current = $contextIndex.get();
	const wasPlaying = index === current && $currentSource.get() === "context";

	// Drop from shuffle order and reindex.
	if ($shuffle.get()) {
		const reindexed = $shuffleOrder
			.get()
			.filter((i) => i !== index)
			.map((i) => (i > index ? i - 1 : i));
		$shuffleOrder.set(reindexed);
	}

	// Drop queueSources entry.
	const removedId = ctx[index]!.id;
	if ($queueSources.get()[removedId]) {
		const copy = { ...$queueSources.get() };
		delete copy[removedId];
		$queueSources.set(copy);
	}

	const copy = ctx.slice();
	copy.splice(index, 1);

	if (wasPlaying) {
		// Point contextIndex at the slot before the yanked one so playNext
		// advances to what's now at `index` (the former index+1 track).
		$contextIndex.set(index - 1);
		$contextQueue.set(copy);
		playNext();
		return;
	}
	if (index < current) {
		$contextIndex.set(current - 1);
	}
	$contextQueue.set(copy);
}

// ─── legacy aliases kept so external call-sites don't break ────────────────
// Prefer the explicit context/user variants above in new code.

export const $currentIndex = $contextIndex;
export const insertIntoQueue = insertIntoUserQueue;
export const reorderQueue = reorderUserQueue;
export function jumpTo(index: number) {
	jumpToContext(index);
}
export function removeFromQueue(index: number) {
	removeFromContext(index);
}
