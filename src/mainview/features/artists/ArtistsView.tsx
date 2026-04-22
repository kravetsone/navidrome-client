import { createMemo, createResource, For, Show } from "solid-js";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { SubsonicClient } from "../../lib/subsonic/client";
import { MediaCard } from "../../components/MediaCard";
import styles from "./ArtistsView.module.css";

export function ArtistsView() {
	const activeServer = useStore($activeServer);

	const client = createMemo(() => {
		const s = activeServer();
		return s ? new SubsonicClient(s) : null;
	});

	const [indexes] = createResource(
		() => client(),
		async (c) => (c ? c.getArtists() : []),
	);

	const handleJump = (letter: string) => (e: Event) => {
		e.preventDefault();
		document.getElementById(`artist-index-${letter}`)?.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	};

	return (
		<div class={styles.page}>
			<header class={styles.header}>
				<span class={styles.eyebrow}>Library</span>
				<h1 class={styles.title}>Artists</h1>
			</header>

			<Show when={!indexes.loading} fallback={<div class={styles.empty}>Loading…</div>}>
				<Show
					when={(indexes() ?? []).length > 0}
					fallback={<div class={styles.empty}>No artists yet.</div>}
				>
					<div class={styles.body}>
						<div class={styles.sections}>
							<For each={indexes()!}>
								{(section) => (
									<section
										class={styles.section}
										id={`artist-index-${section.name}`}
									>
										<span class={styles.indexLabel}>{section.name}</span>
										<div class={styles.grid}>
											<For each={section.artist}>
												{(artist) => {
													const c = client();
													return (
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
																c?.coverArtUrl(artist.coverArt ?? artist.id, 240)
															}
															round
														/>
													);
												}}
											</For>
										</div>
									</section>
								)}
							</For>
						</div>

						<nav class={styles.jumper} aria-label="Jump to letter">
							<For each={indexes()!}>
								{(section) => (
									<a
										href={`#artist-index-${section.name}`}
										class={styles.jumpLink}
										onClick={handleJump(section.name)}
									>
										{section.name}
									</a>
								)}
							</For>
						</nav>
					</div>
				</Show>
			</Show>
		</div>
	);
}
