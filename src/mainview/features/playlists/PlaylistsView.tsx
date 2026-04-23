import { For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { clientFor, playlistsQuery } from "../../lib/queries";
import { MediaCard } from "../../components/MediaCard";
import type { ServerConfig } from "../../lib/subsonic";
import styles from "./PlaylistsView.module.css";

function formatDuration(seconds?: number): string {
	if (!seconds) return "";
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

export function PlaylistsView() {
	const activeServer = useStore($activeServer);

	return (
		<div class={styles.page}>
			<header class={styles.header}>
				<span class={styles.eyebrow}>Library</span>
				<h1 class={styles.title}>Playlists</h1>
			</header>

			<Show when={activeServer()}>
				{(server) => <PlaylistsGrid server={server()} />}
			</Show>
		</div>
	);
}

function PlaylistsGrid(props: { server: ServerConfig }) {
	const client = clientFor(props.server);
	const query = createQuery(() =>
		playlistsQuery({ client, serverId: props.server.id }),
	);

	return (
		<Show when={!query.isPending} fallback={<div class={styles.empty}>Loading…</div>}>
			<Show
				when={(query.data ?? []).length > 0}
				fallback={<div class={styles.empty}>No playlists yet.</div>}
			>
				<div class={styles.grid}>
					<For each={query.data!}>
						{(playlist) => {
							const subtitle =
								playlist.songCount != null
									? `${playlist.songCount} song${playlist.songCount === 1 ? "" : "s"}`
									: playlist.owner;
							return (
								<MediaCard
									href={`/playlist/${encodeURIComponent(playlist.id)}`}
									title={playlist.name}
									subtitle={subtitle}
									meta={formatDuration(playlist.duration)}
									coverSrc={client.coverArtUrl(playlist.coverArt ?? playlist.id, 360)}
								/>
							);
						}}
					</For>
				</div>
			</Show>
		</Show>
	);
}
