import { Show, createEffect, createMemo, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { A } from "@solidjs/router";
import { useStore } from "@nanostores/solid";
import {
	Play,
	Pause,
	SkipBack,
	SkipForward,
	Shuffle,
	Repeat,
	Repeat1,
	ChevronDown,
	Mic2,
} from "lucide-solid";
import {
	$currentSong,
	$isPlaying,
	$position,
	$duration,
	$nowPlayingOpen,
	$repeat,
	$shuffle,
	$lyricsMode,
	closeNowPlaying,
	closeLyrics,
	cycleRepeat,
	exitLyricsCinematic,
	playNext,
	playPrevious,
	seek,
	toggleLyricsPanel,
	toggleShuffle,
	togglePlay,
} from "../../stores/player";
import { $activeServer } from "../../stores/servers";
import { clientFor } from "../../lib/queries/useActiveClient";
import { CoverArt } from "../../components/CoverArt";
import { openLightbox } from "../../stores/lightbox";
import { Lyrics } from "./Lyrics";
import styles from "./NowPlayingView.module.css";

function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const s = Math.floor(seconds);
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}:${r.toString().padStart(2, "0")}`;
}

export function NowPlayingView() {
	const open = useStore($nowPlayingOpen);
	const song = useStore($currentSong);
	const isPlaying = useStore($isPlaying);
	const position = useStore($position);
	const duration = useStore($duration);
	const shuffle = useStore($shuffle);
	const repeat = useStore($repeat);
	const activeServer = useStore($activeServer);
	const lyricsMode = useStore($lyricsMode);

	const coverSrc = createMemo(() => {
		const s = song();
		const server = activeServer();
		if (!s || !server) return undefined;
		return clientFor(server).coverArtUrl(s.coverArt, 720);
	});

	const fullCoverSrc = createMemo(() => {
		const s = song();
		const server = activeServer();
		if (!s || !server) return undefined;
		return clientFor(server).coverArtUrl(s.coverArt);
	});

	const totalSeconds = createMemo(() => {
		const d = duration();
		if (d > 0) return d;
		return song()?.duration ?? 0;
	});

	const progress = createMemo(() => {
		const total = totalSeconds();
		if (total <= 0) return 0;
		return Math.min(1, Math.max(0, position() / total));
	});

	createEffect(() => {
		if (!open()) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey && e.key === "ArrowDown") {
				e.preventDefault();
				closeNowPlaying();
			}
			if (e.key === "Escape") {
				const mode = $lyricsMode.get();
				if (mode === "cinematic") {
					e.preventDefault();
					exitLyricsCinematic();
				} else if (mode === "panel") {
					e.preventDefault();
					closeLyrics();
				}
			}
		};
		window.addEventListener("keydown", onKey);
		onCleanup(() => window.removeEventListener("keydown", onKey));
	});

	// Reset to off whenever the overlay closes so re-opening is predictable.
	createEffect(() => {
		if (!open()) closeLyrics();
	});

	const seekFromEvent = (e: MouseEvent, rect: DOMRect) => {
		const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		seek(ratio * totalSeconds());
	};

	const handleBarMouseDown = (e: MouseEvent) => {
		if (totalSeconds() <= 0) return;
		const bar = e.currentTarget as HTMLElement;
		const rect = bar.getBoundingClientRect();
		seekFromEvent(e, rect);
		const onMove = (me: MouseEvent) => seekFromEvent(me, rect);
		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	};

	return (
		<Show when={open() && song()}>
			<Portal>
				<div
					class={styles.overlay}
					data-lyrics={lyricsMode()}
					onClick={(e) => {
						if (e.currentTarget === e.target) closeNowPlaying();
					}}
				>
					<Show when={coverSrc()}>
						<div
							class={styles.backdrop}
							style={{ "background-image": `url(${coverSrc()})` }}
						/>
					</Show>

					<button
						type="button"
						class={styles.closeBtn}
						onClick={closeNowPlaying}
						aria-label="Close now playing"
					>
						<ChevronDown size={20} />
					</button>

					<Show
						when={lyricsMode() === "cinematic"}
						fallback={
							<div class={styles.layout} data-panel={lyricsMode() === "panel"}>
								<div class={styles.stage}>
									<button
										type="button"
										class={styles.coverWrap}
										onClick={(e) => {
											e.stopPropagation();
											openLightbox(fullCoverSrc(), song()!.title);
										}}
										aria-label={`View artwork for ${song()!.title}`}
									>
										<CoverArt
											src={coverSrc()}
											name={song()!.title}
											class={styles.cover}
										/>
									</button>

									<div class={styles.info}>
										<h1 class={styles.title}>{song()!.title}</h1>
										<Show when={song()!.artist}>
											<Show
												when={song()!.artistId}
												fallback={<p class={styles.artist}>{song()!.artist}</p>}
											>
												<A
													class={`${styles.artist} ${styles.entityLink}`}
													href={`/artist/${encodeURIComponent(song()!.artistId!)}`}
													onClick={closeNowPlaying}
												>
													{song()!.artist}
												</A>
											</Show>
										</Show>
										<Show when={song()!.album}>
											<Show
												when={song()!.albumId}
												fallback={<p class={styles.album}>{song()!.album}</p>}
											>
												<A
													class={`${styles.album} ${styles.entityLink}`}
													href={`/album/${encodeURIComponent(song()!.albumId!)}`}
													onClick={closeNowPlaying}
												>
													{song()!.album}
												</A>
											</Show>
										</Show>
									</div>

									<div class={styles.progress}>
										<span class={styles.time}>{formatTime(position())}</span>
										<div
											class={styles.bar}
											role="slider"
											aria-label="Seek"
											aria-valuemin={0}
											aria-valuemax={totalSeconds()}
											aria-valuenow={position()}
											onMouseDown={handleBarMouseDown}
										>
											<div
												class={styles.barFill}
												style={{ width: `${progress() * 100}%` }}
											/>
										</div>
										<span class={styles.time}>{formatTime(totalSeconds())}</span>
									</div>

									<div class={styles.controls}>
										<button
											class={styles.ctrl}
											data-active={shuffle()}
											aria-label="Shuffle"
											onClick={toggleShuffle}
										>
											<Shuffle size={20} />
										</button>
										<button
											class={styles.ctrl}
											aria-label="Previous"
											onClick={playPrevious}
										>
											<SkipBack size={24} />
										</button>
										<button
											class={`${styles.ctrl} ${styles.playBig}`}
											aria-label={isPlaying() ? "Pause" : "Play"}
											onClick={togglePlay}
										>
											<Show when={isPlaying()} fallback={<Play fill="currentColor" size={28} />}>
												<Pause fill="currentColor" size={28} />
											</Show>
										</button>
										<button
											class={styles.ctrl}
											aria-label="Next"
											onClick={playNext}
										>
											<SkipForward size={24} />
										</button>
										<button
											class={styles.ctrl}
											data-active={repeat() !== "off"}
											aria-label={`Repeat ${repeat()}`}
											onClick={cycleRepeat}
										>
											<Show when={repeat() === "one"} fallback={<Repeat size={20} />}>
												<Repeat1 size={20} />
											</Show>
										</button>
										<button
											class={styles.ctrl}
											data-active={lyricsMode() !== "off"}
											aria-label="Toggle lyrics"
											title="Lyrics"
											onClick={toggleLyricsPanel}
										>
											<Mic2 size={18} />
										</button>
									</div>
								</div>

								<Show when={lyricsMode() === "panel"}>
									<aside class={styles.lyricsPanel}>
										<Lyrics variant="panel" />
									</aside>
								</Show>
							</div>
						}
					>
						<div class={styles.cinematicStage}>
							<Lyrics variant="cinematic" />
							<div class={styles.cinematicFooter}>
								<div class={styles.cinematicMeta}>
									<span class={styles.cinematicTitle}>{song()!.title}</span>
									<Show when={song()!.artist}>
										<span class={styles.cinematicArtist}>{song()!.artist}</span>
									</Show>
								</div>
								<div class={styles.cinematicControls}>
									<button
										class={styles.ctrl}
										aria-label="Previous"
										onClick={playPrevious}
									>
										<SkipBack size={20} />
									</button>
									<button
										class={`${styles.ctrl} ${styles.playBig}`}
										aria-label={isPlaying() ? "Pause" : "Play"}
										onClick={togglePlay}
									>
										<Show when={isPlaying()} fallback={<Play fill="currentColor" size={24} />}>
											<Pause fill="currentColor" size={24} />
										</Show>
									</button>
									<button
										class={styles.ctrl}
										aria-label="Next"
										onClick={playNext}
									>
										<SkipForward size={20} />
									</button>
								</div>
							</div>
						</div>
					</Show>
				</div>
			</Portal>
		</Show>
	);
}
