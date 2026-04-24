import {
	$currentSong,
	$isPlaying,
	$position,
	$duration,
	$volume,
	$repeat,
	$lyricsMode,
	_seekRequested,
	consumeResumePosition,
	peekNextSong,
	playNext,
	playPrevious,
	seek,
	togglePlay,
} from "../../stores/player";
import type { Song } from "../subsonic";
import type { SubsonicClient } from "../subsonic/client";
import { $queueServer } from "../../stores/servers";
import { recordPlay } from "../../stores/history";
import { notifyTrackEnded } from "../../stores/sleepTimer";
import { clientFor } from "../queries/useActiveClient";
import { $preferences } from "../../stores/preferences";
import { resolveStreamParams } from "./stream-quality";

const SCROBBLE_SUBMIT_SECONDS = 240;

type Mode = "html5" | "webaudio";

function preloadThresholdSeconds(): number {
	return $preferences.get().playback.preloadSeconds;
}

function scrobbleSubmitRatio(): number {
	return $preferences.get().playback.scrobbleThresholdPercent / 100;
}

/**
 * Pick the playback backend for a song. Default is html5 — it streams as it
 * plays, matching user expectation for a music client. The `webaudio` path is
 * opt-in via preferences (trades instant-start for sample-accurate seek by
 * decoding the full file to PCM upfront).
 */
function pickMode(song: Song): Mode {
	const override = $preferences.get().playback.audioBackend;
	if (override === "html5" || override === "webaudio") return override;
	// `song` unused but part of the signature in case a future heuristic wants it.
	void song;
	return "html5";
}

function buildStreamUrl(client: SubsonicClient, songId: string): string {
	return client.streamUrl(songId, resolveStreamParams());
}

class AudioEngine {
	private el: HTMLAudioElement | null = null;
	private preloadEl: HTMLAudioElement | null = null;
	private preloadedUrl: string | null = null;
	private currentSongId: string | null = null;
	private attached = false;
	private scrobbleSubmitted = false;
	private rafHandle: number | null = null;
	private pendingResumeSeek: number | null = null;
	// True between `seeking` and `seeked` events on the HTML5 element. While
	// set, neither rAF nor timeupdate are allowed to overwrite $position —
	// the audio element briefly reports its *old* currentTime during that
	// window, which would otherwise snap the progress bar back and forward.
	private isSeeking = false;

	// Coalesces burst of $currentSong fires (during multi-set store updates
	// like playQueue) into one syncCurrentSong run against the final value.
	private syncPending = false;

	private mode: Mode = "html5";

	// Independent stall detector for the HTML5 path. WebKit has been
	// observed to transition el.ended → true (and stop dispatching
	// timeupdate / pause / ended events) at EOF when the server closes
	// the stream abruptly. Without this poll the UI sees "$isPlaying=true"
	// and a dead progress bar for 20+ seconds until the user notices.
	private stallPoll: ReturnType<typeof setInterval> | null = null;
	private lastPolledTime = -1;
	private stuckFrames = 0;

	// ─── Web Audio state ────────────────────────────────────────────────
	private audioCtx: AudioContext | null = null;
	private gainNode: GainNode | null = null;
	// Currently playing source (null when paused or between tracks).
	private source: AudioBufferSourceNode | null = null;
	// Decoded PCM buffer for the current song. null while decoding or after
	// teardown.
	private waBuffer: AudioBuffer | null = null;
	// audioCtx.currentTime at the moment the current source's .start() was
	// called. Used to compute absolute track position.
	private ctxStartTime = 0;
	// Offset (in seconds) into waBuffer where the current source began
	// playing. Absolute track position = waStartOffset + (audioCtx.currentTime
	// - ctxStartTime) while playing.
	private waStartOffset = 0;
	// Absolute position at last pause. On resume, we create a new source at
	// this offset.
	private waPausedAt = 0;
	// True when we call source.stop() ourselves (seek or pause). The onended
	// handler reads this to distinguish natural end from intentional stop.
	private waStoppedIntentionally = false;
	// Abort controller for the in-flight fetch+decode. Cancels on track switch.
	private waFetchAbort: AbortController | null = null;
	// Bumps on every syncCurrentSong call. Async fetch/decode callbacks check
	// to detect stale requests.
	private waSeq = 0;

	// ─── Preload (Web Audio) state ──────────────────────────────────────
	// Upcoming track's decoded buffer, fetched ~10s before current track end
	// for gapless-ish transitions.
	private preloadSongId: string | null = null;
	private preloadBuffer: AudioBuffer | null = null;
	private preloadAbort: AbortController | null = null;

	// Disposers for subscriptions registered in attach(). We call all of these
	// on re-attach so Vite HMR doesn't accumulate ghost listeners.
	private teardown: Array<() => void> = [];

	// ─── lifecycle ──────────────────────────────────────────────────────

	private detach() {
		for (const dispose of this.teardown) {
			try {
				dispose();
			} catch {}
		}
		this.teardown = [];
		if (this.rafHandle != null) {
			cancelAnimationFrame(this.rafHandle);
			this.rafHandle = null;
		}
		this.stopWebAudio({ intentional: true });
		this.waBuffer = null;
		this.waFetchAbort?.abort();
		this.waFetchAbort = null;
		this.waSeq++;
		this.clearEndedWatchdog();
		this.stopStallPoll();
		this.clearPreload();
		const el = this.el;
		if (el) {
			this.unbindElListeners(el);
			try {
				el.pause();
				el.removeAttribute("src");
				el.load();
			} catch {}
		}
		this.currentSongId = null;
		this.attached = false;
	}

	private bindElListeners(el: HTMLAudioElement) {
		el.addEventListener("timeupdate", this.handleTimeUpdate);
		el.addEventListener("durationchange", this.handleDurationChange);
		el.addEventListener("loadedmetadata", this.handleDurationChange);
		el.addEventListener("play", this.handlePlay);
		el.addEventListener("pause", this.handlePause);
		el.addEventListener("ended", this.handleEndedHtml5);
		el.addEventListener("error", this.handleError);
		el.addEventListener("seeking", this.handleSeeking);
		el.addEventListener("seeked", this.handleSeeked);
	}

	private unbindElListeners(el: HTMLAudioElement) {
		el.removeEventListener("timeupdate", this.handleTimeUpdate);
		el.removeEventListener("durationchange", this.handleDurationChange);
		el.removeEventListener("loadedmetadata", this.handleDurationChange);
		el.removeEventListener("play", this.handlePlay);
		el.removeEventListener("pause", this.handlePause);
		el.removeEventListener("ended", this.handleEndedHtml5);
		el.removeEventListener("error", this.handleError);
		el.removeEventListener("seeking", this.handleSeeking);
		el.removeEventListener("seeked", this.handleSeeked);
	}

	attach(el: HTMLAudioElement) {
		if (this.el === el && this.attached) return;
		if (this.attached) this.detach();
		this.el = el;
		this.attached = true;

		el.preload = "auto";
		el.volume = $volume.get();

		this.bindElListeners(el);

		this.teardown.push(
			$volume.subscribe((v) => {
				if (this.el) this.el.volume = v;
				if (this.gainNode) this.gainNode.gain.value = v;
			}),
		);
		// Debounce $currentSong fires to a microtask so intermediate states
		// during multi-set store updates (playQueue does 4+ .set calls in
		// sequence; the computed briefly returns the wrong song when the new
		// $contextQueue has landed but $contextIndex hasn't) collapse into a
		// single sync against the *final* value. Without this, we'd run
		// syncCurrentSong for a transient wrong song, issue el.src=... +
		// el.load(), then immediately repeat for the correct song. WebKit
		// sometimes drops the subsequent play() intent when load() is called
		// back-to-back, leaving the UI on a paused state the user can't
		// unpause without switching tracks.
		this.teardown.push(
			$currentSong.listen(() => {
				if (this.syncPending) return;
				this.syncPending = true;
				queueMicrotask(() => {
					this.syncPending = false;
					this.syncCurrentSong();
				});
			}),
		);
		this.teardown.push(
			$isPlaying.listen((playing) => {
				this.syncPlayState(playing);
				this.updateMediaSessionPlayback(playing);
				if (playing) this.startStallPoll();
				else this.stopStallPoll();
			}),
		);
		this.teardown.push(
			_seekRequested.listen((t) => {
				if (t == null) return;
				this.applySeek(t);
				_seekRequested.set(null);
			}),
		);

		this.teardown.push($lyricsMode.listen(() => this.syncPositionLoop()));

		this.setupMediaSessionHandlers();

		const resume = consumeResumePosition();
		if (resume > 0 && $currentSong.get()) {
			this.pendingResumeSeek = resume;
		}

		this.syncCurrentSong();
	}

	// ─── position publishing ────────────────────────────────────────────

	private publishPosition(t: number) {
		if (this.isSeeking) return;
		const current = $position.get();
		// Reject spurious backward jumps from a stale audio element tick.
		// Always allow when paused or ended (sync resumes below).
		if (
			t < current - 0.3 &&
			this.mode === "html5" &&
			this.el &&
			!this.el.paused &&
			!this.el.ended
		) {
			return;
		}
		// Clamp forward excess to duration so the UI never displays e.g.
		// "3:15 / 3:00". A small slack (0.1s) avoids bouncing around exactly
		// at the end for tracks that tick ever so slightly past el.duration
		// in their final sample.
		const d = $duration.get();
		if (d > 0 && t > d + 0.1) t = d;
		$position.set(t);
	}

	private currentPositionSeconds(): number {
		if (this.mode === "webaudio") {
			if (!this.audioCtx || !this.source) return this.waPausedAt;
			return this.waStartOffset + (this.audioCtx.currentTime - this.ctxStartTime);
		}
		return this.el?.currentTime ?? 0;
	}

	private handleTimeUpdate = () => {
		if (!this.el || this.mode !== "html5") return;
		this.publishPosition(this.el.currentTime);
		this.updateMediaSessionPosition();
		this.maybePreloadNext();
		this.maybeSubmitScrobble();
		// Seen in the wild: WebKit leaves the element in (ended=true,
		// paused=false) without dispatching the `ended` event at all.
		// timeupdate is still fired once more when el.ended flips, so this
		// catches it where the event listener doesn't.
		if (this.el.ended) {
			this.clearEndedWatchdog();
			this.onTrackEnded();
		}
	};

	private positionTick = () => {
		this.rafHandle = null;
		if (!this.attached) return;
		const t = this.currentPositionSeconds();
		this.publishPosition(t);
		if (this.mode === "webaudio") {
			this.updateMediaSessionPosition();
			this.maybePreloadNext();
			this.maybeSubmitScrobble();
		}
		if (this.shouldRunPositionLoop()) {
			this.rafHandle = requestAnimationFrame(this.positionTick);
		}
	};

	private shouldRunPositionLoop(): boolean {
		if (!this.attached) return false;
		if (this.mode === "webaudio") return this.source != null;
		if (!this.el) return false;
		if (this.el.paused || this.el.ended) return false;
		// HTML5 mode only needs rAF when lyrics panel needs sub-frame accuracy.
		return $lyricsMode.get() !== "off";
	}

	private syncPositionLoop() {
		const shouldRun = this.shouldRunPositionLoop();
		if (shouldRun) {
			if (this.rafHandle == null) {
				this.rafHandle = requestAnimationFrame(this.positionTick);
			}
		} else if (this.rafHandle != null) {
			cancelAnimationFrame(this.rafHandle);
			this.rafHandle = null;
		}
	}

	// ─── HTML5 audio event handlers ─────────────────────────────────────

	private handleSeeking = () => {
		if (this.mode !== "html5") return;
		this.isSeeking = true;
	};

	private handleSeeked = () => {
		if (this.mode !== "html5") return;
		this.isSeeking = false;
		if (!this.el) return;
		$position.set(this.el.currentTime);
	};

	private handleDurationChange = () => {
		if (!this.el || this.mode !== "html5") return;
		const d = this.el.duration;
		if (Number.isFinite(d) && d > 0 && this.el.readyState >= 1) {
			// Once metadata is loaded, el.duration is authoritative — even if
			// it disagrees with the Subsonic-reported song.duration (integer
			// seconds, occasionally drifting by ~1s or more for VBR sources
			// where the server estimated from bitrate). Without this, $duration
			// stays at the metadata value and $position ticks past it,
			// displaying "3:15 / 3:00" when the real file is 3:20.
			if (Math.abs(d - $duration.get()) > 0.1) {
				$duration.set(d);
			}
			if (this.pendingResumeSeek != null) {
				const pos = Math.max(0, Math.min(this.pendingResumeSeek, d - 1));
				this.pendingResumeSeek = null;
				this.el.currentTime = pos;
				$position.set(pos);
			}
			this.updateMediaSessionPosition();
		}
	};

	private handlePlay = () => {
		if (this.mode !== "html5") return;
		if (!$isPlaying.get()) $isPlaying.set(true);
		this.syncPositionLoop();
	};

	private handlePause = () => {
		if (this.mode !== "html5") return;
		// Every pause event reaching this handler is involuntary. User and
		// sleep-timer pauses flip $isPlaying first and then call el.pause(),
		// so by the time we run, $isPlaying is already false and there's
		// nothing to propagate. Involuntary pauses mean either:
		//   - natural end of track  → handleEndedHtml5 will advance
		//   - stream interruption   → handleError will advance if near end
		//   - abrupt EOF w/o ended  → watchdog below will advance
		// Flipping $isPlaying=false here would race onTrackEnded's play-intent
		// gate and strand the queue on "paused" with nothing next. So we
		// deliberately do nothing to $isPlaying — just arm the watchdog.
		this.armEndedWatchdog();
		this.syncPositionLoop();
	};

	private handleEndedHtml5 = () => {
		if (this.mode !== "html5") return;
		this.clearEndedWatchdog();
		this.onTrackEnded();
	};

	private handleError = () => {
		if (this.mode !== "html5") return;
		// Network hiccup right at EOF (common when Navidrome is behind a
		// reverse proxy that closes the connection before the <audio>
		// element has finished reading the last frame) would otherwise flip
		// $isPlaying off and stall the queue. If we're effectively at the
		// end of the track, treat it as a natural end and advance.
		if (this.isNearTrackEnd()) {
			this.clearEndedWatchdog();
			this.onTrackEnded();
			return;
		}
		$isPlaying.set(false);
	};

	// ─── end-of-track detection / watchdog ──────────────────────────────

	private isNearTrackEnd(): boolean {
		const el = this.el;
		if (!el) return false;
		if (el.ended) return true;
		const d = el.duration;
		if (!Number.isFinite(d) || d <= 0) return false;
		return d - el.currentTime < 0.75;
	}

	private endedWatchdog: ReturnType<typeof setTimeout> | null = null;

	/**
	 * WebKit occasionally fires `pause` at EOF without following up with
	 * `ended` (seen when streams end without a clean close, e.g. Navidrome
	 * behind a reverse proxy), or pauses mid-track on a transient network
	 * hiccup. We arm this from handlePause. If `ended` lands first we
	 * cancel; otherwise we inspect state 400ms later and either synthesise
	 * end-of-track or try to resume playback.
	 */
	private armEndedWatchdog() {
		if (this.endedWatchdog != null) return;
		this.endedWatchdog = setTimeout(() => {
			this.endedWatchdog = null;
			if (this.mode !== "html5") return;
			if (!this.el) return;
			if (!this.el.paused) return;
			if (!$isPlaying.get()) return;
			if (this.isNearTrackEnd()) {
				this.onTrackEnded();
				return;
			}
			// Mid-track involuntary pause — user still wants to play but the
			// element stopped. Recovery re-assigns src and retries play(); if
			// it rejects again it flips $isPlaying=false itself.
			void this.playHtml5WithRecovery();
		}, 400);
	}

	private clearEndedWatchdog() {
		if (this.endedWatchdog != null) {
			clearTimeout(this.endedWatchdog);
			this.endedWatchdog = null;
		}
	}

	private startStallPoll() {
		if (this.stallPoll != null) return;
		this.lastPolledTime = -1;
		this.stuckFrames = 0;
		this.stallPoll = setInterval(() => this.stallTick(), 500);
	}

	private stopStallPoll() {
		if (this.stallPoll != null) {
			clearInterval(this.stallPoll);
			this.stallPoll = null;
		}
		this.lastPolledTime = -1;
		this.stuckFrames = 0;
	}

	private stallTick() {
		if (this.mode !== "html5") return;
		const el = this.el;
		if (!el) return;
		// ended flag set but no ended event: advance immediately.
		if (el.ended) {
			this.clearEndedWatchdog();
			this.onTrackEnded();
			return;
		}
		// Audio element paused itself and we're near end: same as above but
		// WebKit hasn't set ended yet (streaming / last buffer chunk).
		if (el.paused && this.isNearTrackEnd()) {
			this.clearEndedWatchdog();
			this.onTrackEnded();
			return;
		}
		// Currently-not-paused-not-ended but currentTime stuck near end: stream
		// died; treat as end-of-track after 3 consecutive stuck polls (~1.5s).
		if (!el.paused && this.isNearTrackEnd()) {
			if (el.currentTime === this.lastPolledTime) {
				this.stuckFrames++;
				if (this.stuckFrames >= 3) {
					this.stuckFrames = 0;
					this.onTrackEnded();
					return;
				}
			} else {
				this.stuckFrames = 0;
			}
		} else {
			this.stuckFrames = 0;
		}
		this.lastPolledTime = el.currentTime;
	}

	// ─── shared end-of-track logic ──────────────────────────────────────

	private onTrackEnded() {
		this.syncPositionLoop();
		const song = $currentSong.get();
		if (song && !this.scrobbleSubmitted) {
			this.submitScrobbleNow(song.id);
		}
		if (song) notifyTrackEnded(song.id);
		// Sleep timer may have paused playback — don't auto-advance.
		if (!$isPlaying.get()) return;
		if ($repeat.get() === "one") {
			this.scrobbleSubmitted = false;
			if (this.mode === "webaudio" && this.waBuffer) {
				this.startWebAudioFrom(0);
				$position.set(0);
			} else if (this.el) {
				this.el.currentTime = 0;
				this.el.play().catch(() => {});
			}
			return;
		}
		playNext();
	}

	// ─── main: react to $currentSong change ─────────────────────────────

	private syncCurrentSong() {
		const song = $currentSong.get();
		if (!this.el) return;

		if (!song) {
			this.currentSongId = null;
			this.stopWebAudio({ intentional: true });
			this.waBuffer = null;
			this.waFetchAbort?.abort();
			this.waFetchAbort = null;
			this.waSeq++;
			this.el.pause();
			this.el.removeAttribute("src");
			this.el.load();
			$position.set(0);
			$duration.set(0);
			this.mode = "html5";
			this.syncPositionLoop();
			return;
		}
		if (song.id === this.currentSongId) return;

		const server = $queueServer.get();
		// Bail WITHOUT recording currentSongId: if we record it here and the
		// server-id lands in a later tick, the subsequent $currentSong fire
		// won't re-trigger and nothing plays.
		if (!server) return;

		this.currentSongId = song.id;
		this.scrobbleSubmitted = false;
		this.isSeeking = false;
		this.clearEndedWatchdog();
		// Reset stall counters so a transition is never flagged as stuck.
		this.lastPolledTime = -1;
		this.stuckFrames = 0;

		// Abort any in-flight Web Audio work for the previous track.
		this.stopWebAudio({ intentional: true });
		this.waBuffer = null;
		this.waFetchAbort?.abort();
		this.waFetchAbort = null;
		const seq = ++this.waSeq;

		const client = clientFor(server);
		const nextMode = pickMode(song);
		this.mode = nextMode;

		$duration.set(song.duration ?? 0);

		this.sendScrobble(client, song.id, false);
		recordPlay(song);
		this.updateMediaSessionMetadata(song, client);

		const initialOffset = this.pendingResumeSeek ?? 0;

		if (nextMode === "html5") {
			const url = buildStreamUrl(client, song.id);

			// Fast path: if this URL was preloaded, swap the preloaded element
			// in as the main one. Its buffer is already warm so play() resolves
			// near-instantly, cutting the usual 1-2s stream-start latency.
			if (
				this.preloadedUrl === url &&
				this.preloadEl &&
				this.el &&
				this.preloadEl !== this.el
			) {
				const oldEl = this.el;
				const newEl = this.preloadEl;
				this.preloadEl = null;
				this.preloadedUrl = null;

				this.unbindElListeners(oldEl);
				try {
					oldEl.pause();
					oldEl.removeAttribute("src");
					oldEl.load();
				} catch {}

				this.el = newEl;
				newEl.volume = $volume.get();
				this.bindElListeners(newEl);

				$position.set(initialOffset);
				if ($isPlaying.get()) void this.playHtml5WithRecovery();
				this.syncPositionLoop();
				return;
			}

			// Slow path: no preload hit, fetch from scratch.
			// Always pause before swapping src. On html5→html5 rapid track
			// switches we used to rely on src= + load() aborting the previous
			// resource, but if the user double-clicks quickly WebKit has been
			// observed to keep the old stream decoding briefly — audible as
			// both tracks playing together. Explicit pause() stops the audio
			// output synchronously before we replace the source.
			this.el.pause();
			this.clearHtml5Preload();
			this.el.src = url;
			this.el.load();
			$position.set(initialOffset);
			// pendingResumeSeek is consumed by handleDurationChange (direct
			// native seek once duration metadata arrives).
			if ($isPlaying.get()) void this.playHtml5WithRecovery();
			this.syncPositionLoop();
			return;
		}

		// Web Audio path.
		// Silence the HTML5 element so it isn't holding a buffering stream.
		this.el.pause();
		this.el.removeAttribute("src");
		this.el.load();
		$position.set(initialOffset);

		// If we preloaded this song's buffer already, use it.
		if (this.preloadSongId === song.id && this.preloadBuffer) {
			this.waBuffer = this.preloadBuffer;
			this.preloadBuffer = null;
			this.preloadSongId = null;
			this.pendingResumeSeek = null;
			this.waPausedAt = initialOffset;
			if ($isPlaying.get()) {
				this.startWebAudioFrom(initialOffset);
			}
			this.syncPositionLoop();
			return;
		}

		void this.fetchAndDecode(client, song.id, seq).then((buf) => {
			if (seq !== this.waSeq) return;
			if (!buf) {
				$isPlaying.set(false);
				return;
			}
			this.waBuffer = buf;
			// Decoded buffer duration is sample-accurate — trust it over the
			// Subsonic metadata which can drift (esp. VBR MP3).
			if (Math.abs(buf.duration - $duration.get()) > 0.1) {
				$duration.set(buf.duration);
			}
			this.pendingResumeSeek = null;
			this.waPausedAt = initialOffset;
			if ($isPlaying.get()) {
				this.startWebAudioFrom(initialOffset);
			}
			this.syncPositionLoop();
		});
	}

	// ─── Web Audio: fetch + decode ──────────────────────────────────────

	private ensureAudioContext(): AudioContext | null {
		if (this.audioCtx) return this.audioCtx;
		const Ctor =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext })
				.webkitAudioContext;
		if (!Ctor) return null;
		const ctx = new Ctor();
		this.audioCtx = ctx;
		const gain = ctx.createGain();
		gain.gain.value = $volume.get();
		gain.connect(ctx.destination);
		this.gainNode = gain;
		return ctx;
	}

	private async fetchAndDecode(
		client: SubsonicClient,
		songId: string,
		seq: number,
	): Promise<AudioBuffer | null> {
		const ctx = this.ensureAudioContext();
		if (!ctx) return null;
		const url = buildStreamUrl(client, songId);
		const controller = new AbortController();
		this.waFetchAbort = controller;
		try {
			const res = await fetch(url, {
				credentials: "omit",
				signal: controller.signal,
			});
			if (!res.ok) return null;
			const bytes = await res.arrayBuffer();
			if (seq !== this.waSeq) return null;
			// decodeAudioData can reject on malformed files; caller handles null.
			const buf = await ctx.decodeAudioData(bytes.slice(0));
			if (seq !== this.waSeq) return null;
			return buf;
		} catch {
			return null;
		} finally {
			if (this.waFetchAbort === controller) this.waFetchAbort = null;
		}
	}

	// ─── Web Audio: playback control ────────────────────────────────────

	private startWebAudioFrom(offsetSec: number) {
		const ctx = this.audioCtx;
		const gain = this.gainNode;
		const buffer = this.waBuffer;
		if (!ctx || !gain || !buffer) return;

		this.stopWebAudio({ intentional: true });

		// Resume the context if it was auto-suspended (power save).
		if (ctx.state === "suspended") {
			void ctx.resume();
		}

		const offset = Math.max(0, Math.min(offsetSec, buffer.duration));
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		src.connect(gain);
		this.waStartOffset = offset;
		this.ctxStartTime = ctx.currentTime;
		this.waStoppedIntentionally = false;
		src.onended = () => {
			const wasIntentional = this.waStoppedIntentionally;
			this.waStoppedIntentionally = false;
			if (this.source === src) this.source = null;
			if (wasIntentional) return;
			// Natural end of buffer — treat as track ended.
			this.waPausedAt = buffer.duration;
			$position.set(buffer.duration);
			this.onTrackEnded();
		};
		src.start(0, offset);
		this.source = src;
		this.waPausedAt = offset;
		this.syncPositionLoop();
	}

	private stopWebAudio(opts: { intentional: boolean }) {
		const src = this.source;
		if (!src) return;
		this.source = null;
		this.waStoppedIntentionally = opts.intentional;
		// Separate try/catch per step: stop() throws if the node was already
		// stopped, which would otherwise skip disconnect() and leave the
		// routing graph live — audibly it's as if the old track kept playing
		// even though the source is "done".
		try { src.onended = null; } catch {}
		try { src.stop(0); } catch {}
		try { src.disconnect(); } catch {}
	}

	private pauseWebAudio() {
		if (!this.source) return;
		this.waPausedAt = this.currentPositionSeconds();
		this.stopWebAudio({ intentional: true });
		this.syncPositionLoop();
	}

	private resumeWebAudio() {
		if (!this.waBuffer) return;
		const at = Math.min(this.waPausedAt, this.waBuffer.duration);
		this.startWebAudioFrom(at);
	}

	// ─── seek dispatcher ────────────────────────────────────────────────

	private applySeek(t: number) {
		const target = Math.max(0, t);
		if (!this.currentSongId) {
			this.pendingResumeSeek = target;
			$position.set(target);
			return;
		}
		if (this.mode === "webaudio") {
			if (!this.waBuffer) {
				// Decode still in flight — remember target.
				this.pendingResumeSeek = target;
				this.waPausedAt = target;
				$position.set(target);
				return;
			}
			const clamped = Math.min(target, this.waBuffer.duration);
			this.waPausedAt = clamped;
			$position.set(clamped);
			if ($isPlaying.get()) {
				this.startWebAudioFrom(clamped);
			}
			return;
		}
		// HTML5 seek.
		if (!this.el) return;
		this.isSeeking = true;
		this.el.currentTime = target;
	}

	// ─── play/pause sync ────────────────────────────────────────────────

	private syncPlayState(playing: boolean) {
		if (this.mode === "webaudio") {
			if (playing) {
				if (!this.waBuffer) {
					// Decode in flight — will auto-start when it resolves.
					return;
				}
				if (!this.source) this.resumeWebAudio();
			} else {
				if (this.source) this.pauseWebAudio();
			}
			return;
		}
		if (!this.el || !this.currentSongId) return;
		if (!this.el.src) return;
		if (playing && this.el.paused) {
			void this.playHtml5WithRecovery();
		} else if (!playing && !this.el.paused) {
			this.el.pause();
		}
	}

	private async playHtml5WithRecovery(): Promise<void> {
		if (!this.el || !this.currentSongId) return;
		try {
			await this.el.play();
			return;
		} catch {}
		const server = $queueServer.get();
		const song = $currentSong.get();
		if (!this.el || !server || !song || song.id !== this.currentSongId) {
			$isPlaying.set(false);
			return;
		}
		try {
			const client = clientFor(server);
			this.el.src = buildStreamUrl(client, song.id);
			this.el.load();
			if (this.pendingResumeSeek == null) {
				const pos = $position.get();
				if (pos > 0) this.pendingResumeSeek = pos;
			}
			await this.el.play();
		} catch {
			$isPlaying.set(false);
		}
	}

	// ─── scrobble ───────────────────────────────────────────────────────

	private maybeSubmitScrobble() {
		if (this.scrobbleSubmitted) return;
		const position = this.currentPositionSeconds();
		let duration: number;
		if (this.mode === "webaudio") {
			duration = this.waBuffer?.duration ?? $duration.get();
		} else {
			duration = this.el?.duration ?? $duration.get();
		}
		if (!Number.isFinite(duration) || duration <= 0) return;
		const halfway = duration * scrobbleSubmitRatio();
		if (position >= SCROBBLE_SUBMIT_SECONDS || position >= halfway) {
			const songId = this.currentSongId;
			if (!songId) return;
			this.submitScrobbleNow(songId);
		}
	}

	private submitScrobbleNow(songId: string) {
		this.scrobbleSubmitted = true;
		const server = $queueServer.get();
		if (!server) return;
		this.sendScrobble(clientFor(server), songId, true);
	}

	private sendScrobble(
		client: SubsonicClient,
		songId: string,
		submission: boolean,
	) {
		client
			.call("scrobble", {
				id: songId,
				submission,
				time: Date.now(),
			})
			.catch(() => {});
	}

	// ─── Media Session ──────────────────────────────────────────────────

	private setupMediaSessionHandlers() {
		if (!("mediaSession" in navigator)) return;
		const ms = navigator.mediaSession;
		try {
			ms.setActionHandler("play", () => {
				if (!$isPlaying.get()) togglePlay();
			});
			ms.setActionHandler("pause", () => {
				if ($isPlaying.get()) togglePlay();
			});
			ms.setActionHandler("previoustrack", () => playPrevious());
			ms.setActionHandler("nexttrack", () => playNext());
			ms.setActionHandler("seekto", (e) => {
				if (typeof e.seekTime === "number") seek(e.seekTime);
			});
			ms.setActionHandler("seekbackward", (e) => {
				const pos = $position.get();
				seek(Math.max(0, pos - (e.seekOffset ?? 10)));
			});
			ms.setActionHandler("seekforward", (e) => {
				const pos = $position.get();
				seek(pos + (e.seekOffset ?? 10));
			});
		} catch {}
	}

	private updateMediaSessionMetadata(song: Song, client: SubsonicClient) {
		if (!("mediaSession" in navigator)) return;
		const artwork: MediaImage[] = [];
		const art96 = client.coverArtUrl(song.coverArt, 96);
		const art256 = client.coverArtUrl(song.coverArt, 256);
		const art512 = client.coverArtUrl(song.coverArt, 512);
		if (art96) artwork.push({ src: art96, sizes: "96x96", type: "image/jpeg" });
		if (art256) artwork.push({ src: art256, sizes: "256x256", type: "image/jpeg" });
		if (art512) artwork.push({ src: art512, sizes: "512x512", type: "image/jpeg" });
		try {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: song.title,
				artist: song.artist ?? "",
				album: song.album ?? "",
				artwork,
			});
		} catch {}
	}

	private updateMediaSessionPlayback(playing: boolean) {
		if (!("mediaSession" in navigator)) return;
		if ($currentSong.get()) {
			navigator.mediaSession.playbackState = playing ? "playing" : "paused";
		} else {
			navigator.mediaSession.playbackState = "none";
		}
	}

	private updateMediaSessionPosition() {
		if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
		let duration: number;
		if (this.mode === "webaudio") {
			duration = this.waBuffer?.duration ?? $duration.get();
		} else {
			if (!this.el) return;
			duration = Number.isFinite(this.el.duration) ? this.el.duration : $duration.get();
		}
		if (!Number.isFinite(duration) || duration <= 0) return;
		const position = Math.min(this.currentPositionSeconds(), duration);
		try {
			navigator.mediaSession.setPositionState({
				duration,
				position,
				playbackRate: 1,
			});
		} catch {}
	}

	// ─── preload next track ─────────────────────────────────────────────

	private maybePreloadNext() {
		const duration =
			this.mode === "webaudio"
				? this.waBuffer?.duration ?? 0
				: (this.el?.duration ?? 0);
		if (!Number.isFinite(duration) || duration <= 0) return;
		const remaining = duration - this.currentPositionSeconds();
		if (remaining > preloadThresholdSeconds()) return;

		const next = peekNextSong();
		if (!next) return;

		if (pickMode(next) === "webaudio") {
			this.maybePreloadWebAudio(next);
		} else {
			this.maybePreloadHtml5(next);
		}
	}

	private maybePreloadHtml5(next: Song) {
		const server = $queueServer.get();
		if (!server) return;
		const url = buildStreamUrl(clientFor(server), next.id);
		if (url === this.preloadedUrl) return;
		this.clearHtml5Preload();
		this.preloadedUrl = url;
		const a = new Audio();
		a.preload = "auto";
		a.src = url;
		a.load();
		this.preloadEl = a;
	}

	private maybePreloadWebAudio(next: Song) {
		if (this.preloadSongId === next.id) return;
		const server = $queueServer.get();
		if (!server) return;
		const ctx = this.ensureAudioContext();
		if (!ctx) return;
		this.clearWebAudioPreload();
		this.preloadSongId = next.id;
		const controller = new AbortController();
		this.preloadAbort = controller;
		const client = clientFor(server);
		const url = buildStreamUrl(client, next.id);
		(async () => {
			try {
				const res = await fetch(url, {
					credentials: "omit",
					signal: controller.signal,
				});
				if (!res.ok) throw new Error("preload fetch failed");
				const bytes = await res.arrayBuffer();
				if (this.preloadAbort !== controller) return;
				const buf = await ctx.decodeAudioData(bytes.slice(0));
				if (this.preloadAbort !== controller) return;
				this.preloadBuffer = buf;
			} catch {
				if (this.preloadSongId === next.id) {
					this.preloadSongId = null;
				}
			} finally {
				if (this.preloadAbort === controller) this.preloadAbort = null;
			}
		})();
	}

	private clearHtml5Preload() {
		if (this.preloadEl) {
			// Pause in case WebKit decided to start playback (we only set
			// src, never call play(), but the element still holds a live
			// resource that can contribute to the output graph).
			try { this.preloadEl.pause(); } catch {}
			this.preloadEl.src = "";
			this.preloadEl.removeAttribute("src");
			try { this.preloadEl.load(); } catch {}
			this.preloadEl = null;
		}
		this.preloadedUrl = null;
	}

	private clearWebAudioPreload() {
		this.preloadAbort?.abort();
		this.preloadAbort = null;
		this.preloadBuffer = null;
		this.preloadSongId = null;
	}

	private clearPreload() {
		this.clearHtml5Preload();
		this.clearWebAudioPreload();
	}

	// ─── debug snapshot ─────────────────────────────────────────────────

	getDebugSnapshot(): Record<string, unknown> {
		const el = this.el;
		return {
			mode: this.mode,
			currentSongId: this.currentSongId,
			$isPlaying: $isPlaying.get(),
			$position: round3($position.get()),
			$duration: round3($duration.get()),
			isSeeking: this.isSeeking,
			pendingResumeSeek: this.pendingResumeSeek,
			scrobbleSubmitted: this.scrobbleSubmitted,
			endedWatchdog: this.endedWatchdog != null,
			syncPending: this.syncPending,
			html5: el
				? {
						src: el.src ? `${el.src.slice(0, 80)}${el.src.length > 80 ? "…" : ""}` : null,
						currentTime: round3(el.currentTime),
						duration: Number.isFinite(el.duration) ? round3(el.duration) : String(el.duration),
						paused: el.paused,
						ended: el.ended,
						readyState: el.readyState,
						networkState: el.networkState,
						buffered: bufferedRanges(el.buffered),
						error: el.error ? { code: el.error.code, message: el.error.message } : null,
					}
				: null,
			webaudio: {
				hasCtx: this.audioCtx != null,
				ctxState: this.audioCtx?.state ?? null,
				ctxTime: this.audioCtx ? round3(this.audioCtx.currentTime) : null,
				hasBuffer: this.waBuffer != null,
				bufferDuration: this.waBuffer ? round3(this.waBuffer.duration) : null,
				hasSource: this.source != null,
				waStartOffset: round3(this.waStartOffset),
				ctxStartTime: round3(this.ctxStartTime),
				waPausedAt: round3(this.waPausedAt),
			},
			preload: {
				html5Url: this.preloadedUrl
					? `${this.preloadedUrl.slice(0, 80)}${this.preloadedUrl.length > 80 ? "…" : ""}`
					: null,
				webaudioSongId: this.preloadSongId,
				webaudioBufferLoaded: this.preloadBuffer != null,
			},
			buildId: __BUILD_ID__,
			userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
		};
	}
}

function round3(n: number): number {
	if (!Number.isFinite(n)) return n;
	return Math.round(n * 1000) / 1000;
}

function bufferedRanges(b: TimeRanges): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (let i = 0; i < b.length; i++) {
		out.push([round3(b.start(i)), round3(b.end(i))]);
	}
	return out;
}

export const audioEngine = new AudioEngine();

// The audio engine carries a lot of lifecycle state. Opt out of HMR — any
// edit triggers a full reload so we start clean.
if (import.meta.hot) {
	import.meta.hot.decline();
	import.meta.hot.dispose(() => {
		(audioEngine as unknown as { detach: () => void }).detach();
	});
}
