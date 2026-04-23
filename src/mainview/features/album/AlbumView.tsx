import { For, Show, createEffect, createMemo, onCleanup } from "solid-js";
import { A, useParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { Play, Shuffle } from "lucide-solid";
import { $activeServer } from "../../stores/servers";
import { albumQuery, clientFor } from "../../lib/queries";
import type { ServerConfig, Song } from "../../lib/subsonic";
import { CoverArt } from "../../components/CoverArt";
import {
	$currentSong,
	$isPlaying,
	playQueue,
	toggleShuffle,
	$shuffle,
} from "../../stores/player";
import {
	applyAmbientPalette,
	extractAmbientPalette,
	resetAmbientPalette,
} from "../../lib/palette";
import styles from "./AlbumView.module.css";

function formatTrackDuration(seconds?: number): string {
	if (!seconds || !Number.isFinite(seconds)) return "—";
	const s = Math.floor(seconds);
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatTotalDuration(seconds?: number): string {
	if (!seconds || !Number.isFinite(seconds)) return "";
	const s = Math.floor(seconds);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m} min`;
}

export function AlbumView() {
	const params = useParams<{ id: string }>();
	const activeServer = useStore($activeServer);

	return (
		<Show when={activeServer()} fallback={<div class={styles.empty}>No server</div>}>
			{(server) => <AlbumBody server={server()} id={params.id} />}
		</Show>
	);
}

function AlbumBody(props: { server: ServerConfig; id: string }) {
	const client = clientFor(props.server);
	const query = createQuery(() =>
		albumQuery({ client, serverId: props.server.id }, props.id),
	);

	const coverUrl = createMemo(() => client.coverArtUrl(query.data?.coverArt, 480));
	const paletteUrl = createMemo(() => client.coverArtUrl(query.data?.coverArt, 96));

	createEffect(() => {
		const url = paletteUrl();
		if (!url) return;
		extractAmbientPalette(url).then((p) => {
			if (p) applyAmbientPalette(p);
		});
	});

	onCleanup(() => resetAmbientPalette());

	const songs = createMemo<Song[]>(() => query.data?.song ?? []);

	const handlePlay = () => {
		const list = songs();
		if (list.length === 0) return;
		playQueue(list, 0);
	};

	const handleShufflePlay = () => {
		const list = songs();
		if (list.length === 0) return;
		if (!$shuffle.get()) toggleShuffle();
		const start = Math.floor(Math.random() * list.length);
		playQueue(list, start);
	};

	return (
		<Show
			when={!query.isPending}
			fallback={<div class={styles.loading}>Loading…</div>}
		>
			<Show
				when={query.data}
				fallback={<div class={styles.empty}>Album not found.</div>}
			>
				{(album) => {
					const allArtist = album().artist;
					return (
						<article class={styles.page}>
							<section class={styles.hero}>
								<CoverArt
									src={coverUrl()}
									name={album().name}
									class={styles.cover}
								/>
								<div class={styles.heroText}>
									<span class={styles.eyebrow}>Album</span>
									<h1 class={styles.title}>{album().name}</h1>
									<Show when={allArtist}>
										<A
											href={
												album().artistId
													? `/artist/${encodeURIComponent(album().artistId!)}`
													: "#"
											}
											class={styles.artist}
										>
											{allArtist}
										</A>
									</Show>
									<div class={styles.meta}>
										<Show when={album().year}>
											<span>{album().year}</span>
										</Show>
										<Show when={songs().length > 0}>
											<span class={styles.metaDot}>·</span>
											<span>
												{songs().length} song
												{songs().length === 1 ? "" : "s"}
											</span>
										</Show>
										<Show when={album().duration}>
											<span class={styles.metaDot}>·</span>
											<span>{formatTotalDuration(album().duration)}</span>
										</Show>
									</div>
									<div class={styles.actions}>
										<button
											type="button"
											class={styles.playBtn}
											onClick={handlePlay}
											disabled={songs().length === 0}
										>
											<Play fill="currentColor" size={16} />
											<span>Play</span>
										</button>
										<button
											type="button"
											class={styles.shuffleBtn}
											onClick={handleShufflePlay}
											disabled={songs().length === 0}
										>
											<Shuffle size={16} />
											<span>Shuffle</span>
										</button>
									</div>
								</div>
							</section>

							<Show when={songs().length > 0}>
								<TrackList
									songs={songs()}
									albumArtist={allArtist}
									onPlay={(i) => playQueue(songs(), i)}
								/>
							</Show>
						</article>
					);
				}}
			</Show>
		</Show>
	);
}

function TrackList(props: {
	songs: Song[];
	albumArtist?: string;
	onPlay: (index: number) => void;
}) {
	const currentSong = useStore($currentSong);
	const isPlaying = useStore($isPlaying);

	return (
		<section class={styles.tracks}>
			<header class={styles.trackHead}>
				<span class={styles.colNum}>#</span>
				<span>Title</span>
				<span>Artist</span>
				<span class={styles.colDur}>Duration</span>
			</header>
			<ol class={styles.trackList}>
				<For each={props.songs}>
					{(song, i) => {
						const active = () => currentSong()?.id === song.id;
						const showDifferentArtist =
							song.artist && song.artist !== props.albumArtist;
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
								<span class={styles.trackArtist}>
									{showDifferentArtist ? song.artist : ""}
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
