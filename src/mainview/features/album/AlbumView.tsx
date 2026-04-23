import { Show, createEffect, createMemo, onCleanup } from "solid-js";
import { A, useParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { Play, Shuffle } from "lucide-solid";
import { $activeServer } from "../../stores/servers";
import { albumQuery, clientFor } from "../../lib/queries";
import type { ServerConfig, Song } from "../../lib/subsonic";
import { CoverArt } from "../../components/CoverArt";
import { HeartButton } from "../../components/HeartButton";
import { TrackList } from "../../components/TrackList";
import { playQueue, toggleShuffle, $shuffle } from "../../stores/player";
import { openLightbox } from "../../stores/lightbox";
import {
	applyAmbientPalette,
	extractAmbientPalette,
	resetAmbientPalette,
} from "../../lib/palette";
import styles from "./AlbumView.module.css";

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
	const fullCoverUrl = createMemo(() => client.coverArtUrl(query.data?.coverArt));
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
								<button
									type="button"
									class={styles.coverZoom}
									onClick={() => openLightbox(fullCoverUrl(), album().name)}
									aria-label={`View artwork for ${album().name}`}
								>
									<CoverArt
										src={coverUrl()}
										name={album().name}
										class={styles.cover}
									/>
								</button>
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
										<HeartButton
											kind="album"
											id={album().id}
											starred={Boolean(album().starred)}
										/>
									</div>
								</div>
							</section>

							<Show when={songs().length > 0}>
								<TrackList
									songs={songs()}
									omitArtist={allArtist}
									groupByDisc
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
