import { Show, createMemo } from "solid-js";
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
	Volume2,
	VolumeX,
	ListMusic,
} from "lucide-solid";
import {
	$currentSong,
	$isPlaying,
	$position,
	$duration,
	$volume,
	$repeat,
	$shuffle,
	togglePlay,
	playNext,
	playPrevious,
	seek,
	setVolume,
	toggleShuffle,
	cycleRepeat,
	openNowPlaying,
	toggleQueue,
	$queueOpen,
} from "../stores/player";
import { $activeServer } from "../stores/servers";
import { clientFor } from "../lib/queries/useActiveClient";
import { CoverArt } from "../components/CoverArt";
import { HeartButton } from "../components/HeartButton";
import { SleepTimerButton } from "../components/SleepTimerButton";
import styles from "./PlayerBar.module.css";

function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const s = Math.floor(seconds);
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}:${r.toString().padStart(2, "0")}`;
}

export function PlayerBar() {
	const song = useStore($currentSong);
	const isPlaying = useStore($isPlaying);
	const position = useStore($position);
	const duration = useStore($duration);
	const volume = useStore($volume);
	const repeat = useStore($repeat);
	const shuffle = useStore($shuffle);
	const activeServer = useStore($activeServer);
	const queueOpen = useStore($queueOpen);

	const coverSrc = createMemo(() => {
		const s = song();
		const server = activeServer();
		if (!s || !server) return undefined;
		return clientFor(server).coverArtUrl(s.coverArt, 96);
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

	const volumeFromEvent = (e: MouseEvent, rect: DOMRect) => {
		const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		setVolume(ratio);
	};

	const handleVolumeMouseDown = (e: MouseEvent) => {
		const bar = e.currentTarget as HTMLElement;
		const rect = bar.getBoundingClientRect();
		volumeFromEvent(e, rect);
		const onMove = (me: MouseEvent) => volumeFromEvent(me, rect);
		const onUp = () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	};

	return (
		<div class={styles.player}>
			<div class={styles.track}>
				<Show
					when={song()}
					fallback={
						<>
							<div class={styles.art} />
							<div class={styles.trackText}>
								<span class={styles.trackMuted}>Nothing playing</span>
							</div>
						</>
					}
				>
					{(s) => (
						<>
							<button
								type="button"
								class={styles.coverButton}
								onClick={openNowPlaying}
								aria-label="Open now playing"
							>
								<CoverArt
									src={coverSrc()}
									name={s().title}
									class={styles.artImg}
								/>
							</button>
							<div class={styles.trackText}>
								<Show
									when={s().albumId}
									fallback={
										<span class={styles.trackTitle}>{s().title}</span>
									}
								>
									<A
										class={`${styles.trackTitle} ${styles.trackTitleLink}`}
										href={`/album/${encodeURIComponent(s().albumId!)}`}
									>
										{s().title}
									</A>
								</Show>
								<Show when={s().artist}>
									<Show
										when={s().artistId}
										fallback={
											<span class={styles.trackArtist}>{s().artist}</span>
										}
									>
										<A
											class={`${styles.trackArtist} ${styles.trackArtistLink}`}
											href={`/artist/${encodeURIComponent(s().artistId!)}`}
										>
											{s().artist}
										</A>
									</Show>
								</Show>
							</div>
						</>
					)}
				</Show>
			</div>

			<div class={styles.controls}>
				<div class={styles.buttons}>
					<button
						class={styles.btn}
						aria-label="Shuffle"
						data-active={shuffle()}
						onClick={toggleShuffle}
					>
						<Shuffle />
					</button>
					<button
						class={styles.btn}
						aria-label="Previous"
						onClick={playPrevious}
						disabled={!song()}
					>
						<SkipBack />
					</button>
					<button
						class={`${styles.btn} ${styles.play}`}
						aria-label={isPlaying() ? "Pause" : "Play"}
						onClick={togglePlay}
						disabled={!song()}
					>
						<Show when={isPlaying()} fallback={<Play fill="currentColor" />}>
							<Pause fill="currentColor" />
						</Show>
					</button>
					<button
						class={styles.btn}
						aria-label="Next"
						onClick={playNext}
						disabled={!song()}
					>
						<SkipForward />
					</button>
					<button
						class={styles.btn}
						aria-label={`Repeat ${repeat()}`}
						data-active={repeat() !== "off"}
						onClick={cycleRepeat}
					>
						<Show when={repeat() === "one"} fallback={<Repeat />}>
							<Repeat1 />
						</Show>
					</button>
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
			</div>

			<div class={styles.meta}>
				<Show when={song()}>
					{(s) => (
						<HeartButton
							kind="song"
							id={s().id}
							starred={Boolean(s().starred)}
							compact
						/>
					)}
				</Show>
				<SleepTimerButton />
				<button
					class={styles.btn}
					aria-label="Queue"
					data-active={queueOpen()}
					onClick={toggleQueue}
				>
					<ListMusic />
				</button>
				<div class={styles.volume}>
					<button
						class={styles.iconBtn}
						aria-label={volume() === 0 ? "Unmute" : "Mute"}
						onClick={() => setVolume(volume() === 0 ? 0.8 : 0)}
					>
						<Show when={volume() > 0} fallback={<VolumeX size={16} />}>
							<Volume2 size={16} />
						</Show>
					</button>
					<div
						class={styles.volumeBar}
						role="slider"
						aria-label="Volume"
						aria-valuemin={0}
						aria-valuemax={1}
						aria-valuenow={volume()}
						onMouseDown={handleVolumeMouseDown}
					>
						<div
							class={styles.volumeFill}
							style={{ width: `${volume() * 100}%` }}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
