import { For, Index, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { SubsonicClient } from "../../lib/subsonic/client";
import type { AlbumListType } from "../../lib/subsonic";
import { albumListQuery } from "../../lib/queries";
import { MediaCard } from "../../components/MediaCard";
import styles from "./AlbumsView.module.css";

type SortKey = "recent" | "newest" | "frequent" | "alphabeticalByName" | "starred" | "random";

const SORTS: { key: SortKey; label: string }[] = [
	{ key: "recent", label: "Recently added" },
	{ key: "frequent", label: "Most played" },
	{ key: "alphabeticalByName", label: "A–Z" },
	{ key: "starred", label: "Starred" },
	{ key: "random", label: "Random" },
];

export function AlbumsView() {
	const [searchParams, setSearchParams] = useSearchParams();
	const activeServer = useStore($activeServer);
	const sort = () => (searchParams.sort?.toString() as SortKey) || "recent";

	return (
		<div class={styles.page}>
			<header class={styles.header}>
				<div class={styles.titleGroup}>
					<span class={styles.eyebrow}>Library</span>
					<h1 class={styles.title}>Albums</h1>
				</div>
				<div class={styles.sortGroup} role="tablist">
					<For each={SORTS}>
						{(item) => (
							<button
								type="button"
								class={styles.sortOption}
								data-active={sort() === item.key}
								onClick={() => setSearchParams({ sort: item.key })}
							>
								{item.label}
							</button>
						)}
					</For>
				</div>
			</header>

			<Show when={activeServer()}>
				{(server) => <AlbumsGrid server={server()} sort={sort()} />}
			</Show>
		</div>
	);
}

function AlbumsGrid(props: { server: ReturnType<typeof $activeServer.get> & {}; sort: SortKey }) {
	const client = new SubsonicClient(props.server);
	const query = createQuery(() =>
		albumListQuery(
			{ client, serverId: props.server.id },
			props.sort as AlbumListType,
			500,
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
							<MediaCard
								href={`/album/${encodeURIComponent(album.id)}`}
								title={album.name}
								subtitle={album.artist}
								meta={album.year ? String(album.year) : undefined}
								coverSrc={client.coverArtUrl(album.coverArt, 360)}
							/>
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
