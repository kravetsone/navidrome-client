import { For, Show } from "solid-js";
import { useStore } from "@nanostores/solid";
import { Play } from "lucide-solid";
import type { Song } from "../lib/subsonic";
import { $currentSong, $isPlaying } from "../stores/player";
import styles from "./TrackList.module.css";

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
}

export function TrackList(props: TrackListProps) {
	const currentSong = useStore($currentSong);
	const isPlaying = useStore($isPlaying);

	return (
		<section class={styles.tracks} data-show-album={props.showAlbum ? "true" : "false"}>
			<header class={styles.head}>
				<span class={styles.colNum}>#</span>
				<span>Title</span>
				<Show when={props.showAlbum}>
					<span>Album</span>
				</Show>
				<span>Artist</span>
				<span class={styles.colDur}>Duration</span>
			</header>
			<ol class={styles.list}>
				<For each={props.songs}>
					{(song, i) => {
						const active = () => currentSong()?.id === song.id;
						const showArtist =
							song.artist && song.artist !== props.omitArtist;
						return (
							<li
								class={styles.track}
								data-active={active()}
								onDblClick={() => props.onPlay(i())}
							>
								<button
									type="button"
									class={styles.trackNum}
									onClick={() => props.onPlay(i())}
									aria-label={`Play ${song.title}`}
								>
									<Show
										when={active() && isPlaying()}
										fallback={
											<>
												<span class={styles.num}>
													{song.track ?? i() + 1}
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
								<span class={styles.trackTitle}>{song.title}</span>
								<Show when={props.showAlbum}>
									<span class={styles.trackAlbum}>{song.album}</span>
								</Show>
								<span class={styles.trackArtist}>
									{showArtist ? song.artist : ""}
								</span>
								<span class={styles.trackDuration}>
									{formatTrackDuration(song.duration)}
								</span>
							</li>
						);
					}}
				</For>
			</ol>
		</section>
	);
}
