import { For, Index, Show, createMemo, createSignal } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { Popover } from "@kobalte/core/popover";
import { SlidersHorizontal, X } from "lucide-solid";
import { $activeServer } from "../../stores/servers";
import type { AlbumListType, ServerConfig } from "../../lib/subsonic";
import { albumListQuery, clientFor, genresQuery } from "../../lib/queries";
import { MediaCard } from "../../components/MediaCard";
import { AlbumContextMenu } from "../../components/menus";
import styles from "./AlbumsView.module.css";

type SortKey = "recent" | "newest" | "frequent" | "alphabeticalByName" | "starred" | "random";

const SORTS: { key: SortKey; label: string }[] = [
	{ key: "recent", label: "Recently added" },
	{ key: "frequent", label: "Most played" },
	{ key: "alphabeticalByName", label: "A–Z" },
	{ key: "starred", label: "Starred" },
	{ key: "random", label: "Random" },
];

interface Filters {
	genre?: string;
	fromYear?: number;
	toYear?: number;
}

export function AlbumsView() {
	const [searchParams, setSearchParams] = useSearchParams();
	const activeServer = useStore($activeServer);
	const sort = () => (searchParams.sort?.toString() as SortKey) || "recent";
	const filters = createMemo<Filters>(() => {
		const genre = searchParams.genre?.toString();
		const from = Number(searchParams.fromYear);
		const to = Number(searchParams.toYear);
		return {
			genre: genre && genre.length > 0 ? genre : undefined,
			fromYear: Number.isFinite(from) && from > 0 ? from : undefined,
			toYear: Number.isFinite(to) && to > 0 ? to : undefined,
		};
	});

	const hasActiveFilter = () =>
		Boolean(
			filters().genre ||
				filters().fromYear !== undefined ||
				filters().toYear !== undefined,
		);

	const effectiveType = createMemo<AlbumListType>(() => {
		const f = filters();
		if (f.fromYear !== undefined || f.toYear !== undefined) return "byYear";
		if (f.genre) return "byGenre";
		return sort() as AlbumListType;
	});

	const updateFilter = (patch: Partial<Filters>) => {
		const next: Record<string, string | undefined> = {
			genre: patch.genre ?? filters().genre,
			fromYear:
				patch.fromYear !== undefined
					? String(patch.fromYear)
					: filters().fromYear !== undefined
						? String(filters().fromYear)
						: undefined,
			toYear:
				patch.toYear !== undefined
					? String(patch.toYear)
					: filters().toYear !== undefined
						? String(filters().toYear)
						: undefined,
		};
		// Allow explicit removal: undefined values clear params
		if (patch.genre === "") next.genre = undefined;
		if (patch.fromYear === undefined && Object.hasOwn(patch, "fromYear")) {
			next.fromYear = undefined;
		}
		if (patch.toYear === undefined && Object.hasOwn(patch, "toYear")) {
			next.toYear = undefined;
		}
		setSearchParams(next);
	};

	const clearFilters = () => {
		setSearchParams({ genre: undefined, fromYear: undefined, toYear: undefined });
	};

	return (
		<div class={styles.page}>
			<header class={styles.header}>
				<div class={styles.titleGroup}>
					<span class={styles.eyebrow}>Library</span>
					<h1 class={styles.title}>Albums</h1>
				</div>
				<div class={styles.controls}>
					<div
						class={styles.sortGroup}
						role="tablist"
						data-disabled={hasActiveFilter()}
					>
						<For each={SORTS}>
							{(item) => (
								<button
									type="button"
									class={styles.sortOption}
									data-active={sort() === item.key}
									disabled={hasActiveFilter()}
									onClick={() => setSearchParams({ sort: item.key })}
								>
									{item.label}
								</button>
							)}
						</For>
					</div>
					<Show when={activeServer()}>
						{(server) => (
							<FilterPopover
								server={server()}
								filters={filters()}
								onChange={updateFilter}
								onClear={clearFilters}
							/>
						)}
					</Show>
				</div>
			</header>

			<Show when={hasActiveFilter()}>
				<ActiveFilters filters={filters()} onClear={clearFilters} />
			</Show>

			<Show when={activeServer()}>
				{(server) => (
					<AlbumsGrid
						server={server()}
						type={effectiveType()}
						filters={filters()}
					/>
				)}
			</Show>
		</div>
	);
}

function FilterPopover(props: {
	server: ServerConfig;
	filters: Filters;
	onChange: (patch: Partial<Filters>) => void;
	onClear: () => void;
}) {
	const client = clientFor(props.server);
	const genres = createQuery(() =>
		genresQuery({ client, serverId: props.server.id }),
	);
	const [from, setFrom] = createSignal(props.filters.fromYear?.toString() ?? "");
	const [to, setTo] = createSignal(props.filters.toYear?.toString() ?? "");

	const applyYears = () => {
		const fromN = Number(from());
		const toN = Number(to());
		props.onChange({
			fromYear: from().trim() && Number.isFinite(fromN) ? fromN : undefined,
			toYear: to().trim() && Number.isFinite(toN) ? toN : undefined,
		});
	};

	const sortedGenres = () =>
		[...(genres.data ?? [])].sort((a, b) => a.value.localeCompare(b.value));

	return (
		<Popover gutter={8} placement="bottom-end">
			<Popover.Trigger class={styles.filterBtn} aria-label="Filter">
				<SlidersHorizontal size={16} />
				<span>Filter</span>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content class={styles.filterPanel}>
					<div class={styles.filterField}>
						<label class={styles.filterLabel} for="filter-genre">
							Genre
						</label>
						<select
							id="filter-genre"
							class={styles.filterSelect}
							value={props.filters.genre ?? ""}
							onChange={(e) =>
								props.onChange({
									genre: e.currentTarget.value || "",
								})
							}
						>
							<option value="">All genres</option>
							<For each={sortedGenres()}>
								{(g) => (
									<option value={g.value}>
										{g.value}
										{g.albumCount ? ` (${g.albumCount})` : ""}
									</option>
								)}
							</For>
						</select>
					</div>

					<div class={styles.filterField}>
						<label class={styles.filterLabel}>Year range</label>
						<div class={styles.yearRow}>
							<input
								type="number"
								class={styles.filterInput}
								placeholder="From"
								value={from()}
								min="0"
								max="9999"
								onInput={(e) => setFrom(e.currentTarget.value)}
								onBlur={applyYears}
							/>
							<span class={styles.yearDash}>—</span>
							<input
								type="number"
								class={styles.filterInput}
								placeholder="To"
								value={to()}
								min="0"
								max="9999"
								onInput={(e) => setTo(e.currentTarget.value)}
								onBlur={applyYears}
							/>
						</div>
					</div>

					<button
						type="button"
						class={styles.filterClear}
						onClick={() => {
							setFrom("");
							setTo("");
							props.onClear();
						}}
					>
						Clear all
					</button>
				</Popover.Content>
			</Popover.Portal>
		</Popover>
	);
}

function ActiveFilters(props: { filters: Filters; onClear: () => void }) {
	const tags = () => {
		const t: { label: string }[] = [];
		if (props.filters.genre) t.push({ label: `Genre: ${props.filters.genre}` });
		if (props.filters.fromYear !== undefined || props.filters.toYear !== undefined) {
			const f = props.filters.fromYear ?? "…";
			const to = props.filters.toYear ?? "…";
			t.push({ label: `Years: ${f}–${to}` });
		}
		return t;
	};

	return (
		<div class={styles.activeFilters}>
			<For each={tags()}>
				{(tag) => <span class={styles.filterChip}>{tag.label}</span>}
			</For>
			<button type="button" class={styles.clearBtn} onClick={props.onClear}>
				<X size={14} />
				<span>Clear</span>
			</button>
		</div>
	);
}

function AlbumsGrid(props: {
	server: ServerConfig;
	type: AlbumListType;
	filters: Filters;
}) {
	const client = clientFor(props.server);
	const query = createQuery(() =>
		albumListQuery(
			{ client, serverId: props.server.id },
			props.type,
			500,
			props.filters,
		),
	);

	return (
		<Show when={!query.isPending} fallback={<GridSkeleton count={24} />}>
			<Show
				when={(query.data ?? []).length > 0}
				fallback={<EmptyState />}
			>
				<div class={styles.grid}>
					<For each={query.data!}>
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
			</Show>
		</Show>
	);
}

function GridSkeleton(props: { count: number }) {
	return (
		<div class={styles.grid}>
			<Index each={Array.from({ length: props.count })}>
				{() => (
					<div class={styles.skeleton}>
						<div class={styles.skeletonCover} />
						<div class={styles.skeletonLine} />
						<div class={styles.skeletonLine} data-short="true" />
					</div>
				)}
			</Index>
		</div>
	);
}

function EmptyState() {
	return (
		<div style={{ padding: "var(--space-10)", "text-align": "center", color: "var(--text-secondary)" }}>
			No albums matched.
		</div>
	);
}
