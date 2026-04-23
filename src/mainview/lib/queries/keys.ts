import type { AlbumListType } from "../subsonic";

type ServerScope = readonly ["server", string];

export const qk = {
	server: (serverId: string) => ["server", serverId] as ServerScope,

	ping: (serverId: string) =>
		[...qk.server(serverId), "ping"] as const,

	albumList: (serverId: string, type: AlbumListType, size?: number) =>
		[...qk.server(serverId), "albumList", type, size ?? null] as const,

	album: (serverId: string, id: string) =>
		[...qk.server(serverId), "album", id] as const,

	artists: (serverId: string) =>
		[...qk.server(serverId), "artists"] as const,

	artist: (serverId: string, id: string) =>
		[...qk.server(serverId), "artist", id] as const,

	playlists: (serverId: string) =>
		[...qk.server(serverId), "playlists"] as const,

	playlist: (serverId: string, id: string) =>
		[...qk.server(serverId), "playlist", id] as const,

	search: (serverId: string, query: string) =>
		[...qk.server(serverId), "search", query] as const,
};
