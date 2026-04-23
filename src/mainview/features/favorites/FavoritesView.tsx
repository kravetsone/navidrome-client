import { For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { clientFor, starredQuery } from "../../lib/queries";
import { MediaCard } from "../../components/MediaCard";
import { TrackList } from "../../components/TrackList";
import {
	AlbumContextMenu,
	ArtistContextMenu,
} from "../../components/menus";
import { playQueue } from "../../stores/player";
import type { ServerConfig } from "../../lib/subsonic";
import { artistCoverUrl } from "../../lib/artist-cover";
import styles from "./FavoritesView.module.css";

export function FavoritesView() {
	const activeServer = useStore($activeServer);

	return (
		<div class={styles.page}>
			<header class={styles.header}>
				<span class={styles.eyebrow}>Library</span>
				<h1 class={styles.title}>Favorites</h1>
			</header>

			<Show when={activeServer()}>
				{(server) => <Body server={server()} />}
			</Show>
		</div>
	);
}

function Body(props: { server: ServerConfig }) {
	const client = clientFor(props.server);
	const query = createQuery(() =>
		starredQuery({ client, serverId: props.server.id }),
	);

	return (
		<Show when={!query.isPending} fallback={<div class={styles.empty}>Loading…</div>}>
			<Show
				when={query.data}
				fallback={<div class={styles.empty}>No favorites yet.</div>}
			>
				{(data) => {
					const isEmpty =
						data().artist.length === 0 &&
						data().album.length === 0 &&
						data().song.length === 0;
					return (
						<Show when={!isEmpty} fallback={<EmptyState />}>
							<Show when={data().artist.length > 0}>
								<section class={styles.section}>
									<h2 class={styles.sectionTitle}>Artists</h2>
									<div class={styles.gridRound}>
										<For each={data().artist}>
											{(artist) => (
												<ArtistContextMenu artist={artist}>
													<MediaCard
														href={`/artist/${encodeURIComponent(artist.id)}`}
														title={artist.name}
														subtitle={
															artist.albumCount != null
																? `${artist.albumCount} album${artist.albumCount === 1 ? "" : "s"}`
																: undefined
														}
														coverSrc={artistCoverUrl(client, artist, 240)}
														round
													/>
												</ArtistContextMenu>
											)}
										</For>
									</div>
								</section>
							</Show>

							<Show when={data().album.length > 0}>
								<section class={styles.section}>
									<h2 class={styles.sectionTitle}>Albums</h2>
									<div class={styles.grid}>
										<For each={data().album}>
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

							<Show when={data().song.length > 0}>
								<section class={styles.section}>
									<h2 class={styles.sectionTitle}>Songs</h2>
									<TrackList
										songs={data().song}
										showAlbum
										onPlay={(i) => playQueue(data().song, i)}
									/>
								</section>
							</Show>
						</Show>
					);
				}}
			</Show>
		</Show>
	);
}

function EmptyState() {
	return (
		<div class={styles.empty}>
			<p>Nothing starred yet.</p>
			<p class={styles.emptyHint}>
				Tap the heart on a track, album, or artist to keep it close.
			</p>
		</div>
	);
}
