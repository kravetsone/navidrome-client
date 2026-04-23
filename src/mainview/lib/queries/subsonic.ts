import { queryOptions } from "@tanstack/solid-query";
import type { SubsonicClient } from "../subsonic/client";
import type { AlbumListType, SearchResult } from "../subsonic";
import { qk } from "./keys";

const FIVE_MIN = 5 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;
const ONE_MIN = 60 * 1000;
const THIRTY_SEC = 30 * 1000;

interface ClientCtx {
	client: SubsonicClient;
	serverId: string;
}

export function pingQuery({ client, serverId }: ClientCtx) {
	return queryOptions({
		queryKey: qk.ping(serverId),
		queryFn: () => client.ping(),
		staleTime: THIRTY_SEC,
	});
}

export function albumListQuery(
	{ client, serverId }: ClientCtx,
	type: AlbumListType,
	size = 30,
) {
	return queryOptions({
		queryKey: qk.albumList(serverId, type, size),
		queryFn: () => client.getAlbumList2({ type, size }),
		staleTime: FIVE_MIN,
	});
}

export function albumQuery({ client, serverId }: ClientCtx, id: string) {
	return queryOptions({
		queryKey: qk.album(serverId, id),
		queryFn: () => client.getAlbum(id),
		staleTime: TEN_MIN,
	});
}

export function artistsQuery({ client, serverId }: ClientCtx) {
	return queryOptions({
		queryKey: qk.artists(serverId),
		queryFn: () => client.getArtists(),
		staleTime: FIVE_MIN,
	});
}

export function artistQuery({ client, serverId }: ClientCtx, id: string) {
	return queryOptions({
		queryKey: qk.artist(serverId, id),
		queryFn: () => client.getArtist(id),
		staleTime: TEN_MIN,
	});
}

export function playlistsQuery({ client, serverId }: ClientCtx) {
	return queryOptions({
		queryKey: qk.playlists(serverId),
		queryFn: () => client.getPlaylists(),
		staleTime: FIVE_MIN,
	});
}

export function playlistQuery({ client, serverId }: ClientCtx, id: string) {
	return queryOptions({
		queryKey: qk.playlist(serverId, id),
		queryFn: () => client.getPlaylist(id),
		staleTime: TEN_MIN,
	});
}

export function searchQuery(
	ctx: ClientCtx | null,
	query: string,
	counts: { artist?: number; album?: number; song?: number } = {},
) {
	const enabled = Boolean(ctx) && query.trim().length > 0;
	return queryOptions({
		queryKey: ctx ? qk.search(ctx.serverId, query) : ["search-disabled"],
		queryFn: async (): Promise<SearchResult> => {
			if (!ctx) return {};
			return ctx.client.search3({
				query,
				artistCount: counts.artist ?? 4,
				albumCount: counts.album ?? 6,
				songCount: counts.song ?? 8,
			});
		},
		enabled,
		staleTime: ONE_MIN,
		placeholderData: (prev) => prev,
	});
}
