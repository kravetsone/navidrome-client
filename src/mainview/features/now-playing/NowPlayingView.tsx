import { Show, createEffect, createMemo, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
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
} from "lucide-solid";
import {
	$currentSong,
	$isPlaying,
	$position,
	$duration,
	$nowPlayingOpen,
	$repeat,
	$shuffle,
	closeNowPlaying,
	cycleRepeat,
	playNext,
	playPrevious,
	seek,
	toggleShuffle,
	togglePlay,
} from "../../stores/player";
import { $activeServer } from "../../stores/servers";
import { clientFor } from "../../lib/queries/useActiveClient";
import { CoverArt } from "../../components/CoverArt";
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

	const coverSrc = createMemo(() => {
		const s = song();
		const server = activeServer();
		if (!s || !server) return undefined;
		return clientFor(server).coverArtUrl(s.coverArt, 720);
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
			if (e.key === "Escape") {
				e.preventDefault();
				closeNowPlaying();
				return;
			}
			if (e.metaKey && e.key === "ArrowDown") {
				e.preventDefault();
				closeNowPlaying();
				return;
			}
			if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
				e.preventDefault();
				togglePlay();
			}
		};
		window.addEventListener("keydown", onKey);
		onCleanup(() => window.removeEventListener("keydown", onKey));
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

					<div class={styles.stage}>
						<div class={styles.coverWrap}>
							<CoverArt
								src={coverSrc()}
								name={song()!.title}
								class={styles.cover}
							/>
						</div>

						<div class={styles.info}>
							<h1 class={styles.title}>{song()!.title}</h1>
							<Show when={song()!.artist}>
								<p class={styles.artist}>{song()!.artist}</p>
							</Show>
							<Show when={song()!.album}>
								<p class={styles.album}>{song()!.album}</p>
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
						</div>
					</div>
				</div>
			</Portal>
		</Show>
	);
}
