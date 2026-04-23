import { For, Show, createMemo } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { $playHistory } from "../../stores/history";
import { albumListQuery, clientFor } from "../../lib/queries";
import { MediaCard } from "../../components/MediaCard";
import { TrackList } from "../../components/TrackList";
import { AlbumContextMenu } from "../../components/menus";
import { playSong } from "../../stores/player";
import type { Song, ServerConfig } from "../../lib/subsonic";
import styles from "./RecentView.module.css";

export function RecentView() {
	const activeServer = useStore($activeServer);
	const history = useStore($playHistory);

	const recentSongs = createMemo<Song[]>(() => {
		const seen = new Set<string>();
		const songs: Song[] = [];
		for (const entry of history()) {
			if (seen.has(entry.songId)) continue;
			seen.add(entry.songId);
			songs.push(entry.song);
			if (songs.length >= 50) break;
		}
		return songs;
	});

	return (
		<div class={styles.page}>
			<header class={styles.header}>
				<span class={styles.eyebrow}>Library</span>
				<h1 class={styles.title}>Recently played</h1>
			</header>

			<Show when={activeServer()}>
				{(server) => (
					<>
						<Show when={recentSongs().length > 0}>
							<section class={styles.section}>
								<h2 class={styles.sectionTitle}>Songs</h2>
								<TrackList
									songs={recentSongs()}
									showAlbum
									onPlay={(i) => {
										const list = recentSongs();
										const song = list[i];
										if (song) playSong(song);
									}}
								/>
							</section>
						</Show>
						<RecentAlbumsSection server={server()} />
						<Show when={recentSongs().length === 0}>
							<EmptyState />
						</Show>
					</>
				)}
			</Show>
		</div>
	);
}

function RecentAlbumsSection(props: { server: ServerConfig }) {
	const client = clientFor(props.server);
	const query = createQuery(() =>
		albumListQuery(
			{ client, serverId: props.server.id },
			"newest",
			30,
		),
	);

	return (
		<Show when={(query.data ?? []).length > 0}>
			<section class={styles.section}>
				<h2 class={styles.sectionTitle}>Recently added albums</h2>
				<div class={styles.grid}>
					<For each={query.data!}>
						{(album) => (
							<AlbumContextMenu album={album}>
								<MediaCard
									href={`/album/${encodeURIComponent(album.id)}`}
									title={album.name}
									subtitle={album.artist}
									meta={album.year ? String(album.year) : undefined}
									coverSrc={client.coverArtUrl(album.coverArt, 360)}
								/>
							</AlbumContextMenu>
						)}
					</For>
				</div>
			</section>
		</Show>
	);
}

function EmptyState() {
	return (
		<div class={styles.empty}>
			<p>Nothing played yet.</p>
			<p class={styles.emptyHint}>Tracks you play will appear here.</p>
		</div>
	);
}
