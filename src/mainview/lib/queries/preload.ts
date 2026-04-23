import type { RoutePreloadFunc } from "@solidjs/router";
import { $activeServer } from "../../stores/servers";
import type { AlbumListType } from "../subsonic";
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

export const preloadAlbum: RoutePreloadFunc = ({ params }) => {
	const ctx = activeCtx();
	if (!ctx || !params.id) return;
	void queryClient.prefetchQuery(albumQuery(ctx, params.id));
};

export const preloadArtists: RoutePreloadFunc = () => {
	const ctx = activeCtx();
	if (!ctx) return;
	void queryClient.prefetchQuery(artistsQuery(ctx));
};

export const preloadArtist: RoutePreloadFunc = ({ params }) => {
	const ctx = activeCtx();
	if (!ctx || !params.id) return;
	void queryClient.prefetchQuery(artistQuery(ctx, params.id));
};

export const preloadPlaylists: RoutePreloadFunc = () => {
	const ctx = activeCtx();
	if (!ctx) return;
	void queryClient.prefetchQuery(playlistsQuery(ctx));
};

export const preloadPlaylist: RoutePreloadFunc = ({ params }) => {
	const ctx = activeCtx();
	if (!ctx || !params.id) return;
	void queryClient.prefetchQuery(playlistQuery(ctx, params.id));
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
