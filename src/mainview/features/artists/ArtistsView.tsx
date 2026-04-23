import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { artistQuery, artistsQuery, clientFor } from "../../lib/queries";
import { MediaCard } from "../../components/MediaCard";
import { ArtistContextMenu } from "../../components/menus";
import type { Artist, ServerConfig } from "../../lib/subsonic";
import type { SubsonicClient } from "../../lib/subsonic/client";
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
												<ArtistCard
													server={props.server}
													client={client}
													artist={artist}
												/>
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

function ArtistCard(props: {
	server: ServerConfig;
	client: SubsonicClient;
	artist: Artist;
}) {
	const [visible, setVisible] = createSignal(false);
	let cardRef: HTMLDivElement | undefined;

	onMount(() => {
		if (!cardRef) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					setVisible(true);
					io.disconnect();
				}
			},
			{ rootMargin: "200px" },
		);
		io.observe(cardRef);
		onCleanup(() => io.disconnect());
	});

	const detail = createQuery(() => ({
		...artistQuery(
			{ client: props.client, serverId: props.server.id },
			props.artist.id,
		),
		enabled: visible(),
	}));

	const coverSrc = createMemo(() => {
		const full = detail.data;
		const imgUrl = full?.artistImageUrl || props.artist.artistImageUrl;
		if (imgUrl) return imgUrl;
		const coverId =
			full?.coverArt || props.artist.coverArt || props.artist.id;
		return props.client.coverArtUrl(coverId, 240);
	});

	return (
		<div ref={cardRef}>
			<ArtistContextMenu artist={props.artist}>
				<MediaCard
					href={`/artist/${encodeURIComponent(props.artist.id)}`}
					title={props.artist.name}
					subtitle={
						props.artist.albumCount != null
							? `${props.artist.albumCount} album${props.artist.albumCount === 1 ? "" : "s"}`
							: undefined
					}
					coverSrc={coverSrc()}
					round
				/>
			</ArtistContextMenu>
		</div>
	);
}
