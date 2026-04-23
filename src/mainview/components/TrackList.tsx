import { For, Show, createMemo } from "solid-js";
import { A } from "@solidjs/router";
import { useStore } from "@nanostores/solid";
import { Disc } from "lucide-solid";
import { Play } from "lucide-solid";
import type { Song } from "../lib/subsonic";
import { $currentSong, $isPlaying, $queueOpen } from "../stores/player";
import { HeartButton } from "./HeartButton";
import { SongContextMenu } from "./menus";
import styles from "./TrackList.module.css";

const SONG_DRAG_MIME = "application/x-navidrome-song";

function startSongDrag(e: DragEvent, song: Song) {
	if (!e.dataTransfer) return;
	e.dataTransfer.effectAllowed = "copyMove";
	e.dataTransfer.setData(SONG_DRAG_MIME, JSON.stringify(song));
	e.dataTransfer.setData("text/plain", song.title);
	if (!$queueOpen.get()) $queueOpen.set(true);
}

function formatTrackDuration(seconds?: number): string {
	if (!seconds || !Number.isFinite(seconds)) return "—";
	const s = Math.floor(seconds);
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}:${r.toString().padStart(2, "0")}`;
}

export interface TrackListProps {
	songs: Song[];
	onPlay: (index: number) => void;
	/** When provided, rows whose artist === omitArtist will not show the artist. */
	omitArtist?: string;
	/** When true, always show the album column. */
	showAlbum?: boolean;
	/** When set, enables "Remove from playlist" in each row's context menu. */
	playlistId?: string;
	/** When true, group tracks by discNumber if multiple discs are present. */
	groupByDisc?: boolean;
}

type Row =
	| { kind: "disc"; key: string; disc: number }
	| { kind: "song"; key: string; song: Song; index: number };

export function TrackList(props: TrackListProps) {
	const currentSong = useStore($currentSong);
	const isPlaying = useStore($isPlaying);

	const rows = createMemo<Row[]>(() => {
		const list = props.songs;
		if (!props.groupByDisc) {
			return list.map((song, index) => ({
				kind: "song" as const,
				key: `${song.id}-${index}`,
				song,
				index,
			}));
		}
		const discs = new Set<number>();
		for (const s of list) {
			if (s.discNumber != null) discs.add(s.discNumber);
		}
		if (discs.size <= 1) {
			return list.map((song, index) => ({
				kind: "song" as const,
				key: `${song.id}-${index}`,
				song,
				index,
			}));
		}
		const out: Row[] = [];
		let lastDisc: number | null = null;
		list.forEach((song, index) => {
			const disc = song.discNumber ?? 1;
			if (disc !== lastDisc) {
				out.push({ kind: "disc", key: `disc-${disc}`, disc });
				lastDisc = disc;
			}
			out.push({ kind: "song", key: `${song.id}-${index}`, song, index });
		});
		return out;
	});

	return (
		<section class={styles.tracks} data-show-album={props.showAlbum ? "true" : "false"}>
			<header class={styles.head}>
				<span class={styles.colNum}>#</span>
				<span>Title</span>
				<Show when={props.showAlbum}>
					<span>Album</span>
				</Show>
				<span>Artist</span>
				<span class={styles.colHeart} aria-hidden="true" />
				<span class={styles.colDur}>Duration</span>
			</header>
			<ol class={styles.list}>
				<For each={rows()}>
					{(row) => (
						<Show
							when={row.kind === "song"}
							fallback={
								<li class={styles.discDivider}>
									<Disc size={14} />
									<span>Disc {row.kind === "disc" ? row.disc : ""}</span>
								</li>
							}
						>
							<TrackRow
								song={(row as { song: Song }).song}
								index={(row as { index: number }).index}
								active={
									currentSong()?.id ===
									(row as { song: Song }).song.id
								}
								isPlaying={isPlaying()}
								omitArtist={props.omitArtist}
								showAlbum={props.showAlbum}
								playlistId={props.playlistId}
								songs={props.songs}
								onPlay={props.onPlay}
							/>
						</Show>
					)}
				</For>
			</ol>
		</section>
	);
}

function TrackRow(props: {
	song: Song;
	index: number;
	active: boolean;
	isPlaying: boolean;
	omitArtist?: string;
	showAlbum?: boolean;
	playlistId?: string;
	songs: Song[];
	onPlay: (index: number) => void;
}) {
	const showArtist = () =>
		props.song.artist && props.song.artist !== props.omitArtist;

	return (
		<SongContextMenu
			song={props.song}
			songs={props.songs}
			index={props.index}
			playlistId={props.playlistId}
			playlistIndex={props.index}
			as="li"
			triggerClass={styles.track}
			triggerProps={{
				"data-active": props.active,
				draggable: true,
				onDragStart: (e: DragEvent) => startSongDrag(e, props.song),
				onDblClick: () => props.onPlay(props.index),
			}}
		>
			<button
				type="button"
				class={styles.trackNum}
				onClick={() => props.onPlay(props.index)}
				aria-label={`Play ${props.song.title}`}
			>
				<Show
					when={props.active && props.isPlaying}
					fallback={
						<>
							<span class={styles.num}>
								{props.song.track ?? props.index + 1}
							</span>
							<Play
								class={styles.playIcon}
								size={14}
								fill="currentColor"
							/>
						</>
					}
				>
					<span class={styles.playing}>
						<span />
						<span />
						<span />
					</span>
				</Show>
			</button>
			<span class={styles.trackTitle}>{props.song.title}</span>
			<Show when={props.showAlbum}>
				<Show
					when={props.song.albumId && props.song.album}
					fallback={
						<span class={styles.trackAlbum}>{props.song.album}</span>
					}
				>
					<A
						class={styles.trackAlbumLink}
						href={`/album/${encodeURIComponent(props.song.albumId!)}`}
						onClick={(e) => e.stopPropagation()}
					>
						{props.song.album}
					</A>
				</Show>
			</Show>
			<Show
				when={showArtist() && props.song.artistId}
				fallback={
					<span class={styles.trackArtist}>
						{showArtist() ? props.song.artist : ""}
					</span>
				}
			>
				<A
					class={styles.trackArtistLink}
					href={`/artist/${encodeURIComponent(props.song.artistId!)}`}
					onClick={(e) => e.stopPropagation()}
				>
					{props.song.artist}
				</A>
			</Show>
			<span class={styles.trackHeart}>
				<HeartButton
					kind="song"
					id={props.song.id}
					starred={Boolean(props.song.starred)}
					compact
					size={14}
				/>
			</span>
			<span class={styles.trackDuration}>
				{formatTrackDuration(props.song.duration)}
			</span>
		</SongContextMenu>
	);
}
