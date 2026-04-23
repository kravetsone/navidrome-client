import { infiniteQueryOptions, queryOptions } from "@tanstack/solid-query";
import type { SubsonicClient } from "../subsonic/client";
import type { AlbumListType, SearchResult, StructuredLyrics } from "../subsonic";
import { fetchFromLrclib } from "../lyrics/lrclib";
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
	filters?: { genre?: string; fromYear?: number; toYear?: number },
) {
	return queryOptions({
		queryKey: qk.albumList(serverId, type, size, filters),
		queryFn: () =>
			client.getAlbumList2({
				type,
				size,
				genre: filters?.genre,
				fromYear: filters?.fromYear,
				toYear: filters?.toYear,
			}),
		staleTime: FIVE_MIN,
	});
}

export const ALBUM_PAGE_SIZE = 100;

export function albumListInfiniteQuery(
	{ client, serverId }: ClientCtx,
	type: AlbumListType,
	filters?: { genre?: string; fromYear?: number; toYear?: number },
) {
	return infiniteQueryOptions({
		queryKey: qk.albumListInfinite(serverId, type, filters),
		queryFn: ({ pageParam }) =>
			client.getAlbumList2({
				type,
				size: ALBUM_PAGE_SIZE,
				offset: pageParam,
				genre: filters?.genre,
				fromYear: filters?.fromYear,
				toYear: filters?.toYear,
			}),
		initialPageParam: 0,
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.length < ALBUM_PAGE_SIZE ? undefined : lastPageParam + ALBUM_PAGE_SIZE,
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

export function starredQuery({ client, serverId }: ClientCtx) {
	return queryOptions({
		queryKey: qk.starred(serverId),
		queryFn: () => client.getStarred2(),
		staleTime: 2 * 60 * 1000,
	});
}

export function genresQuery({ client, serverId }: ClientCtx) {
	return queryOptions({
		queryKey: qk.genres(serverId),
		queryFn: () => client.getGenres(),
		staleTime: TEN_MIN,
	});
}

export function lyricsQuery(
	ctx: ClientCtx | null,
	song: {
		id: string;
		artist?: string;
		title?: string;
		duration?: number;
	} | null,
) {
	const enabled = Boolean(ctx && song);
	return queryOptions({
		queryKey:
			ctx && song ? qk.lyrics(ctx.serverId, song.id) : ["lyrics-disabled"],
		queryFn: async (): Promise<StructuredLyrics | null> => {
			if (!ctx || !song) return null;

			// 1) Server-side lyrics (embedded tags, sidecar .lrc on the Navidrome host).
			const server = await ctx.client.getStructuredLyrics(song.id, {
				artist: song.artist,
				title: song.title,
			});
			const serverHit: StructuredLyrics | null =
				server && server.line.length > 0
					? { ...server, source: "server" }
					: null;

			// If the server already has synced lyrics, use them — plain text
			// from LRCLIB would be a downgrade.
			if (serverHit?.synced) return serverHit;

			// 2) Try LRCLIB — either because the server had nothing or only
			// unsynced text. Prefer a synced LRCLIB hit as an upgrade; otherwise
			// fall through to whatever the server gave us.
			if (song.artist && song.title) {
				const lrclib = await fetchFromLrclib({
					artist: song.artist,
					title: song.title,
					duration: song.duration,
				});
				if (lrclib?.synced) return lrclib;
				// LRCLIB unsynced is only useful if we had nothing from the server.
				if (lrclib && !serverHit) return lrclib;
			}

			return serverHit;
		},
		enabled,
		staleTime: 24 * 60 * 60 * 1000, // lyrics rarely change
		gcTime: 60 * 60 * 1000,
	});
}

export function searchQuery(ctx: ClientCtx | null, query: string) {
	const enabled = Boolean(ctx) && query.trim().length > 0;
	return queryOptions({
		queryKey: ctx ? qk.search(ctx.serverId, query) : ["search-disabled"],
		queryFn: async (): Promise<SearchResult> => {
			if (!ctx) return {};
			return ctx.client.search3({
				query,
				artistCount: 20,
				albumCount: 30,
				songCount: 50,
			});
		},
		enabled,
		staleTime: ONE_MIN,
		placeholderData: (prev) => prev,
	});
}
