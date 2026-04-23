import { For, Show, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { useStore } from "@nanostores/solid";
import { Plus } from "lucide-solid";
import { $activeServer } from "../../stores/servers";
import {
	clientFor,
	createPlaylistMutation,
	playlistsQuery,
} from "../../lib/queries";
import { MediaCard } from "../../components/MediaCard";
import { Modal } from "../../components/Modal";
import { PlaylistContextMenu } from "../../components/menus";
import type { ServerConfig } from "../../lib/subsonic";
import styles from "./PlaylistsView.module.css";

function formatDuration(seconds?: number): string {
	if (!seconds) return "";
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

export function PlaylistsView() {
	const activeServer = useStore($activeServer);
	const [dialogOpen, setDialogOpen] = createSignal(false);

	return (
		<div class={styles.page}>
			<header class={styles.header}>
				<div class={styles.titleGroup}>
					<span class={styles.eyebrow}>Library</span>
					<h1 class={styles.title}>Playlists</h1>
				</div>
				<Show when={activeServer()}>
					<button
						type="button"
						class={styles.newBtn}
						onClick={() => setDialogOpen(true)}
					>
						<Plus size={16} />
						<span>New playlist</span>
					</button>
				</Show>
			</header>

			<Show when={activeServer()}>
				{(server) => <PlaylistsGrid server={server()} />}
			</Show>

			<Show when={activeServer()}>
				{(server) => (
					<NewPlaylistDialog
						server={server()}
						open={dialogOpen()}
						onOpenChange={setDialogOpen}
					/>
				)}
			</Show>
		</div>
	);
}

function PlaylistsGrid(props: { server: ServerConfig }) {
	const client = clientFor(props.server);
	const query = createQuery(() =>
		playlistsQuery({ client, serverId: props.server.id }),
	);

	return (
		<Show when={!query.isPending} fallback={<div class={styles.empty}>Loading…</div>}>
			<Show
				when={(query.data ?? []).length > 0}
				fallback={<div class={styles.empty}>No playlists yet.</div>}
			>
				<div class={styles.grid}>
					<For each={query.data!}>
						{(playlist) => {
							const subtitle =
								playlist.songCount != null
									? `${playlist.songCount} song${playlist.songCount === 1 ? "" : "s"}`
									: playlist.owner;
							return (
								<PlaylistContextMenu playlist={playlist}>
									<MediaCard
										href={`/playlist/${encodeURIComponent(playlist.id)}`}
										title={playlist.name}
										subtitle={subtitle}
										meta={formatDuration(playlist.duration)}
										coverSrc={client.coverArtUrl(playlist.coverArt ?? playlist.id, 360)}
									/>
								</PlaylistContextMenu>
							);
						}}
					</For>
				</div>
			</Show>
		</Show>
	);
}

function NewPlaylistDialog(props: {
	server: ServerConfig;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [name, setName] = createSignal("");

	const mutation = createMutation(() =>
		createPlaylistMutation({
			client: clientFor(props.server),
			serverId: props.server.id,
			queryClient,
		}),
	);

	const submit = (e: SubmitEvent) => {
		e.preventDefault();
		const n = name().trim();
		if (!n) return;
		mutation.mutate(
			{ name: n },
			{
				onSuccess: (playlist) => {
					setName("");
					props.onOpenChange(false);
					if (playlist?.id) navigate(`/playlist/${encodeURIComponent(playlist.id)}`);
				},
			},
		);
	};

	return (
		<Modal
			open={props.open}
			onOpenChange={(open) => {
				props.onOpenChange(open);
				if (!open) setName("");
			}}
			title="New playlist"
			description="Name your playlist. You can add tracks later."
		>
			<form onSubmit={submit} class={styles.formField}>
				<label class={styles.formLabel} for="new-playlist-name">
					Name
				</label>
				<input
					id="new-playlist-name"
					class={styles.formInput}
					value={name()}
					onInput={(e) => setName(e.currentTarget.value)}
					autocomplete="off"
					autofocus
					placeholder="Late night drives"
				/>
				<div class={styles.formActions}>
					<button
						type="button"
						class={styles.btnSecondary}
						onClick={() => props.onOpenChange(false)}
					>
						Cancel
					</button>
					<button
						type="submit"
						class={styles.btnPrimary}
						disabled={!name().trim() || mutation.isPending}
					>
						{mutation.isPending ? "Creating…" : "Create"}
					</button>
				</div>
			</form>
		</Modal>
	);
}
