import { createMemo, createResource, For, Show } from "solid-js";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { SubsonicClient } from "../../lib/subsonic/client";
import { MediaCard } from "../../components/MediaCard";
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

	const client = createMemo(() => {
		const s = activeServer();
		return s ? new SubsonicClient(s) : null;
	});

	const [playlists] = createResource(
		() => client(),
		async (c) => (c ? c.getPlaylists() : []),
	);

	return (
		<div class={styles.page}>
			<header class={styles.header}>
				<span class={styles.eyebrow}>Library</span>
				<h1 class={styles.title}>Playlists</h1>
			</header>

			<Show when={!playlists.loading} fallback={<div class={styles.empty}>Loading…</div>}>
				<Show
					when={(playlists() ?? []).length > 0}
					fallback={<div class={styles.empty}>No playlists yet.</div>}
				>
					<div class={styles.grid}>
						<For each={playlists()!}>
							{(playlist) => {
								const c = client();
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
										coverSrc={c?.coverArtUrl(playlist.coverArt ?? playlist.id, 360)}
									/>
								);
							}}
						</For>
					</div>
				</Show>
			</Show>
		</div>
	);
}
