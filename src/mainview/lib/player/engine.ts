import {
	$currentSong,
	$currentIndex,
	$queue,
	$shuffle,
	$isPlaying,
	$position,
	$duration,
	$volume,
	$repeat,
	$lyricsMode,
	_seekRequested,
	consumeResumePosition,
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

const PRELOAD_THRESHOLD_SECONDS = 10;
const SCROBBLE_SUBMIT_SECONDS = 240;
const SCROBBLE_SUBMIT_RATIO = 0.5;

class AudioEngine {
	private el: HTMLAudioElement | null = null;
	private preloadEl: HTMLAudioElement | null = null;
	private preloadedUrl: string | null = null;
	private currentSongId: string | null = null;
	private attached = false;
	private scrobbleSubmitted = false;
	private rafHandle: number | null = null;
	private pendingResumeSeek: number | null = null;
	// True between `seeking` and `seeked` events. While set, neither rAF nor
	// timeupdate are allowed to overwrite $position — the audio element briefly
	// reports its *old* currentTime during that window, which would otherwise
	// snap the progress bar (and the lyrics active-line) back to where we came
	// from and then forward again.
	private isSeeking = false;
	// Disposers for subscriptions registered in attach(). We call all of these
	// on re-attach so Vite HMR doesn't accumulate ghost listeners that each
	// write to $position (the cause of the progress bar jumping left/right).
	private teardown: Array<() => void> = [];

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
		const el = this.el;
		if (el) {
			el.removeEventListener("timeupdate", this.handleTimeUpdate);
			el.removeEventListener("durationchange", this.handleDurationChange);
			el.removeEventListener("loadedmetadata", this.handleDurationChange);
			el.removeEventListener("play", this.handlePlay);
			el.removeEventListener("pause", this.handlePause);
			el.removeEventListener("ended", this.handleEnded);
			el.removeEventListener("error", this.handleError);
			el.removeEventListener("seeking", this.handleSeeking);
			el.removeEventListener("seeked", this.handleSeeked);
			// Silence the previous element before letting it go. If Solid HMR
			// spawned a new <audio> the old one is still in the document with
			// an active src — without this it would keep streaming alongside
			// the new one, producing two tracks at once.
			try {
				el.pause();
				el.removeAttribute("src");
				el.load();
			} catch {}
		}
		this.currentSongId = null;
		this.attached = false;
	}

	attach(el: HTMLAudioElement) {
		if (this.el === el && this.attached) return;
		// Fully tear down any previous attachment — event listeners AND
		// nanostore subscriptions — before wiring the new element. Without
		// this, an HMR reload would leave the old subscriptions writing into
		// $position alongside the new ones, producing the visible jitter.
		if (this.attached) this.detach();
		this.el = el;
		this.attached = true;

		el.preload = "auto";
		el.volume = $volume.get();

		el.addEventListener("timeupdate", this.handleTimeUpdate);
		el.addEventListener("durationchange", this.handleDurationChange);
		el.addEventListener("loadedmetadata", this.handleDurationChange);
		el.addEventListener("play", this.handlePlay);
		el.addEventListener("pause", this.handlePause);
		el.addEventListener("ended", this.handleEnded);
		el.addEventListener("error", this.handleError);
		el.addEventListener("seeking", this.handleSeeking);
		el.addEventListener("seeked", this.handleSeeked);

		this.teardown.push(
			$volume.subscribe((v) => {
				if (this.el) this.el.volume = v;
			}),
		);
		this.teardown.push($currentSong.listen(() => this.syncCurrentSong()));
		this.teardown.push(
			$isPlaying.listen((playing) => {
				this.syncPlayState(playing);
				this.updateMediaSessionPlayback(playing);
			}),
		);
		this.teardown.push(
			_seekRequested.listen((t) => {
				if (t == null || !this.el) return;
				// Set the guard synchronously — the `seeking` event is async,
				// and any rAF/timeupdate tick in the gap would otherwise stomp
				// over our requested position with the pre-seek currentTime.
				this.isSeeking = true;
				this.el.currentTime = t;
				_seekRequested.set(null);
			}),
		);

		// Run the high-resolution position loop only when the lyrics view is
		// actually open — it's the only consumer that needs sub-250ms accuracy.
		// Everywhere else (progress bar, scrobble, preload) is fine with the
		// ~4Hz timeupdate signal, so we avoid burning rAF cycles in the common
		// "lyrics closed" case.
		this.teardown.push(
			$lyricsMode.listen(() => this.syncPositionLoop()),
		);

		this.setupMediaSessionHandlers();

		const resume = consumeResumePosition();
		if (resume > 0 && $currentSong.get()) {
			this.pendingResumeSeek = resume;
		}

		this.syncCurrentSong();
	}

	/**
	 * Single point of truth for writes to $position during playback. Rejects
	 * spurious backward jumps (more than 300ms behind the current store value)
	 * when not seeking — this catches ghost-writer races that sometimes survive
	 * HMR reloads or can occur if the audio element briefly reports a stale
	 * currentTime right after a src change.
	 */
	private publishPosition(t: number) {
		if (this.isSeeking) return;
		const current = $position.get();
		if (t < current - 0.3 && this.el && !this.el.paused && !this.el.ended) {
			return;
		}
		$position.set(t);
	}

	private handleTimeUpdate = () => {
		if (!this.el) return;
		// Base position updates (~4Hz from timeupdate) are enough for the
		// progress bar and side-effects. The rAF loop only runs when synced
		// lyrics need sub-frame accuracy, so we always keep timeupdate wired
		// as the cheap default.
		this.publishPosition(this.el.currentTime);
		this.updateMediaSessionPosition();
		this.maybePreloadNext();
		this.maybeSubmitScrobble();
	};

	private positionTick = () => {
		this.rafHandle = null;
		if (!this.el) return;
		this.publishPosition(this.el.currentTime);
		if (!this.el.paused && !this.el.ended) {
			this.rafHandle = requestAnimationFrame(this.positionTick);
		}
	};

	private handleSeeking = () => {
		this.isSeeking = true;
	};

	private handleSeeked = () => {
		this.isSeeking = false;
		// After a seek, el.currentTime is authoritative — bypass the monotonic
		// guard so we honour backward seeks too.
		if (this.el) $position.set(this.el.currentTime);
	};

	private syncPositionLoop() {
		const shouldRun =
			this.el != null &&
			!this.el.paused &&
			!this.el.ended &&
			$lyricsMode.get() !== "off";
		if (shouldRun) {
			if (this.rafHandle == null) {
				this.rafHandle = requestAnimationFrame(this.positionTick);
			}
		} else if (this.rafHandle != null) {
			cancelAnimationFrame(this.rafHandle);
			this.rafHandle = null;
		}
	}

	private handleDurationChange = () => {
		if (!this.el) return;
		const d = this.el.duration;
		if (Number.isFinite(d) && d > 0) {
			$duration.set(d);
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
		if (!$isPlaying.get()) $isPlaying.set(true);
		this.syncPositionLoop();
	};

	private handlePause = () => {
		if ($isPlaying.get()) $isPlaying.set(false);
		this.syncPositionLoop();
	};

	private handleEnded = () => {
		this.syncPositionLoop();
		const song = $currentSong.get();
		if (song && !this.scrobbleSubmitted) {
			this.submitScrobbleNow(song.id);
		}
		if (song) notifyTrackEnded(song.id);
		// If the sleep-timer just paused playback, don't auto-advance.
		if (!$isPlaying.get()) return;
		if ($repeat.get() === "one") {
			if (this.el) {
				this.el.currentTime = 0;
				this.scrobbleSubmitted = false;
				this.el.play().catch(() => {});
			}
			return;
		}
		playNext();
	};

	private handleError = () => {
		$isPlaying.set(false);
	};

	private syncCurrentSong() {
		const song = $currentSong.get();
		if (!this.el) return;
		if (!song) {
			this.currentSongId = null;
			this.el.pause();
			this.el.removeAttribute("src");
			this.el.load();
			$position.set(0);
			$duration.set(0);
			return;
		}
		if (song.id === this.currentSongId) return;
		this.currentSongId = song.id;
		const server = $queueServer.get();
		if (!server) return;
		const client = clientFor(server);
		const url = client.streamUrl(song.id);
		this.el.src = url;
		this.el.load();
		$position.set(0);
		$duration.set(song.duration ?? 0);

		this.clearPreload();
		this.scrobbleSubmitted = false;
		this.sendScrobble(client, song.id, false);
		recordPlay(song);
		this.updateMediaSessionMetadata(song, client);

		if ($isPlaying.get()) {
			this.el.play().catch(() => {
				$isPlaying.set(false);
			});
		}
	}

	private maybeSubmitScrobble() {
		if (this.scrobbleSubmitted || !this.el) return;
		const duration = this.el.duration;
		const position = this.el.currentTime;
		if (!Number.isFinite(duration) || duration <= 0) return;
		const halfway = duration * SCROBBLE_SUBMIT_RATIO;
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
		if (!this.el) return;
		const duration = Number.isFinite(this.el.duration) ? this.el.duration : 0;
		if (duration <= 0) return;
		try {
			navigator.mediaSession.setPositionState({
				duration,
				position: Math.min(this.el.currentTime, duration),
				playbackRate: this.el.playbackRate || 1,
			});
		} catch {}
	}

	private syncPlayState(playing: boolean) {
		if (!this.el || !this.currentSongId) return;
		if (playing && this.el.paused) {
			this.el.play().catch(() => $isPlaying.set(false));
		} else if (!playing && !this.el.paused) {
			this.el.pause();
		}
	}

	private maybePreloadNext() {
		if (!this.el) return;
		const duration = this.el.duration;
		if (!Number.isFinite(duration) || duration <= 0) return;
		if (duration - this.el.currentTime > PRELOAD_THRESHOLD_SECONDS) return;

		const nextUrl = this.resolveNextUrl();
		if (!nextUrl || nextUrl === this.preloadedUrl) return;
		this.clearPreload();
		this.preloadedUrl = nextUrl;
		const a = new Audio();
		a.preload = "auto";
		a.src = nextUrl;
		a.load();
		this.preloadEl = a;
	}

	private resolveNextUrl(): string | null {
		const q = $queue.get();
		const current = $currentIndex.get();
		if (q.length === 0 || current < 0) return null;
		if ($shuffle.get() && q.length > 1) return null;
		let nextIdx: number | null = null;
		if (current < q.length - 1) nextIdx = current + 1;
		else if ($repeat.get() === "all") nextIdx = 0;
		if (nextIdx == null) return null;
		const server = $queueServer.get();
		if (!server) return null;
		const client = clientFor(server);
		return client.streamUrl(q[nextIdx]!.id);
	}

	private clearPreload() {
		if (this.preloadEl) {
			this.preloadEl.src = "";
			this.preloadEl.removeAttribute("src");
			this.preloadEl = null;
		}
		this.preloadedUrl = null;
	}
}

export const audioEngine = new AudioEngine();

// The audio engine carries a lot of lifecycle state (DOM listeners, nanostore
// subscriptions, rAF handles, the HTMLAudioElement itself). Even with careful
// detach/attach plumbing, a Vite HMR replacement can leave the new module's
// singleton unattached (AppShell's onMount doesn't re-fire for an unrelated
// module change) — and the old singleton quietly keeps writing stale
// currentTime into $position, producing the progress-bar-jumping-left-right
// glitch. Opt out of HMR for this file: any edit triggers a full reload so
// the app starts from a clean state.
if (import.meta.hot) {
	import.meta.hot.decline();
	import.meta.hot.dispose(() => {
		(audioEngine as unknown as { detach: () => void }).detach();
	});
}
