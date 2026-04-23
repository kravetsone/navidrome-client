import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
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

	const coverFallbackSrc = createMemo(() => {
		const firstAlbum = detail.data?.album?.[0];
		if (!firstAlbum?.coverArt) return undefined;
		return props.client.coverArtUrl(firstAlbum.coverArt, 240);
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
					coverFallbackSrc={coverFallbackSrc()}
					round
				/>
			</ArtistContextMenu>
		</div>
	);
}
