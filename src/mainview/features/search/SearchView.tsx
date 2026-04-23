import { For, Index, Match, Show, Switch, createMemo } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { Play, Search, Star, X } from "lucide-solid";
import { $activeServer } from "../../stores/servers";
import { clientFor, genresQuery, searchQuery } from "../../lib/queries";
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

type Tab = "all" | "songs" | "albums" | "artists";
type YearBucket = "any" | "2020s" | "2010s" | "2000s" | "pre2000";

const TABS: { key: Tab; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "songs", label: "Songs" },
	{ key: "albums", label: "Albums" },
	{ key: "artists", label: "Artists" },
];

const YEAR_OPTIONS: { key: YearBucket; label: string }[] = [
	{ key: "any", label: "Any year" },
	{ key: "2020s", label: "2020s" },
	{ key: "2010s", label: "2010s" },
	{ key: "2000s", label: "2000s" },
	{ key: "pre2000", label: "Before 2000" },
];

function inBucket(year: number | undefined, bucket: YearBucket): boolean {
	if (bucket === "any") return true;
	if (year == null) return false;
	if (bucket === "2020s") return year >= 2020;
	if (bucket === "2010s") return year >= 2010 && year < 2020;
	if (bucket === "2000s") return year >= 2000 && year < 2010;
	if (bucket === "pre2000") return year < 2000;
	return true;
}

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
	const [params, setParams] = useSearchParams();
	const query = () => {
		const raw = params.q;
		return ((Array.isArray(raw) ? raw[0] : raw) ?? "").trim();
	};
	const tab = (): Tab => {
		const raw = (Array.isArray(params.tab) ? params.tab[0] : params.tab) as
			| Tab
			| undefined;
		return raw && TABS.some((t) => t.key === raw) ? raw : "all";
	};
	const starred = () => params.starred === "1";
	const year = (): YearBucket => {
		const raw = (Array.isArray(params.year) ? params.year[0] : params.year) as
			| YearBucket
			| undefined;
		return raw && YEAR_OPTIONS.some((y) => y.key === raw) ? raw : "any";
	};
	const genre = () => {
		const raw = Array.isArray(params.genre) ? params.genre[0] : params.genre;
		return raw ?? "";
	};
	const activeServer = useStore($activeServer);

	const hasFilters = () =>
		starred() || year() !== "any" || genre().length > 0;

	return (
		<div class={styles.page}>
			<header class={styles.header}>
				<span class={styles.eyebrow}>Search</span>
				<Show
					when={query().length > 0}
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
				when={query().length > 0}
				fallback={<EmptyPrompt />}
			>
				<Show
					when={activeServer()}
					fallback={<EmptyPrompt message="No server connected." />}
				>
					{(server) => (
						<>
							<div class={styles.controls}>
								<div class={styles.tabs} role="tablist">
									<For each={TABS}>
										{(t) => (
											<button
												type="button"
												role="tab"
												aria-selected={tab() === t.key}
												class={styles.tab}
												data-active={tab() === t.key}
												onClick={() =>
													setParams({ tab: t.key === "all" ? undefined : t.key })
												}
											>
												{t.label}
											</button>
										)}
									</For>
								</div>

								<div class={styles.chips}>
									<button
										type="button"
										class={styles.chip}
										data-active={starred()}
										onClick={() =>
											setParams({ starred: starred() ? undefined : "1" })
										}
										aria-pressed={starred()}
									>
										<Star
											class={styles.chipIcon}
											fill={starred() ? "currentColor" : "none"}
										/>
										Starred
									</button>

									<Show when={tab() !== "artists"}>
										<FilterSelect
											value={year()}
											onChange={(v) =>
												setParams({ year: v === "any" ? undefined : v })
											}
											options={YEAR_OPTIONS}
											active={year() !== "any"}
										/>

										<GenreFilter
											server={server()}
											value={genre()}
											onChange={(v) => setParams({ genre: v || undefined })}
										/>
									</Show>

									<Show when={hasFilters()}>
										<button
											type="button"
											class={styles.clearChips}
											onClick={() =>
												setParams({
													starred: undefined,
													year: undefined,
													genre: undefined,
												})
											}
										>
											<X class={styles.chipIcon} />
											Clear
										</button>
									</Show>
								</div>
							</div>

							<Body
								server={server()}
								query={query()}
								tab={tab()}
								starred={starred()}
								year={year()}
								genre={genre()}
							/>
						</>
					)}
				</Show>
			</Show>
		</div>
	);
}

function Body(props: {
	server: ServerConfig;
	query: string;
	tab: Tab;
	starred: boolean;
	year: YearBucket;
	genre: string;
}) {
	const client = clientFor(props.server);
	const ctx = { client, serverId: props.server.id };

	const query = createQuery(() => searchQuery(ctx, props.query));

	const filtered = createMemo<SearchResult>(() => {
		const raw = query.data ?? {};
		const songs = (raw.song ?? []).filter((s) => {
			if (props.starred && !s.starred) return false;
			if (!inBucket(s.year, props.year)) return false;
			if (props.genre && s.genre !== props.genre) return false;
			return true;
		});
		const albums = (raw.album ?? []).filter((a) => {
			if (props.starred && !a.starred) return false;
			if (!inBucket(a.year, props.year)) return false;
			if (props.genre && a.genre !== props.genre) return false;
			return true;
		});
		const artists = (raw.artist ?? []).filter((a) => {
			if (props.starred && !a.starred) return false;
			return true;
		});
		return { song: songs, album: albums, artist: artists };
	});

	const songs = () => filtered().song ?? [];
	const albums = () => filtered().album ?? [];
	const artists = () => filtered().artist ?? [];
	const top = () => pickTopResult(filtered());

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
						Try a different spelling, a shorter word, or clear filters.
					</p>
				</div>
			</Match>
			<Match when={!query.isPending}>
				<div class={styles.sections}>
					<Switch>
						<Match when={props.tab === "all"}>
							<Show when={top()}>
								{(t) => <TopResultCard top={t()} client={client} />}
							</Show>

							<Show when={songs().length > 0}>
								<section class={styles.songs}>
									<header class={styles.sectionHeader}>
										<span class={styles.sectionEyebrow}>Songs</span>
									</header>
									<TrackList
										songs={songs().slice(0, 10)}
										onPlay={(i) => playQueue(songs(), i)}
										showAlbum
									/>
								</section>
							</Show>

							<Show when={albums().length > 0}>
								<SectionRail title="Albums">
									<For each={albums().slice(0, 12)}>
										{(album) => (
											<AlbumCell album={album} client={client} />
										)}
									</For>
								</SectionRail>
							</Show>

							<Show when={artists().length > 0}>
								<SectionRail title="Artists">
									<For each={artists().slice(0, 10)}>
										{(artist) => (
											<ArtistCell artist={artist} client={client} />
										)}
									</For>
								</SectionRail>
							</Show>
						</Match>

						<Match when={props.tab === "songs"}>
							<Show
								when={songs().length > 0}
								fallback={<EmptyTabNote kind="songs" />}
							>
								<section class={styles.songs}>
									<header class={styles.sectionHeader}>
										<span class={styles.sectionEyebrow}>
											{songs().length} song{songs().length === 1 ? "" : "s"}
										</span>
									</header>
									<TrackList
										songs={songs()}
										onPlay={(i) => playQueue(songs(), i)}
										showAlbum
									/>
								</section>
							</Show>
						</Match>

						<Match when={props.tab === "albums"}>
							<Show
								when={albums().length > 0}
								fallback={<EmptyTabNote kind="albums" />}
							>
								<section class={styles.grid}>
									<header class={styles.sectionHeader}>
										<span class={styles.sectionEyebrow}>
											{albums().length} album{albums().length === 1 ? "" : "s"}
										</span>
									</header>
									<div class={styles.gridTiles}>
										<For each={albums()}>
											{(album) => (
												<AlbumCell album={album} client={client} />
											)}
										</For>
									</div>
								</section>
							</Show>
						</Match>

						<Match when={props.tab === "artists"}>
							<Show
								when={artists().length > 0}
								fallback={<EmptyTabNote kind="artists" />}
							>
								<section class={styles.grid}>
									<header class={styles.sectionHeader}>
										<span class={styles.sectionEyebrow}>
											{artists().length} artist{artists().length === 1 ? "" : "s"}
										</span>
									</header>
									<div class={styles.gridTiles}>
										<For each={artists()}>
											{(artist) => (
												<ArtistCell artist={artist} client={client} />
											)}
										</For>
									</div>
								</section>
							</Show>
						</Match>
					</Switch>
				</div>
			</Match>
		</Switch>
	);
}

function AlbumCell(props: { album: Album; client: SubsonicClient }) {
	return (
		<AlbumContextMenu album={props.album}>
			<MediaCard
				href={`/album/${encodeURIComponent(props.album.id)}`}
				title={props.album.name}
				subtitle={props.album.artist}
				meta={props.album.year ? String(props.album.year) : undefined}
				coverSrc={props.client.coverArtUrl(props.album.coverArt, 360)}
			/>
		</AlbumContextMenu>
	);
}

function ArtistCell(props: { artist: Artist; client: SubsonicClient }) {
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
				coverSrc={
					props.artist.artistImageUrl ??
					props.client.coverArtUrl(
						props.artist.coverArt ?? props.artist.id,
						240,
					)
				}
				round
			/>
		</ArtistContextMenu>
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

function FilterSelect<T extends string>(props: {
	value: T;
	onChange: (value: T) => void;
	options: { key: T; label: string }[];
	active: boolean;
}) {
	const current = () => props.options.find((o) => o.key === props.value);
	return (
		<label class={styles.chip} data-active={props.active}>
			<span class={styles.chipLabel}>{current()?.label ?? "Any"}</span>
			<select
				class={styles.chipSelect}
				value={props.value}
				onChange={(e) => props.onChange(e.currentTarget.value as T)}
			>
				<For each={props.options}>
					{(o) => <option value={o.key}>{o.label}</option>}
				</For>
			</select>
		</label>
	);
}

function GenreFilter(props: {
	server: ServerConfig;
	value: string;
	onChange: (value: string) => void;
}) {
	const client = clientFor(props.server);
	const genres = createQuery(() =>
		genresQuery({ client, serverId: props.server.id }),
	);
	const sorted = () =>
		[...(genres.data ?? [])].sort((a, b) => a.value.localeCompare(b.value));
	return (
		<label class={styles.chip} data-active={props.value.length > 0}>
			<span class={styles.chipLabel}>{props.value || "Any genre"}</span>
			<select
				class={styles.chipSelect}
				value={props.value}
				onChange={(e) => props.onChange(e.currentTarget.value)}
			>
				<option value="">Any genre</option>
				<For each={sorted()}>
					{(g) => <option value={g.value}>{g.value}</option>}
				</For>
			</select>
		</label>
	);
}

function EmptyTabNote(props: { kind: "songs" | "albums" | "artists" }) {
	const message = () => {
		if (props.kind === "songs") return "No matching songs.";
		if (props.kind === "albums") return "No matching albums.";
		return "No matching artists.";
	};
	return (
		<div class={styles.noResults}>
			<p>{message()}</p>
			<p class={styles.noResultsHint}>
				Try the <strong>All</strong> tab or clear filters.
			</p>
		</div>
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
