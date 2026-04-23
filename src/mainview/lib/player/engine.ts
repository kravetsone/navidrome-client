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
	_seekRequested,
	playNext,
	playPrevious,
	seek,
	togglePlay,
} from "../../stores/player";
import type { Song } from "../subsonic";
import type { SubsonicClient } from "../subsonic/client";
import { $activeServer } from "../../stores/servers";
import { clientFor } from "../queries/useActiveClient";

const PRELOAD_THRESHOLD_SECONDS = 10;

class AudioEngine {
	private el: HTMLAudioElement | null = null;
	private preloadEl: HTMLAudioElement | null = null;
	private preloadedUrl: string | null = null;
	private currentSongId: string | null = null;
	private attached = false;
	private onEnded: (song: ReturnType<typeof $currentSong.get>) => void = () => {};
	private onTrackStart: (
		song: ReturnType<typeof $currentSong.get>,
	) => void = () => {};

	attach(el: HTMLAudioElement) {
		if (this.el === el && this.attached) return;
		this.el = el;
		this.attached = true;

		el.preload = "auto";
		el.volume = $volume.get();
		el.crossOrigin = "anonymous";

		el.addEventListener("timeupdate", this.handleTimeUpdate);
		el.addEventListener("durationchange", this.handleDurationChange);
		el.addEventListener("loadedmetadata", this.handleDurationChange);
		el.addEventListener("play", this.handlePlay);
		el.addEventListener("pause", this.handlePause);
		el.addEventListener("ended", this.handleEnded);
		el.addEventListener("error", this.handleError);

		$volume.subscribe((v) => {
			if (this.el) this.el.volume = v;
		});

		$currentSong.listen(() => this.syncCurrentSong());
		$isPlaying.listen((playing) => {
			this.syncPlayState(playing);
			this.updateMediaSessionPlayback(playing);
		});
		_seekRequested.listen((t) => {
			if (t == null || !this.el) return;
			this.el.currentTime = t;
			_seekRequested.set(null);
		});

		this.setupMediaSessionHandlers();
		this.syncCurrentSong();
	}

	onEndedHook(fn: (song: ReturnType<typeof $currentSong.get>) => void) {
		this.onEnded = fn;
	}

	onTrackStartHook(fn: (song: ReturnType<typeof $currentSong.get>) => void) {
		this.onTrackStart = fn;
	}

	private handleTimeUpdate = () => {
		if (!this.el) return;
		$position.set(this.el.currentTime);
		this.updateMediaSessionPosition();
		this.maybePreloadNext();
	};

	private handleDurationChange = () => {
		if (!this.el) return;
		const d = this.el.duration;
		if (Number.isFinite(d) && d > 0) {
			$duration.set(d);
			this.updateMediaSessionPosition();
		}
	};

	private handlePlay = () => {
		if (!$isPlaying.get()) $isPlaying.set(true);
	};

	private handlePause = () => {
		if ($isPlaying.get()) $isPlaying.set(false);
	};

	private handleEnded = () => {
		const song = $currentSong.get();
		this.onEnded(song);
		if ($repeat.get() === "one") {
			if (this.el) {
				this.el.currentTime = 0;
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
		const server = $activeServer.get();
		if (!server) return;
		const client = clientFor(server);
		const url = client.streamUrl(song.id);
		this.el.src = url;
		this.el.load();
		$position.set(0);
		$duration.set(song.duration ?? 0);

		this.clearPreload();
		this.updateMediaSessionMetadata(song, client);
		this.onTrackStart(song);

		if ($isPlaying.get()) {
			this.el.play().catch(() => {
				$isPlaying.set(false);
			});
		}
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
		const server = $activeServer.get();
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
