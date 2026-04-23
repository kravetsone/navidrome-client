import type { RoutePreloadFunc } from "@solidjs/router";
import { $activeServer } from "../../stores/servers";
import type { AlbumListType } from "../subsonic";
import { extractAmbientPalette } from "../palette";
import { queryClient } from "./client";
import { clientFor } from "./useActiveClient";
import {
	albumListQuery,
	albumQuery,
	artistQuery,
	artistsQuery,
	playlistQuery,
	playlistsQuery,
	starredQuery,
} from "./subsonic";

type Ctx = { client: ReturnType<typeof clientFor>; serverId: string };

function activeCtx(): Ctx | null {
	const server = $activeServer.get();
	if (!server) return null;
	return { client: clientFor(server), serverId: server.id };
}

const HOME_RAILS: AlbumListType[] = ["recent", "frequent", "starred", "random"];

export const preloadHome: RoutePreloadFunc = () => {
	const ctx = activeCtx();
	if (!ctx) return;
	for (const type of HOME_RAILS) {
		void queryClient.prefetchQuery(albumListQuery(ctx, type, 20));
	}
};

export const preloadAlbums: RoutePreloadFunc = ({ location }) => {
	const ctx = activeCtx();
	if (!ctx) return;
	const sort = (location.query.sort as AlbumListType | undefined) ?? "recent";
	const genre = location.query.genre as string | undefined;
	const fromYear = Number(location.query.fromYear) || undefined;
	const toYear = Number(location.query.toYear) || undefined;
	const filters =
		genre || fromYear || toYear ? { genre, fromYear, toYear } : undefined;
	void queryClient.prefetchQuery(albumListQuery(ctx, sort, 500, filters));
};

function preloadPalette(url: string) {
	void extractAmbientPalette(url);
	const img = new Image();
	img.decoding = "async";
	img.src = url;
}

export const preloadAlbum: RoutePreloadFunc = ({ params }) => {
	const ctx = activeCtx();
	if (!ctx || !params.id) return;
	void queryClient.fetchQuery(albumQuery(ctx, params.id)).then((album) => {
		if (!album?.coverArt) return;
		const url = ctx.client.coverArtUrl(album.coverArt, 96);
		if (url) preloadPalette(url);
	});
};

export const preloadArtists: RoutePreloadFunc = () => {
	const ctx = activeCtx();
	if (!ctx) return;
	void queryClient.prefetchQuery(artistsQuery(ctx));
};

export const preloadArtist: RoutePreloadFunc = ({ params }) => {
	const ctx = activeCtx();
	if (!ctx || !params.id) return;
	void queryClient.fetchQuery(artistQuery(ctx, params.id)).then((artist) => {
		if (!artist) return;
		if (artist.artistImageUrl) {
			preloadPalette(artist.artistImageUrl);
			return;
		}
		// Mirror ArtistView's cascade: skip Navidrome's self-pointer coverArt
		// (same id or "ar-*") and fall back to the first album's cover.
		const raw = artist.coverArt;
		const selfRef = !raw || raw === artist.id || raw.startsWith("ar-");
		const id = selfRef
			? artist.album?.find((a) => a.coverArt)?.coverArt
			: raw;
		const url = id ? ctx.client.coverArtUrl(id, 96) : undefined;
		if (url) preloadPalette(url);
	});
};

export const preloadPlaylists: RoutePreloadFunc = () => {
	const ctx = activeCtx();
	if (!ctx) return;
	void queryClient.prefetchQuery(playlistsQuery(ctx));
};

export const preloadPlaylist: RoutePreloadFunc = ({ params }) => {
	const ctx = activeCtx();
	if (!ctx || !params.id) return;
	void queryClient.fetchQuery(playlistQuery(ctx, params.id)).then((pl) => {
		if (!pl) return;
		const url = ctx.client.coverArtUrl(pl.coverArt ?? pl.id, 96);
		if (url) preloadPalette(url);
	});
};

export const preloadFavorites: RoutePreloadFunc = () => {
	const ctx = activeCtx();
	if (!ctx) return;
	void queryClient.prefetchQuery(starredQuery(ctx));
};

export const preloadRecent: RoutePreloadFunc = () => {
	const ctx = activeCtx();
	if (!ctx) return;
	void queryClient.prefetchQuery(albumListQuery(ctx, "recent", 30));
};
