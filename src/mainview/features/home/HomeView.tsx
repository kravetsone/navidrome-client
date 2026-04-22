import { createMemo, createResource, For, Index, Show } from "solid-js";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { SubsonicClient } from "../../lib/subsonic/client";
import type { Album, AlbumListType, ServerConfig } from "../../lib/subsonic";
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
				{(server) => <Rails server={server()} />}
			</Show>
		</div>
	);
}

function Rails(props: { server: ServerConfig }) {
	const client = createMemo(() => new SubsonicClient(props.server));

	return (
		<>
			<For each={RAILS}>
				{(rail) => (
					<AlbumRail
						client={client()}
						type={rail.type}
						eyebrow={rail.eyebrow}
						title={rail.title}
						href={rail.href}
					/>
				)}
			</For>
		</>
	);
}

function AlbumRail(props: {
	client: SubsonicClient;
	type: AlbumListType;
	eyebrow?: string;
	title: string;
	href: string;
}) {
	const [albums] = createResource(
		() => ({ client: props.client, type: props.type }),
		async ({ client, type }) => client.getAlbumList2({ type, size: 20 }),
	);

	return (
		<SectionRail eyebrow={props.eyebrow} title={props.title} moreHref={props.href}>
			<Show when={!albums.loading} fallback={<RailSkeleton />}>
				<Show
					when={(albums() ?? []).length > 0}
					fallback={<EmptyRail type={props.type} />}
				>
					<For each={albums()!}>
						{(album) => <AlbumCell album={album} client={props.client} />}
					</For>
				</Show>
			</Show>
		</SectionRail>
	);
}

function AlbumCell(props: { album: Album; client: SubsonicClient }) {
	return (
		<MediaCard
			href={`/album/${encodeURIComponent(props.album.id)}`}
			title={props.album.name}
			subtitle={props.album.artist}
			meta={props.album.year ? String(props.album.year) : undefined}
			coverSrc={props.client.coverArtUrl(props.album.coverArt, 360)}
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
