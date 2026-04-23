import { useStore } from "@nanostores/solid";
import { useNavigate } from "@solidjs/router";
import {
	useQueryClient,
	createMutation,
	createQuery,
} from "@tanstack/solid-query";
import {
	Disc3,
	Download,
	Heart,
	HeartOff,
	Link as LinkIcon,
	ListMusic,
	ListPlus,
	Pencil,
	Play,
	Trash2,
	User,
} from "lucide-solid";
import { $activeServer } from "../stores/servers";
import {
	addToQueue,
	playNextInQueue,
	playQueue,
	playSong,
} from "../stores/player";
import { clientFor } from "../lib/queries/useActiveClient";
import {
	deletePlaylistMutation,
	playlistsQuery,
	starMutation,
	updatePlaylistMutation,
} from "../lib/queries";
import { pushToast } from "../stores/toast";
import type { Album, Artist, Playlist, Song } from "../lib/subsonic";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import type { JSX, ValidComponent } from "solid-js";

async function copyText(text: string) {
	try {
		await navigator.clipboard.writeText(text);
		pushToast("Link copied", { variant: "success", duration: 2000 });
	} catch {
		pushToast("Couldn't copy to clipboard", { variant: "error" });
	}
}

function openExternal(url: string) {
	const a = document.createElement("a");
	a.href = url;
	a.target = "_blank";
	a.rel = "noopener noreferrer";
	a.click();
}

interface BaseProps {
	as?: ValidComponent;
	triggerClass?: string;
	triggerProps?: Record<string, unknown>;
	children: JSX.Element;
}

interface SongMenuProps extends BaseProps {
	song: Song;
	songs?: Song[];
	index?: number;
	/** When set, adds a "Remove from playlist" action that removes this index. */
	playlistId?: string;
	/** Index of the song within the playlist (for removal). Defaults to `index`. */
	playlistIndex?: number;
}

export function SongContextMenu(props: SongMenuProps) {
	const activeServer = useStore($activeServer);
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const star = createMutation(() => {
		const server = activeServer();
		if (!server) return { mutationFn: async () => {} };
		return starMutation({
			client: clientFor(server),
			serverId: server.id,
			queryClient,
		});
	});

	const updatePl = createMutation(() => {
		const server = activeServer();
		if (!server) return { mutationFn: async () => {} };
		return updatePlaylistMutation({
			client: clientFor(server),
			serverId: server.id,
			queryClient,
		});
	});

	const playlists = createQuery(() => {
		const server = activeServer();
		const opts = playlistsQuery({
			client: server ? clientFor(server) : (null as never),
			serverId: server?.id ?? "__none__",
		});
		return { ...opts, enabled: Boolean(server) };
	});

	const items = (): MenuItem[] => {
		const server = activeServer();
		const client = server ? clientFor(server) : null;
		const list = props.songs ?? [props.song];
		const idx = props.index ?? 0;
		const song = props.song;
		return [
			{
				label: "Play",
				icon: <Play size={14} />,
				onSelect: () => {
					if (props.songs && props.songs.length > 0) playQueue(list, idx);
					else playSong(song);
				},
			},
			{
				label: "Play next",
				icon: <ListPlus size={14} />,
				onSelect: () => playNextInQueue(song),
			},
			{
				label: "Add to queue",
				icon: <ListMusic size={14} />,
				onSelect: () => addToQueue(song),
				separatorAfter: true,
			},
			{
				label: song.albumId ? "Go to album" : "No album",
				icon: <Disc3 size={14} />,
				disabled: !song.albumId,
				onSelect: () =>
					song.albumId && navigate(`/album/${encodeURIComponent(song.albumId)}`),
			},
			{
				label: song.artistId ? "Go to artist" : "No artist",
				icon: <User size={14} />,
				disabled: !song.artistId,
				onSelect: () =>
					song.artistId && navigate(`/artist/${encodeURIComponent(song.artistId)}`),
				separatorAfter: true,
			},
			{
				label: song.starred ? "Remove from favorites" : "Add to favorites",
				icon: song.starred ? <HeartOff size={14} /> : <Heart size={14} />,
				onSelect: () =>
					star.mutate({
						kind: "song",
						id: song.id,
						starred: !song.starred,
					}),
			},
			{
				label: "Add to playlist",
				icon: <ListPlus size={14} />,
				submenu: addToPlaylistSubmenu(),
				separatorAfter: true,
			},
			...(props.playlistId !== undefined
				? [
						{
							label: "Remove from playlist",
							icon: <Trash2 size={14} />,
							destructive: true,
							onSelect: () =>
								updatePl.mutate({
									playlistId: props.playlistId!,
									songIndexesToRemove: [
										props.playlistIndex ?? props.index ?? 0,
									],
								}),
							separatorAfter: true,
						},
					]
				: []),
			{
				label: "Copy link",
				icon: <LinkIcon size={14} />,
				disabled: !song.albumId,
				onSelect: () =>
					song.albumId && copyText(`/album/${encodeURIComponent(song.albumId)}`),
			},
			{
				label: "Download",
				icon: <Download size={14} />,
				disabled: !client,
				onSelect: () => client && openExternal(client.downloadUrl(song.id)),
			},
		];
	};

	const addToPlaylistSubmenu = (): MenuItem[] => {
		const list = playlists.data ?? [];
		if (list.length === 0) {
			return [
				{
					label: "No playlists yet",
					disabled: true,
				},
			];
		}
		return list.map((pl) => ({
			label: pl.name,
			icon: <ListMusic size={14} />,
			onSelect: () =>
				updatePl.mutate({
					playlistId: pl.id,
					songIdsToAdd: [props.song.id],
				}),
		}));
	};

	return (
		<ContextMenu
			items={items()}
			as={props.as}
			triggerClass={props.triggerClass}
			triggerProps={props.triggerProps}
		>
			{props.children}
		</ContextMenu>
	);
}

interface AlbumMenuProps extends BaseProps {
	album: Album;
}

export function AlbumContextMenu(props: AlbumMenuProps) {
	const activeServer = useStore($activeServer);
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const star = createMutation(() => {
		const server = activeServer();
		if (!server) return { mutationFn: async () => {} };
		return starMutation({
			client: clientFor(server),
			serverId: server.id,
			queryClient,
		});
	});

	const items = (): MenuItem[] => {
		const server = activeServer();
		const client = server ? clientFor(server) : null;
		const album = props.album;
		const playAlbum = async (mode: "play" | "queue" | "next") => {
			if (!client) return;
			const full = await client.getAlbum(album.id);
			const songs = full.song ?? [];
			if (songs.length === 0) return;
			if (mode === "play") playQueue(songs, 0);
			else if (mode === "queue") addToQueue(songs);
			else playNextInQueue(songs);
		};
		return [
			{
				label: "Play",
				icon: <Play size={14} />,
				onSelect: () => playAlbum("play"),
			},
			{
				label: "Play next",
				icon: <ListPlus size={14} />,
				onSelect: () => playAlbum("next"),
			},
			{
				label: "Add to queue",
				icon: <ListMusic size={14} />,
				onSelect: () => playAlbum("queue"),
				separatorAfter: true,
			},
			{
				label: "Open album",
				icon: <Disc3 size={14} />,
				onSelect: () => navigate(`/album/${encodeURIComponent(album.id)}`),
			},
			{
				label: album.artistId ? "Go to artist" : "No artist",
				icon: <User size={14} />,
				disabled: !album.artistId,
				onSelect: () =>
					album.artistId &&
					navigate(`/artist/${encodeURIComponent(album.artistId)}`),
				separatorAfter: true,
			},
			{
				label: album.starred ? "Remove from favorites" : "Add to favorites",
				icon: album.starred ? <HeartOff size={14} /> : <Heart size={14} />,
				onSelect: () =>
					star.mutate({
						kind: "album",
						id: album.id,
						starred: !album.starred,
					}),
				separatorAfter: true,
			},
			{
				label: "Copy link",
				icon: <LinkIcon size={14} />,
				onSelect: () => copyText(`/album/${encodeURIComponent(album.id)}`),
			},
		];
	};

	return (
		<ContextMenu
			items={items()}
			as={props.as}
			triggerClass={props.triggerClass}
			triggerProps={props.triggerProps}
		>
			{props.children}
		</ContextMenu>
	);
}

interface ArtistMenuProps extends BaseProps {
	artist: Artist;
}

export function ArtistContextMenu(props: ArtistMenuProps) {
	const activeServer = useStore($activeServer);
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const star = createMutation(() => {
		const server = activeServer();
		if (!server) return { mutationFn: async () => {} };
		return starMutation({
			client: clientFor(server),
			serverId: server.id,
			queryClient,
		});
	});

	const items = (): MenuItem[] => {
		const artist = props.artist;
		return [
			{
				label: "Open artist",
				icon: <User size={14} />,
				onSelect: () => navigate(`/artist/${encodeURIComponent(artist.id)}`),
				separatorAfter: true,
			},
			{
				label: artist.starred ? "Remove from favorites" : "Add to favorites",
				icon: artist.starred ? <HeartOff size={14} /> : <Heart size={14} />,
				onSelect: () =>
					star.mutate({
						kind: "artist",
						id: artist.id,
						starred: !artist.starred,
					}),
				separatorAfter: true,
			},
			{
				label: "Copy link",
				icon: <LinkIcon size={14} />,
				onSelect: () => copyText(`/artist/${encodeURIComponent(artist.id)}`),
			},
		];
	};

	return (
		<ContextMenu
			items={items()}
			as={props.as}
			triggerClass={props.triggerClass}
			triggerProps={props.triggerProps}
		>
			{props.children}
		</ContextMenu>
	);
}

interface PlaylistMenuProps extends BaseProps {
	playlist: Playlist;
}

export function PlaylistContextMenu(props: PlaylistMenuProps) {
	const activeServer = useStore($activeServer);
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const updatePl = createMutation(() => {
		const server = activeServer();
		if (!server) return { mutationFn: async () => {} };
		return updatePlaylistMutation({
			client: clientFor(server),
			serverId: server.id,
			queryClient,
		});
	});

	const deletePl = createMutation(() => {
		const server = activeServer();
		if (!server) return { mutationFn: async () => {} };
		return deletePlaylistMutation({
			client: clientFor(server),
			serverId: server.id,
			queryClient,
		});
	});

	const items = (): MenuItem[] => {
		const server = activeServer();
		const client = server ? clientFor(server) : null;
		const pl = props.playlist;
		const playPlaylist = async (mode: "play" | "queue" | "next") => {
			if (!client) return;
			const full = await client.getPlaylist(pl.id);
			const songs = full.entry ?? [];
			if (songs.length === 0) return;
			if (mode === "play") playQueue(songs, 0);
			else if (mode === "queue") addToQueue(songs);
			else playNextInQueue(songs);
		};
		const handleRename = () => {
			const next = window.prompt("Rename playlist", pl.name);
			if (!next || next.trim() === pl.name) return;
			updatePl.mutate({ playlistId: pl.id, name: next.trim() });
		};
		const handleDelete = () => {
			const ok = window.confirm(`Delete playlist "${pl.name}"?`);
			if (!ok) return;
			deletePl.mutate({ id: pl.id });
		};
		return [
			{
				label: "Play",
				icon: <Play size={14} />,
				onSelect: () => playPlaylist("play"),
			},
			{
				label: "Play next",
				icon: <ListPlus size={14} />,
				onSelect: () => playPlaylist("next"),
			},
			{
				label: "Add to queue",
				icon: <ListMusic size={14} />,
				onSelect: () => playPlaylist("queue"),
				separatorAfter: true,
			},
			{
				label: "Open playlist",
				icon: <ListMusic size={14} />,
				onSelect: () => navigate(`/playlist/${encodeURIComponent(pl.id)}`),
			},
			{
				label: "Rename",
				icon: <Pencil size={14} />,
				onSelect: handleRename,
			},
			{
				label: "Delete",
				icon: <Trash2 size={14} />,
				destructive: true,
				onSelect: handleDelete,
				separatorAfter: true,
			},
			{
				label: "Copy link",
				icon: <LinkIcon size={14} />,
				onSelect: () => copyText(`/playlist/${encodeURIComponent(pl.id)}`),
			},
		];
	};

	return (
		<ContextMenu
			items={items()}
			as={props.as}
			triggerClass={props.triggerClass}
			triggerProps={props.triggerProps}
		>
			{props.children}
		</ContextMenu>
	);
}
