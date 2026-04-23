import { For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { artistsQuery, clientFor } from "../../lib/queries";
import { MediaCard } from "../../components/MediaCard";
import { ArtistContextMenu } from "../../components/menus";
import type { ServerConfig } from "../../lib/subsonic";
import styles from "./ArtistsView.module.css";

export function ArtistsView() {
	const activeServer = useStore($activeServer);

	return (
		<div class={styles.page}>
			<header class={styles.header}>
				<span class={styles.eyebrow}>Library</span>
				<h1 class={styles.title}>Artists</h1>
			</header>

			<Show when={activeServer()}>
				{(server) => <ArtistsBody server={server()} />}
			</Show>
		</div>
	);
}

function ArtistsBody(props: { server: ServerConfig }) {
	const client = clientFor(props.server);
	const query = createQuery(() =>
		artistsQuery({ client, serverId: props.server.id }),
	);

	const handleJump = (letter: string) => (e: Event) => {
		e.preventDefault();
		document.getElementById(`artist-index-${letter}`)?.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	};

	return (
		<Show when={!query.isPending} fallback={<div class={styles.empty}>Loading…</div>}>
			<Show
				when={(query.data ?? []).length > 0}
				fallback={<div class={styles.empty}>No artists yet.</div>}
			>
				<div class={styles.body}>
					<div class={styles.sections}>
						<For each={query.data!}>
							{(section) => (
								<section
									class={styles.section}
									id={`artist-index-${section.name}`}
								>
									<span class={styles.indexLabel}>{section.name}</span>
									<div class={styles.grid}>
										<For each={section.artist}>
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
														coverSrc={
															artist.artistImageUrl ||
															client.coverArtUrl(artist.coverArt || artist.id, 240)
														}
														round
													/>
												</ArtistContextMenu>
											)}
										</For>
									</div>
								</section>
							)}
						</For>
					</div>

					<nav class={styles.jumper} aria-label="Jump to letter">
						<For each={query.data!}>
							{(section) => (
								<a
									href={`#artist-index-${section.name}`}
									class={styles.jumpLink}
									onClick={handleJump(section.name)}
								>
									{section.name}
								</a>
							)}
						</For>
					</nav>
				</div>
			</Show>
		</Show>
	);
}
