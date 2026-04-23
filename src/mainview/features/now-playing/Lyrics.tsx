import { For, Show, createMemo, createSignal, createEffect, onCleanup } from "solid-js";
import { useStore } from "@nanostores/solid";
import { createQuery } from "@tanstack/solid-query";
import { Cloud, Maximize2, Minimize2 } from "lucide-solid";
import {
	$currentSong,
	$position,
	enterLyricsCinematic,
	exitLyricsCinematic,
	seek,
} from "../../stores/player";
import { $queueServer } from "../../stores/servers";
import { clientFor } from "../../lib/queries/useActiveClient";
import { lyricsQuery } from "../../lib/queries";
import type { StructuredLyrics } from "../../lib/subsonic";
import styles from "./Lyrics.module.css";

interface LyricsProps {
	variant: "panel" | "cinematic";
}

export function Lyrics(props: LyricsProps) {
	const song = useStore($currentSong);
	const server = useStore($queueServer);
	const position = useStore($position);

	const query = createQuery(() => {
		const s = song();
		const srv = server();
		const ctx = srv ? { client: clientFor(srv), serverId: srv.id } : null;
		const songRef = s
			? { id: s.id, artist: s.artist, title: s.title, duration: s.duration }
			: null;
		return lyricsQuery(ctx, songRef);
	});

	const lyrics = () => query.data as StructuredLyrics | null | undefined;
	const isSynced = () =>
		Boolean(lyrics()?.synced && lyrics()?.line?.some((l) => typeof l.start === "number"));

	// Trigger the active-line highlight slightly before the timestamp is reached.
	// With the current line transition (~220ms colour, ~280ms scale), the line
	// visually "settles" ~160ms after activeIndex flips — so a 160ms lookahead
	// lines that moment up with the LRC timestamp itself (which typically sits
	// right on the vocal attack).
	const LOOKAHEAD_MS = 160;

	const activeIndex = createMemo(() => {
		const l = lyrics();
		if (!l || !l.line.length || !isSynced()) return -1;
		const posMs = position() * 1000 - (l.offset ?? 0) + LOOKAHEAD_MS;
		let idx = -1;
		for (let i = 0; i < l.line.length; i++) {
			const start = l.line[i]!.start ?? Number.POSITIVE_INFINITY;
			if (posMs >= start) idx = i;
			else break;
		}
		return idx;
	});

	const [trackRef, setTrackRef] = createSignal<HTMLDivElement>();
	const [offsets, setOffsets] = createSignal<number[]>([]);

	const measure = () => {
		const track = trackRef();
		if (!track) return;
		const lines = Array.from(
			track.querySelectorAll<HTMLElement>("[data-lyric-line]"),
		);
		setOffsets(lines.map((el) => el.offsetTop + el.offsetHeight / 2));
	};

	createEffect(() => {
		// Re-measure whenever lyrics content or variant changes.
		void lyrics();
		void props.variant;
		const raf = requestAnimationFrame(measure);
		onCleanup(() => cancelAnimationFrame(raf));
	});

	createEffect(() => {
		const track = trackRef();
		if (!track) return;
		const ro = new ResizeObserver(() => measure());
		ro.observe(track);
		onCleanup(() => ro.disconnect());
	});

	const lineOffset = createMemo(() => {
		const idx = activeIndex();
		const arr = offsets();
		if (arr.length === 0) return 0;
		if (idx < 0) return -(arr[0] ?? 0);
		return -(arr[idx] ?? arr[arr.length - 1] ?? 0);
	});

	const onLineClick = (start: number | undefined) => {
		if (!isSynced() || typeof start !== "number") return;
		const offset = lyrics()?.offset ?? 0;
		seek(Math.max(0, (start + offset) / 1000));
	};

	return (
		<div
			class={[
				styles.root,
				props.variant === "cinematic" ? styles.cinematic : "",
				lyrics() && !isSynced() ? styles.unsynced : "",
			]
				.filter(Boolean)
				.join(" ")}
		>
			<Show when={props.variant === "panel"}>
				<div class={styles.header}>
					<span class={styles.headerTitle}>
						<span>Lyrics</span>
						<Show when={isSynced()}>
							<span class={styles.syncBadge}>SYNCED</span>
						</Show>
						<Show when={lyrics()?.source === "lrclib"}>
							<span
								class={styles.sourceBadge}
								title="Lyrics fetched from LRCLIB, not from your library"
							>
								<Cloud size={10} />
								LRCLIB
							</span>
						</Show>
					</span>
					<button
						type="button"
						class={styles.expandBtn}
						onClick={enterLyricsCinematic}
						aria-label="Expand lyrics"
						title="Expand"
					>
						<Maximize2 size={14} />
					</button>
				</div>
			</Show>

			<Show when={props.variant === "cinematic"}>
				<div class={styles.header}>
					<Show
						when={lyrics()?.source === "lrclib"}
						fallback={<span />}
					>
						<span
							class={styles.sourceBadge}
							title="Lyrics fetched from LRCLIB, not from your library"
						>
							<Cloud size={11} />
							LRCLIB
						</span>
					</Show>
					<button
						type="button"
						class={styles.expandBtn}
						onClick={exitLyricsCinematic}
						aria-label="Collapse lyrics"
						title="Collapse"
					>
						<Minimize2 size={16} />
					</button>
				</div>
			</Show>

			<div class={styles.viewport}>
				<Show when={query.isLoading && !lyrics()}>
					<div class={styles.skeleton}>
						<div class={styles.skeletonLine} style={{ "--w": "70%" }} />
						<div class={styles.skeletonLine} style={{ "--w": "55%" }} />
						<div class={styles.skeletonLine} style={{ "--w": "62%" }} />
					</div>
				</Show>

				<Show when={!query.isLoading && !lyrics()?.line.length}>
					<div class={styles.empty}>
						No lyrics found for this track.
						<small>
							Checked your library and LRCLIB. Add an .lrc sidecar next to the
							audio file to have it picked up on next scan.
						</small>
					</div>
				</Show>

				<Show when={lyrics()?.line.length}>
					<div
						class={styles.track}
						ref={setTrackRef}
						style={
							isSynced()
								? { "--lyric-offset": `${lineOffset()}px` }
								: undefined
						}
					>
						<For each={lyrics()!.line}>
							{(line, i) => {
								const state = () => {
									if (!isSynced()) return "future" as const;
									const a = activeIndex();
									if (i() === a) return "active" as const;
									if (i() < a) return "past" as const;
									return "future" as const;
								};
								return (
									<p
										class={styles.line}
										data-lyric-line
										data-state={state()}
										onClick={() => onLineClick(line.start)}
									>
										{line.value || "♪"}
									</p>
								);
							}}
						</For>
					</div>
				</Show>
			</div>
		</div>
	);
}
