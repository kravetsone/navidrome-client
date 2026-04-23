import { Show, createEffect, createMemo, onCleanup } from "solid-js";
import { useParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { Play, Shuffle } from "lucide-solid";
import { $activeServer } from "../../stores/servers";
import { playlistQuery, clientFor } from "../../lib/queries";
import type { ServerConfig, Song } from "../../lib/subsonic";
import { CoverArt } from "../../components/CoverArt";
import { TrackList } from "../../components/TrackList";
import { playQueue, toggleShuffle, $shuffle } from "../../stores/player";
import {
	applyAmbientPalette,
	extractAmbientPalette,
	resetAmbientPalette,
} from "../../lib/palette";
import styles from "./PlaylistView.module.css";

function formatTotalDuration(seconds?: number): string {
	if (!seconds || !Number.isFinite(seconds)) return "";
	const s = Math.floor(seconds);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m} min`;
}

export function PlaylistView() {
	const params = useParams<{ id: string }>();
	const activeServer = useStore($activeServer);

	return (
		<Show when={activeServer()} fallback={<div class={styles.empty}>No server</div>}>
			{(server) => <PlaylistBody server={server()} id={params.id} />}
		</Show>
	);
}

function PlaylistBody(props: { server: ServerConfig; id: string }) {
	const client = clientFor(props.server);
	const query = createQuery(() =>
		playlistQuery({ client, serverId: props.server.id }, props.id),
	);

	const coverUrl = createMemo(() => {
		const pl = query.data;
		if (!pl) return undefined;
		return client.coverArtUrl(pl.coverArt ?? pl.id, 480);
	});

	const paletteUrl = createMemo(() => {
		const pl = query.data;
		if (!pl) return undefined;
		return client.coverArtUrl(pl.coverArt ?? pl.id, 96);
	});

	createEffect(() => {
		const url = paletteUrl();
		if (!url) return;
		extractAmbientPalette(url).then((p) => {
			if (p) applyAmbientPalette(p);
		});
	});

	onCleanup(() => resetAmbientPalette());

	const songs = createMemo<Song[]>(() => query.data?.entry ?? []);

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
				fallback={<div class={styles.empty}>Playlist not found.</div>}
			>
				{(pl) => (
					<article class={styles.page}>
						<section class={styles.hero}>
							<CoverArt
								src={coverUrl()}
								name={pl().name}
								class={styles.cover}
							/>
							<div class={styles.heroText}>
								<span class={styles.eyebrow}>Playlist</span>
								<h1 class={styles.title}>{pl().name}</h1>
								<Show when={pl().comment}>
									<p class={styles.comment}>{pl().comment}</p>
								</Show>
								<div class={styles.meta}>
									<Show when={pl().owner}>
										<span>By {pl().owner}</span>
										<span class={styles.metaDot}>·</span>
									</Show>
									<Show when={songs().length > 0}>
										<span>
											{songs().length} song
											{songs().length === 1 ? "" : "s"}
										</span>
									</Show>
									<Show when={pl().duration}>
										<span class={styles.metaDot}>·</span>
										<span>{formatTotalDuration(pl().duration)}</span>
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
								showAlbum
								onPlay={(i) => playQueue(songs(), i)}
							/>
						</Show>
					</article>
				)}
			</Show>
		</Show>
	);
}
