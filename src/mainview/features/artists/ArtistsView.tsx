import { For, Show, createMemo } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { artistQuery, artistsQuery, clientFor } from "../../lib/queries";
import { MediaCard } from "../../components/MediaCard";
import { ArtistContextMenu } from "../../components/menus";
import type { Artist, ArtistIndex, ServerConfig } from "../../lib/subsonic";
import type { SubsonicClient } from "../../lib/subsonic/client";
import styles from "./ArtistsView.module.css";

const LATIN_LETTER = /^[A-Za-z]$/;
const OTHER_LABEL = "#";
const OTHER_SLUG = "other";

const sectionSlug = (name: string) =>
	LATIN_LETTER.test(name) ? name.toUpperCase() : OTHER_SLUG;

function groupSections(raw: ArtistIndex[]): ArtistIndex[] {
	const buckets = new Map<string, Artist[]>();
	const other: Artist[] = [];
	for (const section of raw) {
		if (LATIN_LETTER.test(section.name)) {
			const key = section.name.toUpperCase();
			const bucket = buckets.get(key);
			if (bucket) bucket.push(...section.artist);
			else buckets.set(key, [...section.artist]);
		} else {
			other.push(...section.artist);
		}
	}
	const result: ArtistIndex[] = [...buckets.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, artist]) => ({
			name,
			artist: artist.slice().sort((a, b) => a.name.localeCompare(b.name)),
		}));
	if (other.length > 0) {
		result.push({
			name: OTHER_LABEL,
			artist: other.sort((a, b) => a.name.localeCompare(b.name)),
		});
	}
	return result;
}

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

	const sections = createMemo(() => groupSections(query.data ?? []));

	const handleJump = (slug: string) => (e: Event) => {
		e.preventDefault();
		document.getElementById(`artist-index-${slug}`)?.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	};

	return (
		<Show when={!query.isPending} fallback={<div class={styles.empty}>Loading…</div>}>
			<Show
				when={sections().length > 0}
				fallback={<div class={styles.empty}>No artists yet.</div>}
			>
				<div class={styles.body}>
					<div class={styles.sections}>
						<For each={sections()}>
							{(section) => (
								<section
									class={styles.section}
									id={`artist-index-${sectionSlug(section.name)}`}
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
						<For each={sections()}>
							{(section) => {
								const slug = sectionSlug(section.name);
								return (
									<a
										href={`#artist-index-${slug}`}
										class={styles.jumpLink}
										onClick={handleJump(slug)}
									>
										{section.name}
									</a>
								);
							}}
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
	const detail = createQuery(() =>
		artistQuery(
			{ client: props.client, serverId: props.server.id },
			props.artist.id,
		),
	);

	const albumFallback = createMemo(() => {
		const album = detail.data?.album?.find((a) => a.coverArt);
		if (!album?.coverArt) return undefined;
		return props.client.coverArtUrl(album.coverArt, 240);
	});

	const coverSrc = createMemo(() => {
		const full = detail.data;
		const imgUrl = full?.artistImageUrl || props.artist.artistImageUrl;
		if (imgUrl) return imgUrl;
		const coverId = full?.coverArt || props.artist.coverArt;
		if (coverId) return props.client.coverArtUrl(coverId, 240);
		// Prefer the album cover directly when we have it — skips a guaranteed
		// 404 on getCoverArt(artistId) for Navidrome instances without a
		// metadata agent (Last.fm/Spotify).
		const album = albumFallback();
		if (album) return album;
		return props.client.coverArtUrl(props.artist.id, 240);
	});

	const coverFallbackSrc = createMemo(() => {
		// Only used when coverSrc itself fails; same album lookup, harmless
		// duplication since SubsonicClient caches identical URLs.
		return albumFallback();
	});

	return (
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
				coverFallbackSrc={coverFallbackSrc()}
				round
			/>
		</ArtistContextMenu>
	);
}
