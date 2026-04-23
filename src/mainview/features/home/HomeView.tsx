import { For, Index, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { SubsonicClient } from "../../lib/subsonic/client";
import type { Album, AlbumListType, ServerConfig } from "../../lib/subsonic";
import { albumListQuery } from "../../lib/queries";
import { MediaCard } from "../../components/MediaCard";
import { SectionRail } from "../../components/SectionRail";
import styles from "./HomeView.module.css";

interface Rail {
	type: AlbumListType;
	eyebrow?: string;
	title: string;
	href: string;
}

const RAILS: Rail[] = [
	{ type: "recent", eyebrow: "Lately", title: "Recently added", href: "/albums?sort=recent" },
	{ type: "frequent", eyebrow: "You love", title: "Most played", href: "/albums?sort=frequent" },
	{ type: "starred", eyebrow: "Favorites", title: "Starred albums", href: "/albums?sort=starred" },
	{ type: "random", eyebrow: "Rediscover", title: "Random picks", href: "/albums?sort=random" },
];

function greeting(): string {
	const h = new Date().getHours();
	if (h < 5) return "Late night";
	if (h < 12) return "Good morning";
	if (h < 18) return "Good afternoon";
	return "Good evening";
}

export function HomeView() {
	const activeServer = useStore($activeServer);

	return (
		<div class={styles.home}>
			<header class={styles.greeting}>
				<span class={styles.eyebrow}>{greeting()}</span>
				<h1 class={styles.title}>Quiet hours, loud music.</h1>
				<Show when={activeServer()}>
					{(s) => (
						<p class={styles.subtitle}>
							Connected to {s().name}. Pick up where you left off or let something new in.
						</p>
					)}
				</Show>
			</header>

			<Show when={activeServer()}>
				{(server) => (
					<For each={RAILS}>
						{(rail) => (
							<AlbumRail
								server={server()}
								type={rail.type}
								eyebrow={rail.eyebrow}
								title={rail.title}
								href={rail.href}
							/>
						)}
					</For>
				)}
			</Show>
		</div>
	);
}

function AlbumRail(props: {
	server: ServerConfig;
	type: AlbumListType;
	eyebrow?: string;
	title: string;
	href: string;
}) {
	const query = createQuery(() =>
		albumListQuery(
			{ client: new SubsonicClient(props.server), serverId: props.server.id },
			props.type,
			20,
		),
	);

	return (
		<SectionRail eyebrow={props.eyebrow} title={props.title} moreHref={props.href}>
			<Show when={!query.isPending} fallback={<RailSkeleton />}>
				<Show
					when={(query.data ?? []).length > 0}
					fallback={<EmptyRail type={props.type} />}
				>
					<For each={query.data!}>
						{(album) => <AlbumCell album={album} server={props.server} />}
					</For>
				</Show>
			</Show>
		</SectionRail>
	);
}

function AlbumCell(props: { album: Album; server: ServerConfig }) {
	const client = new SubsonicClient(props.server);
	return (
		<MediaCard
			href={`/album/${encodeURIComponent(props.album.id)}`}
			title={props.album.name}
			subtitle={props.album.artist}
			meta={props.album.year ? String(props.album.year) : undefined}
			coverSrc={client.coverArtUrl(props.album.coverArt, 360)}
		/>
	);
}

function RailSkeleton() {
	return (
		<Index each={Array.from({ length: 8 })}>
			{() => (
				<div class={styles.skeletonCard}>
					<div class={styles.skeletonCover} />
					<div class={styles.skeletonLine} />
					<div class={styles.skeletonLine} data-short="true" />
				</div>
			)}
		</Index>
	);
}

function EmptyRail(props: { type: AlbumListType }) {
	const hint = () => {
		if (props.type === "starred") return "No starred albums yet.";
		if (props.type === "frequent") return "Play more and they'll show up here.";
		return "Nothing here yet.";
	};
	return <div class={styles.empty}>{hint()}</div>;
}
