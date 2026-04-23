import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { artistsQuery, clientFor } from "../../lib/queries";
import { MediaCard } from "../../components/MediaCard";
import { ArtistContextMenu } from "../../components/menus";
import type { Artist, ArtistIndex, ServerConfig } from "../../lib/subsonic";
import type { SubsonicClient } from "../../lib/subsonic/client";
import { artistCoverUrl } from "../../lib/artist-cover";
import styles from "./ArtistsView.module.css";

const LATIN_LETTER = /^[A-Za-z]$/;
const OTHER_LABEL = "#";
const OTHER_SLUG = "other";

// Conservative column estimate for the grid (minmax(140px, 1fr) at typical
// content widths). Only used to size the placeholder for not-yet-rendered
// sections — a rough estimate is fine, the scroll position re-settles once
// the cards paint.
const EST_COLS = 6;
const EST_CARD_HEIGHT = 220;
const EST_ROW_GAP = 24;

const sectionSlug = (name: string) =>
	LATIN_LETTER.test(name) ? name.toUpperCase() : OTHER_SLUG;

function estimateSectionHeight(count: number): number {
	const rows = Math.max(1, Math.ceil(count / EST_COLS));
	return rows * EST_CARD_HEIGHT + (rows - 1) * EST_ROW_GAP;
}

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

	// Track which section slugs have been revealed, so letter-jumper clicks
	// can force-render the target even when the IntersectionObserver hasn't
	// fired yet (prevents landing on an empty placeholder).
	const [revealed, setRevealed] = createSignal<Set<string>>(new Set());
	const reveal = (slug: string) => {
		const set = revealed();
		if (set.has(slug)) return;
		const next = new Set(set);
		next.add(slug);
		setRevealed(next);
	};

	const handleJump = (slug: string) => (e: Event) => {
		e.preventDefault();
		// Render the target section's cards immediately on jump so the scroll
		// lands on real content rather than a placeholder that then reflows.
		reveal(slug);
		requestAnimationFrame(() => {
			document.getElementById(`artist-index-${slug}`)?.scrollIntoView({
				behavior: "smooth",
				block: "start",
			});
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
							{(section) => {
								const slug = sectionSlug(section.name);
								return (
									<LazySection
										section={section}
										slug={slug}
										client={client}
										forceRender={() => revealed().has(slug)}
										onReveal={() => reveal(slug)}
									/>
								);
							}}
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

function LazySection(props: {
	section: ArtistIndex;
	slug: string;
	client: SubsonicClient;
	forceRender: () => boolean;
	onReveal: () => void;
}) {
	let sectionEl!: HTMLElement;

	onMount(() => {
		// Fire once: when the section gets within 600px of the viewport,
		// mark it revealed and stop observing. Cards stay mounted from
		// that point on — no re-instantiation on scroll away, so scrolling
		// back stays smooth.
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						props.onReveal();
						io.disconnect();
						break;
					}
				}
			},
			{ rootMargin: "600px 0px" },
		);
		io.observe(sectionEl);
		onCleanup(() => io.disconnect());
	});

	const placeholderStyle = () => ({
		"grid-column": "1 / -1",
		"min-height": `${estimateSectionHeight(props.section.artist.length)}px`,
	});

	return (
		<section
			ref={sectionEl}
			class={styles.section}
			id={`artist-index-${props.slug}`}
		>
			<span class={styles.indexLabel}>{props.section.name}</span>
			<div class={styles.grid}>
				<Show
					when={props.forceRender()}
					fallback={<div style={placeholderStyle()} aria-hidden="true" />}
				>
					<For each={props.section.artist}>
						{(artist, i) => (
							<ArtistCard
								client={props.client}
								artist={artist}
								index={i()}
							/>
						)}
					</For>
				</Show>
			</div>
		</section>
	);
}

function ArtistCard(props: {
	client: SubsonicClient;
	artist: Artist;
	index?: number;
}) {
	// Navidrome (and most OpenSubsonic servers) populate `artistImageUrl`
	// directly in getArtists — no per-card getArtist round-trip needed.
	// Firing one query per card was the source of the lag and also starved
	// the browser's image-loading slots, so the covers themselves never
	// appeared. For the rare artist without an artistImageUrl we fall
	// through to initials; the detail page's hero still cascades to an
	// album cover.
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
				coverSrc={artistCoverUrl(props.client, props.artist, 240)}
				round
				index={props.index}
			/>
		</ArtistContextMenu>
	);
}
