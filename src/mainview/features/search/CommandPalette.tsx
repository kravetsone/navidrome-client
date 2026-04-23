import {
	createEffect,
	createMemo,
	createSignal,
	For,
	Match,
	onCleanup,
	onMount,
	Show,
	Switch,
} from "solid-js";
import { Portal } from "solid-js/web";
import { useNavigate } from "@solidjs/router";
import { useStore } from "@nanostores/solid";
import { createQuery } from "@tanstack/solid-query";
import { ArrowRight, Search } from "lucide-solid";
import { $activeServer } from "../../stores/servers";
import {
	$paletteOpen,
	closePalette,
	togglePalette,
} from "../../stores/search-palette";
import type { SubsonicClient } from "../../lib/subsonic/client";
import type { SearchResult } from "../../lib/subsonic";
import { clientFor, searchQuery } from "../../lib/queries";
import { CoverArt } from "../../components/CoverArt";
import styles from "./CommandPalette.module.css";

interface FlatItem {
	kind: "artist" | "album" | "song";
	id: string;
	title: string;
	subtitle?: string;
	href: string;
	coverId?: string;
	round?: boolean;
}

function flatten(result: SearchResult | undefined): FlatItem[] {
	if (!result) return [];
	const items: FlatItem[] = [];
	for (const artist of result.artist ?? []) {
		items.push({
			kind: "artist",
			id: artist.id,
			title: artist.name,
			subtitle:
				artist.albumCount != null
					? `${artist.albumCount} album${artist.albumCount === 1 ? "" : "s"}`
					: undefined,
			href: `/artist/${encodeURIComponent(artist.id)}`,
			coverId: artist.coverArt ?? artist.id,
			round: true,
		});
	}
	for (const album of result.album ?? []) {
		items.push({
			kind: "album",
			id: album.id,
			title: album.name,
			subtitle: album.artist,
			href: `/album/${encodeURIComponent(album.id)}`,
			coverId: album.coverArt,
		});
	}
	for (const song of result.song ?? []) {
		items.push({
			kind: "song",
			id: song.id,
			title: song.title,
			subtitle: [song.artist, song.album].filter(Boolean).join(" · "),
			href: `/album/${encodeURIComponent(song.albumId ?? "")}`,
			coverId: song.coverArt,
		});
	}
	return items;
}

export function CommandPalette() {
	const open = useStore($paletteOpen);
	const [query, setQuery] = createSignal("");
	const [debounced, setDebounced] = createSignal("");
	const [active, setActive] = createSignal(0);
	const activeServer = useStore($activeServer);
	const navigate = useNavigate();

	const ctx = createMemo(() => {
		const server = activeServer();
		if (!server) return null;
		return { client: clientFor(server), serverId: server.id };
	});

	let inputRef!: HTMLInputElement;

	onMount(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				togglePalette();
			} else if (e.key === "Escape" && open()) {
				e.preventDefault();
				closePalette();
			}
		};
		window.addEventListener("keydown", onKey);
		onCleanup(() => window.removeEventListener("keydown", onKey));
	});

	createEffect(() => {
		if (open()) {
			setActive(0);
			queueMicrotask(() => inputRef?.focus());
		} else {
			setQuery("");
			setDebounced("");
		}
	});

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	createEffect(() => {
		const q = query();
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => setDebounced(q), 180);
	});
	onCleanup(() => debounceTimer && clearTimeout(debounceTimer));

	const search = createQuery(() => searchQuery(ctx(), debounced().trim()));

	const result = createMemo<SearchResult>(() => {
		const r = search.data ?? {};
		return {
			artist: r.artist?.slice(0, 4),
			album: r.album?.slice(0, 6),
			song: r.song?.slice(0, 8),
		};
	});
	const items = createMemo(() => flatten(result()));
	const hasActiveSearch = () => debounced().trim().length > 0;

	const goToFullSearch = () => {
		const q = debounced().trim();
		if (!q) return;
		closePalette();
		navigate(`/search?q=${encodeURIComponent(q)}`);
	};

	const handleItemKey = (e: KeyboardEvent) => {
		const list = items();
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActive((i) => Math.min(list.length - 1, i + 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActive((i) => Math.max(0, i - 1));
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (e.metaKey || e.ctrlKey) {
				goToFullSearch();
				return;
			}
			const item = list[active()];
			if (item) {
				closePalette();
				navigate(item.href);
			} else if (hasActiveSearch()) {
				goToFullSearch();
			}
		}
	};

	const handleSelect = (item: FlatItem) => {
		closePalette();
		navigate(item.href);
	};

	return (
		<Show when={open()}>
			<Portal>
				<div class={styles.overlay} onClick={() => closePalette()} role="presentation">
					<div
						class={styles.panel}
						role="dialog"
						aria-modal="true"
						aria-label="Search"
						onClick={(e) => e.stopPropagation()}
					>
						<div class={styles.inputRow}>
							<Search />
							<input
								ref={inputRef}
								class={styles.input}
								type="text"
								placeholder="Search artists, albums, songs…"
								value={query()}
								onInput={(e) => setQuery(e.currentTarget.value)}
								onKeyDown={handleItemKey}
								autocomplete="off"
								spellcheck={false}
							/>
							<span class={styles.shortcut}>Esc</span>
						</div>

						<div class={styles.results}>
							<Switch
								fallback={
									<div class={styles.hint}>
										Start typing to search your library.
										<br />
										<span class={styles.hintMono}>⌘K to open · Esc to close</span>
									</div>
								}
							>
								<Match when={hasActiveSearch() && items().length > 0}>
									<ResultSections
										result={result()}
										active={active()}
										client={ctx()?.client ?? null}
										onSelect={handleSelect}
									/>
								</Match>
								<Match when={hasActiveSearch() && search.isFetching && items().length === 0}>
									<div class={styles.hint}>Searching…</div>
								</Match>
								<Match when={hasActiveSearch() && items().length === 0 && !search.isFetching}>
									<div class={styles.hint}>No results for "{debounced()}".</div>
								</Match>
							</Switch>
						</div>

						<Show when={hasActiveSearch()}>
							<button
								type="button"
								class={styles.seeAll}
								onClick={goToFullSearch}
							>
								<Search />
								<span class={styles.seeAllText}>
									See all results for{" "}
									<span class={styles.seeAllQuery}>"{debounced()}"</span>
								</span>
								<ArrowRight />
							</button>
						</Show>

						<div class={styles.footer}>
							<span class={styles.footerKey}>
								<kbd>↑</kbd><kbd>↓</kbd> Navigate
							</span>
							<span class={styles.footerKey}>
								<kbd>↵</kbd> Open
							</span>
							<span class={styles.footerKey}>
								<kbd>⌘↵</kbd> See all
							</span>
							<span class={styles.footerKey}>
								<kbd>Esc</kbd> Close
							</span>
						</div>
					</div>
				</div>
			</Portal>
		</Show>
	);
}

function ResultSections(props: {
	result: SearchResult;
	active: number;
	client: SubsonicClient | null;
	onSelect: (item: FlatItem) => void;
}) {
	const flat = createMemo(() => flatten(props.result));
	const artists = () => (props.result.artist ?? []).length;
	const albums = () => (props.result.album ?? []).length;

	return (
		<>
			<Show when={artists() > 0}>
				<div class={styles.section}>
					<span class={styles.sectionLabel}>Artists</span>
					<For each={flat().slice(0, artists())}>
						{(item, index) => (
							<Item
								item={item}
								active={props.active === index()}
								client={props.client}
								onSelect={() => props.onSelect(item)}
							/>
						)}
					</For>
				</div>
			</Show>

			<Show when={albums() > 0}>
				<div class={styles.section}>
					<span class={styles.sectionLabel}>Albums</span>
					<For each={flat().slice(artists(), artists() + albums())}>
						{(item, index) => (
							<Item
								item={item}
								active={props.active === artists() + index()}
								client={props.client}
								onSelect={() => props.onSelect(item)}
							/>
						)}
					</For>
				</div>
			</Show>

			<Show when={(props.result.song ?? []).length > 0}>
				<div class={styles.section}>
					<span class={styles.sectionLabel}>Songs</span>
					<For each={flat().slice(artists() + albums())}>
						{(item, index) => (
							<Item
								item={item}
								active={props.active === artists() + albums() + index()}
								client={props.client}
								onSelect={() => props.onSelect(item)}
							/>
						)}
					</For>
				</div>
			</Show>
		</>
	);
}

function Item(props: {
	item: FlatItem;
	active: boolean;
	client: SubsonicClient | null;
	onSelect: () => void;
}) {
	return (
		<div
			class={styles.item}
			data-active={props.active}
			onClick={props.onSelect}
		>
			<CoverArt
				src={props.client?.coverArtUrl(props.item.coverId, 96)}
				name={props.item.title}
				round={props.item.round}
				size={36}
				class={props.item.round ? styles.itemRound : ""}
			/>
			<div class={styles.itemText}>
				<span class={styles.itemTitle}>{props.item.title}</span>
				<Show when={props.item.subtitle}>
					<span class={styles.itemSubtitle}>{props.item.subtitle}</span>
				</Show>
			</div>
			<span class={styles.itemKind}>{props.item.kind}</span>
		</div>
	);
}
