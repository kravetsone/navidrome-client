import type { QueryClient } from "@tanstack/solid-query";
import type { SubsonicClient } from "../subsonic/client";
import type { Album, Artist, Playlist, Song } from "../subsonic/models";
import { toastError } from "../../stores/toast";
import { $queue, patchQueueSong } from "../../stores/player";
import { qk } from "./keys";

interface MutationCtx {
	client: SubsonicClient;
	serverId: string;
	queryClient: QueryClient;
}

export type StarKind = "song" | "album" | "artist";

interface StarVars {
	kind: StarKind;
	id: string;
	starred: boolean;
}

type StarSnapshot = Array<{ key: readonly unknown[]; data: unknown }>;

const nowIso = () => new Date().toISOString();

function patchSong(song: Song, id: string, starred: boolean): Song {
	return song.id === id ? { ...song, starred: starred ? nowIso() : undefined } : song;
}

function patchAlbum(album: Album, id: string, starred: boolean): Album {
	return album.id === id ? { ...album, starred: starred ? nowIso() : undefined } : album;
}

function patchArtist(artist: Artist, id: string, starred: boolean): Artist {
	return artist.id === id ? { ...artist, starred: starred ? nowIso() : undefined } : artist;
}

function applyStarToCaches(
	queryClient: QueryClient,
	serverId: string,
	vars: StarVars,
): StarSnapshot {
	const snapshot: StarSnapshot = [];
	const serverScope = qk.server(serverId);

	const queries = queryClient.getQueryCache().findAll({ queryKey: serverScope });

	for (const q of queries) {
		const key = q.queryKey;
		const data = q.state.data;
		if (data === undefined) continue;

		let next: unknown = data;
		const seg = key[2];

		if (vars.kind === "song" && seg === "album") {
			const album = data as Album & { song?: Song[] };
			if (album.song?.some((s) => s.id === vars.id)) {
				next = {
					...album,
					song: album.song.map((s) => patchSong(s, vars.id, vars.starred)),
				};
			}
		} else if (vars.kind === "song" && seg === "playlist") {
			const pl = data as Playlist & { entry?: Song[] };
			if (pl.entry?.some((s) => s.id === vars.id)) {
				next = {
					...pl,
					entry: pl.entry.map((s) => patchSong(s, vars.id, vars.starred)),
				};
			}
		} else if (vars.kind === "album" && seg === "album") {
			const album = data as Album;
			if (album.id === vars.id) next = patchAlbum(album, vars.id, vars.starred);
		} else if (vars.kind === "album" && seg === "albumList") {
			const list = data as Album[];
			if (list.some((a) => a.id === vars.id)) {
				next = list.map((a) => patchAlbum(a, vars.id, vars.starred));
			}
		} else if (vars.kind === "album" && seg === "artist") {
			const artist = data as Artist & { album?: Album[] };
			if (artist.album?.some((a) => a.id === vars.id)) {
				next = {
					...artist,
					album: artist.album.map((a) => patchAlbum(a, vars.id, vars.starred)),
				};
			}
		} else if (vars.kind === "artist" && seg === "artist") {
			const artist = data as Artist;
			if (artist.id === vars.id) next = patchArtist(artist, vars.id, vars.starred);
		}

		if (next !== data) {
			snapshot.push({ key: [...key], data });
			queryClient.setQueryData(key, next);
		}
	}

	return snapshot;
}

function rollback(queryClient: QueryClient, snapshot: StarSnapshot): void {
	for (const entry of snapshot) {
		queryClient.setQueryData(entry.key, entry.data);
	}
}

export function starMutation(ctx: MutationCtx) {
	return {
		mutationFn: async (vars: StarVars) => {
			const params =
				vars.kind === "song"
					? { id: vars.id }
					: vars.kind === "album"
						? { albumId: vars.id }
						: { artistId: vars.id };
			if (vars.starred) await ctx.client.star(params);
			else await ctx.client.unstar(params);
		},
		onMutate: async (vars: StarVars) => {
			await ctx.queryClient.cancelQueries({ queryKey: qk.server(ctx.serverId) });
			const snapshot = applyStarToCaches(ctx.queryClient, ctx.serverId, vars);
			let queueRollback: { id: string; prev: string | undefined } | null = null;
			if (vars.kind === "song") {
				const prev = $queue.get().find((s) => s.id === vars.id)?.starred;
				queueRollback = { id: vars.id, prev };
				patchQueueSong(vars.id, {
					starred: vars.starred ? nowIso() : undefined,
				});
			}
			return { snapshot, queueRollback };
		},
		onError: (
			err: unknown,
			_vars: StarVars,
			context:
				| {
						snapshot: StarSnapshot;
						queueRollback: { id: string; prev: string | undefined } | null;
				  }
				| undefined,
		) => {
			if (context?.snapshot) rollback(ctx.queryClient, context.snapshot);
			if (context?.queueRollback) {
				patchQueueSong(context.queueRollback.id, {
					starred: context.queueRollback.prev,
				});
			}
			toastError(err, "Couldn't update favorite");
		},
		onSettled: () => {
			ctx.queryClient.invalidateQueries({
				queryKey: [...qk.server(ctx.serverId), "albumList", "starred"],
			});
		},
	};
}

interface RatingVars {
	id: string;
	rating: number;
}

function applyRatingToCaches(
	queryClient: QueryClient,
	serverId: string,
	vars: RatingVars,
): StarSnapshot {
	const snapshot: StarSnapshot = [];
	const serverScope = qk.server(serverId);
	const queries = queryClient.getQueryCache().findAll({ queryKey: serverScope });

	for (const q of queries) {
		const key = q.queryKey;
		const data = q.state.data;
		if (data === undefined) continue;
		const seg = key[2];
		let next: unknown = data;

		if (seg === "album") {
			const album = data as Album & { song?: Song[] };
			if (album.id === vars.id) next = { ...album, userRating: vars.rating };
			else if (album.song?.some((s) => s.id === vars.id)) {
				next = {
					...album,
					song: album.song.map((s) =>
						s.id === vars.id ? { ...s, userRating: vars.rating } : s,
					),
				};
			}
		} else if (seg === "playlist") {
			const pl = data as Playlist & { entry?: Song[] };
			if (pl.entry?.some((s) => s.id === vars.id)) {
				next = {
					...pl,
					entry: pl.entry.map((s) =>
						s.id === vars.id ? { ...s, userRating: vars.rating } : s,
					),
				};
			}
		} else if (seg === "albumList") {
			const list = data as Album[];
			if (list.some((a) => a.id === vars.id)) {
				next = list.map((a) =>
					a.id === vars.id ? { ...a, userRating: vars.rating } : a,
				);
			}
		}

		if (next !== data) {
			snapshot.push({ key: [...key], data });
			queryClient.setQueryData(key, next);
		}
	}

	return snapshot;
}

interface CreatePlaylistVars {
	name: string;
	songIds?: string[];
}

export function createPlaylistMutation(ctx: MutationCtx) {
	return {
		mutationFn: (vars: CreatePlaylistVars) =>
			ctx.client.createPlaylist({ name: vars.name, songIds: vars.songIds }),
		onSuccess: () => {
			ctx.queryClient.invalidateQueries({
				queryKey: qk.playlists(ctx.serverId),
			});
		},
		onError: (err: unknown) => toastError(err, "Couldn't create playlist"),
	};
}

interface UpdatePlaylistVars {
	playlistId: string;
	name?: string;
	comment?: string;
	public?: boolean;
	songIdsToAdd?: string[];
	songIndexesToRemove?: number[];
}

export function updatePlaylistMutation(ctx: MutationCtx) {
	return {
		mutationFn: (vars: UpdatePlaylistVars) =>
			ctx.client.updatePlaylist(vars),
		onSuccess: (_data: void, vars: UpdatePlaylistVars) => {
			ctx.queryClient.invalidateQueries({
				queryKey: qk.playlist(ctx.serverId, vars.playlistId),
			});
			ctx.queryClient.invalidateQueries({
				queryKey: qk.playlists(ctx.serverId),
			});
		},
		onError: (err: unknown) => toastError(err, "Couldn't update playlist"),
	};
}

interface DeletePlaylistVars {
	id: string;
}

export function deletePlaylistMutation(ctx: MutationCtx) {
	return {
		mutationFn: (vars: DeletePlaylistVars) => ctx.client.deletePlaylist(vars.id),
		onMutate: async (vars: DeletePlaylistVars) => {
			const key = qk.playlists(ctx.serverId);
			await ctx.queryClient.cancelQueries({ queryKey: key });
			const prev = ctx.queryClient.getQueryData<Playlist[]>(key);
			if (prev) {
				ctx.queryClient.setQueryData(
					key,
					prev.filter((p) => p.id !== vars.id),
				);
			}
			return { prev };
		},
		onError: (
			err: unknown,
			_vars: DeletePlaylistVars,
			context: { prev?: Playlist[] } | undefined,
		) => {
			if (context?.prev) {
				ctx.queryClient.setQueryData(qk.playlists(ctx.serverId), context.prev);
			}
			toastError(err, "Couldn't delete playlist");
		},
		onSuccess: () => {
			ctx.queryClient.invalidateQueries({
				queryKey: qk.playlists(ctx.serverId),
			});
		},
	};
}

export function ratingMutation(ctx: MutationCtx) {
	return {
		mutationFn: async (vars: RatingVars) => {
			await ctx.client.setRating(vars.id, vars.rating);
		},
		onMutate: async (vars: RatingVars) => {
			await ctx.queryClient.cancelQueries({ queryKey: qk.server(ctx.serverId) });
			const snapshot = applyRatingToCaches(ctx.queryClient, ctx.serverId, vars);
			return { snapshot };
		},
		onError: (err: unknown, _vars: RatingVars, context: { snapshot: StarSnapshot } | undefined) => {
			if (context?.snapshot) rollback(ctx.queryClient, context.snapshot);
			toastError(err, "Couldn't update rating");
		},
	};
}
