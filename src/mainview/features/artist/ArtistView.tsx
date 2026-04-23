import { For, Show, createEffect, createMemo, onCleanup } from "solid-js";
import { useParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { artistQuery, clientFor } from "../../lib/queries";
import type { ServerConfig } from "../../lib/subsonic";
import { CoverArt } from "../../components/CoverArt";
import { MediaCard } from "../../components/MediaCard";
import {
	applyAmbientPalette,
	extractAmbientPalette,
	resetAmbientPalette,
} from "../../lib/palette";
import styles from "./ArtistView.module.css";

export function ArtistView() {
	const params = useParams<{ id: string }>();
	const activeServer = useStore($activeServer);

	return (
		<Show when={activeServer()} fallback={<div class={styles.empty}>No server</div>}>
			{(server) => <ArtistBody server={server()} id={params.id} />}
		</Show>
	);
}

function ArtistBody(props: { server: ServerConfig; id: string }) {
	const client = clientFor(props.server);
	const query = createQuery(() =>
		artistQuery({ client, serverId: props.server.id }, props.id),
	);

	const heroSrc = createMemo(() => {
		const a = query.data;
		if (!a) return undefined;
		return (
			a.artistImageUrl ??
			client.coverArtUrl(a.coverArt ?? a.id, 360)
		);
	});

	const paletteUrl = createMemo(() => {
		const a = query.data;
		if (!a) return undefined;
		return a.artistImageUrl ?? client.coverArtUrl(a.coverArt ?? a.id, 96);
	});

	createEffect(() => {
		const url = paletteUrl();
		if (!url) return;
		extractAmbientPalette(url).then((p) => {
			if (p) applyAmbientPalette(p);
		});
	});

	onCleanup(() => resetAmbientPalette());

	return (
		<Show
			when={!query.isPending}
			fallback={<div class={styles.loading}>Loading…</div>}
		>
			<Show
				when={query.data}
				fallback={<div class={styles.empty}>Artist not found.</div>}
			>
				{(artist) => {
					const albums = () => artist().album ?? [];
					return (
						<article class={styles.page}>
							<section class={styles.hero}>
								<CoverArt
									src={heroSrc()}
									name={artist().name}
									class={styles.avatar}
									round
								/>
								<div class={styles.heroText}>
									<span class={styles.eyebrow}>Artist</span>
									<h1 class={styles.title}>{artist().name}</h1>
									<Show when={albums().length > 0}>
										<p class={styles.meta}>
											{albums().length} album
											{albums().length === 1 ? "" : "s"}
										</p>
									</Show>
								</div>
							</section>

							<Show when={albums().length > 0}>
								<section class={styles.section}>
									<header class={styles.sectionHead}>
										<h2 class={styles.sectionTitle}>Albums</h2>
									</header>
									<div class={styles.grid}>
										<For each={albums()}>
											{(album) => (
												<MediaCard
													href={`/album/${encodeURIComponent(album.id)}`}
													title={album.name}
													subtitle={
														album.year ? String(album.year) : undefined
													}
													coverSrc={client.coverArtUrl(album.coverArt, 360)}
												/>
											)}
										</For>
									</div>
								</section>
							</Show>
						</article>
					);
				}}
			</Show>
		</Show>
	);
}
