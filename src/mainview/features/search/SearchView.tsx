import { For, Index, Match, Show, Switch, createMemo } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { Play, Search } from "lucide-solid";
import { $activeServer } from "../../stores/servers";
import { clientFor, searchQuery } from "../../lib/queries";
import type {
	Album,
	Artist,
	SearchResult,
	ServerConfig,
} from "../../lib/subsonic";
import type { SubsonicClient } from "../../lib/subsonic/client";
import { CoverArt } from "../../components/CoverArt";
import { MediaCard } from "../../components/MediaCard";
import { SectionRail } from "../../components/SectionRail";
import { TrackList } from "../../components/TrackList";
import {
	AlbumContextMenu,
	ArtistContextMenu,
} from "../../components/menus";
import { playQueue } from "../../stores/player";
import { openPalette } from "../../stores/search-palette";
import styles from "./SearchView.module.css";

type TopResult =
	| { kind: "artist"; artist: Artist }
	| { kind: "album"; album: Album };

function pickTopResult(result: SearchResult): TopResult | null {
	const artist = result.artist?.[0];
	if (artist) return { kind: "artist", artist };
	const album = result.album?.[0];
	if (album) return { kind: "album", album };
	return null;
}

export function SearchView() {
	const [params] = useSearchParams();
	const query = () => {
		const raw = params.q;
		return (Array.isArray(raw) ? raw[0] : raw) ?? "";
	};
	const activeServer = useStore($activeServer);

	return (
		<div class={styles.page}>
			<header class={styles.header}>
				<span class={styles.eyebrow}>Search</span>
				<Show
					when={query().trim().length > 0}
					fallback={
						<h1 class={styles.title}>Find anything in your library.</h1>
					}
				>
					<h1 class={styles.title}>
						Results for <em class={styles.titleQuery}>"{query()}"</em>
					</h1>
				</Show>
				<div class={styles.headerActions}>
					<button
						type="button"
						class={styles.refineButton}
						onClick={() => openPalette()}
					>
						<Search />
						<span>{query() ? "Refine search" : "Start searching"}</span>
						<kbd>⌘K</kbd>
					</button>
				</div>
			</header>

			<Show
				when={query().trim().length > 0}
				fallback={<EmptyPrompt />}
			>
				<Show when={activeServer()} fallback={<EmptyPrompt message="No server connected." />}>
					{(server) => <Body server={server()} query={query().trim()} />}
				</Show>
			</Show>
		</div>
	);
}

function Body(props: { server: ServerConfig; query: string }) {
	const client = clientFor(props.server);
	const ctx = { client, serverId: props.server.id };

	const query = createQuery(() =>
		searchQuery(ctx, props.query, { artist: 10, album: 12, song: 10 }),
	);

	const result = createMemo<SearchResult>(() => query.data ?? {});
	const top = createMemo(() => pickTopResult(result()));
	const songs = () => result().song ?? [];
	const albums = () => result().album ?? [];
	const artists = () => result().artist ?? [];
	const isEmpty = () =>
		!query.isPending &&
		songs().length === 0 &&
		albums().length === 0 &&
		artists().length === 0;

	return (
		<Switch>
			<Match when={query.isPending}>
				<LoadingSkeleton />
			</Match>
			<Match when={isEmpty()}>
				<div class={styles.noResults}>
					<p>No matches for "{props.query}".</p>
					<p class={styles.noResultsHint}>
						Try a different spelling, a shorter word, or the artist's name only.
					</p>
				</div>
			</Match>
			<Match when={!query.isPending}>
				<div class={styles.sections}>
					<Show when={top()}>
						{(t) => <TopResultCard top={t()} client={client} />}
					</Show>

					<Show when={songs().length > 0}>
						<section class={styles.songs}>
							<header class={styles.sectionHeader}>
								<span class={styles.sectionEyebrow}>Songs</span>
							</header>
							<TrackList
								songs={songs()}
								onPlay={(i) => playQueue(songs(), i)}
								showAlbum
							/>
						</section>
					</Show>

					<Show when={albums().length > 0}>
						<SectionRail title="Albums">
							<For each={albums()}>
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
						</SectionRail>
					</Show>

					<Show when={artists().length > 0}>
						<SectionRail title="Artists">
							<For each={artists()}>
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
												artist.artistImageUrl ??
												client.coverArtUrl(artist.coverArt ?? artist.id, 240)
											}
											round
										/>
									</ArtistContextMenu>
								)}
							</For>
						</SectionRail>
					</Show>
				</div>
			</Match>
		</Switch>
	);
}

function TopResultCard(props: { top: TopResult; client: SubsonicClient }) {
	if (props.top.kind === "artist") {
		const a = props.top.artist;
		return (
			<section class={styles.topResult}>
				<span class={styles.sectionEyebrow}>Top result</span>
				<A
					href={`/artist/${encodeURIComponent(a.id)}`}
					class={styles.topCard}
					data-kind="artist"
				>
					<CoverArt
						src={a.artistImageUrl ?? props.client.coverArtUrl(a.coverArt ?? a.id, 480)}
						name={a.name}
						round
						class={styles.topCover}
					/>
					<div class={styles.topText}>
						<span class={styles.topKind}>Artist</span>
						<h2 class={styles.topTitle}>{a.name}</h2>
						<Show when={a.albumCount != null}>
							<span class={styles.topMeta}>
								{a.albumCount} album{a.albumCount === 1 ? "" : "s"}
							</span>
						</Show>
					</div>
				</A>
			</section>
		);
	}

	const album = props.top.album;
	return (
		<section class={styles.topResult}>
			<span class={styles.sectionEyebrow}>Top result</span>
			<A
				href={`/album/${encodeURIComponent(album.id)}`}
				class={styles.topCard}
				data-kind="album"
			>
				<CoverArt
					src={props.client.coverArtUrl(album.coverArt, 480)}
					name={album.name}
					class={styles.topCover}
				/>
				<div class={styles.topText}>
					<span class={styles.topKind}>Album</span>
					<h2 class={styles.topTitle}>{album.name}</h2>
					<Show when={album.artist}>
						<span class={styles.topMeta}>
							{album.artist}
							<Show when={album.year}>
								{" · "}
								{album.year}
							</Show>
						</span>
					</Show>
				</div>
			</A>
		</section>
	);
}

function EmptyPrompt(props: { message?: string } = {}) {
	return (
		<div class={styles.empty}>
			<Play class={styles.emptyIcon} />
			<p class={styles.emptyTitle}>
				{props.message ?? "Start typing to search your library."}
			</p>
			<p class={styles.emptyHint}>
				Press <kbd>⌘K</kbd> anywhere to open the command palette.
			</p>
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<div class={styles.sections}>
			<div class={styles.skeletonTop} />
			<div class={styles.skeletonRows}>
				<Index each={Array.from({ length: 6 })}>
					{() => <div class={styles.skeletonRow} />}
				</Index>
			</div>
			<div class={styles.skeletonRail}>
				<Index each={Array.from({ length: 6 })}>
					{() => <div class={styles.skeletonCard} />}
				</Index>
			</div>
		</div>
	);
}
