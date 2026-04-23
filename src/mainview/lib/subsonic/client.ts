import { md5, randomSalt } from "./md5";
import type {
	Album,
	AlbumListType,
	Artist,
	ArtistIndex,
	Playlist,
	SearchResult,
	Song,
} from "./models";
import {
	type ServerConfig,
	type SpeedTestResult,
	type SubsonicResponse,
	SubsonicError,
	NetworkError,
	InvalidEndpointError,
} from "./types";

export const CLIENT_NAME = "Navidrome-Client";
export const CLIENT_VERSION = "0.1.0";
export const API_VERSION = "1.16.1";

export function normalizeServerUrl(input: string): string {
	let url = input.trim();
	if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
	url = url.replace(/\/+$/, "");
	url = url.replace(/\/rest$/i, "");
	return url;
}

export type QueryValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| Array<string | number>;

function avg(xs: number[]): number {
	if (xs.length === 0) return 0;
	return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
	if (xs.length < 2) return 0;
	const m = avg(xs);
	const variance = xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length;
	return Math.sqrt(variance);
}

export class SubsonicClient {
	private stableAuth?: { salt: string; token: string };

	constructor(private readonly config: Pick<ServerConfig, "url" | "username" | "authMode" | "secret">) {}

	private authParams(opts: { stable?: boolean } = {}): URLSearchParams {
		const p = new URLSearchParams({
			v: API_VERSION,
			c: `${CLIENT_NAME}/${CLIENT_VERSION}`,
			f: "json",
		});
		if (this.config.authMode === "apiKey") {
			p.set("apiKey", this.config.secret);
			return p;
		}
		let salt: string;
		let token: string;
		if (opts.stable) {
			if (!this.stableAuth) {
				const s = randomSalt();
				this.stableAuth = { salt: s, token: md5(this.config.secret + s) };
			}
			({ salt, token } = this.stableAuth);
		} else {
			salt = randomSalt();
			token = md5(this.config.secret + salt);
		}
		p.set("u", this.config.username);
		p.set("t", token);
		p.set("s", salt);
		return p;
	}

	buildUrl(
		method: string,
		query: Record<string, QueryValue> = {},
		opts: { stable?: boolean } = {},
	): string {
		const base = `${this.config.url.replace(/\/$/, "")}/rest/${method}`;
		const params = this.authParams({ stable: opts.stable });
		for (const [k, v] of Object.entries(query)) {
			if (v === null || v === undefined) continue;
			if (Array.isArray(v)) {
				for (const item of v) params.append(k, String(item));
				continue;
			}
			params.set(k, String(v));
		}
		return `${base}?${params.toString()}`;
	}

	async call<T = SubsonicResponse>(
		method: string,
		query: Record<string, QueryValue> = {},
		init: RequestInit = {},
	): Promise<T> {
		const url = this.buildUrl(method, query);
		let res: Response;
		try {
			res = await fetch(url, { ...init, credentials: "omit" });
		} catch (e) {
			throw new NetworkError(
				e instanceof Error ? e.message : "Network request failed",
				e,
			);
		}

		if (!res.ok) {
			throw new InvalidEndpointError(
				`The server responded with HTTP ${res.status} ${res.statusText} at /rest/${method}.`,
				`Status ${res.status}`,
			);
		}

		const contentType = res.headers.get("content-type") ?? "";
		const raw = await res.text();
		let body: { "subsonic-response"?: SubsonicResponse };
		try {
			body = JSON.parse(raw) as { "subsonic-response"?: SubsonicResponse };
		} catch {
			const preview = raw.slice(0, 80).replace(/\s+/g, " ").trim();
			throw new InvalidEndpointError(
				contentType.includes("html")
					? "The endpoint returned an HTML page instead of a Subsonic JSON response."
					: "The endpoint returned content that is not valid JSON.",
				preview ? `Got: ${preview}${raw.length > 80 ? "…" : ""}` : undefined,
			);
		}
		const resp = body["subsonic-response"];
		if (!resp) {
			throw new InvalidEndpointError(
				"The endpoint returned JSON that is not a Subsonic response (missing subsonic-response envelope).",
			);
		}
		if (resp.status === "failed" || resp.error) {
			const err = resp.error ?? { code: 0, message: "Unknown server error" };
			throw new SubsonicError(err.code, err.message, err.helpUrl);
		}
		return resp as T;
	}

	ping(): Promise<SubsonicResponse> {
		return this.call("ping");
	}

	getOpenSubsonicExtensions(): Promise<
		SubsonicResponse & {
			openSubsonicExtensions: Array<{ name: string; versions: number[] }>;
		}
	> {
		return this.call("getOpenSubsonicExtensions");
	}

	async getAlbumList2(options: {
		type: AlbumListType;
		size?: number;
		offset?: number;
		fromYear?: number;
		toYear?: number;
		genre?: string;
		musicFolderId?: string;
	}): Promise<Album[]> {
		const resp = (await this.call("getAlbumList2", {
			...options,
			size: options.size ?? 30,
		})) as SubsonicResponse & {
			albumList2?: { album?: Album[] };
		};
		return resp.albumList2?.album ?? [];
	}

	async getArtists(musicFolderId?: string): Promise<ArtistIndex[]> {
		const resp = (await this.call("getArtists", {
			musicFolderId: musicFolderId ?? null,
		})) as SubsonicResponse & {
			artists?: { index?: ArtistIndex[] };
		};
		return resp.artists?.index ?? [];
	}

	async getArtist(id: string): Promise<
		Artist & { album?: Album[] }
	> {
		const resp = (await this.call("getArtist", { id })) as SubsonicResponse & {
			artist?: Artist & { album?: Album[] };
		};
		if (!resp.artist) {
			throw new SubsonicError(70, "Artist not found");
		}
		return resp.artist;
	}

	async getAlbum(id: string): Promise<
		Album & { song?: Song[] }
	> {
		const resp = (await this.call("getAlbum", { id })) as SubsonicResponse & {
			album?: Album & { song?: Song[] };
		};
		if (!resp.album) {
			throw new SubsonicError(70, "Album not found");
		}
		return resp.album;
	}

	async getPlaylists(): Promise<Playlist[]> {
		const resp = (await this.call("getPlaylists")) as SubsonicResponse & {
			playlists?: { playlist?: Playlist[] };
		};
		return resp.playlists?.playlist ?? [];
	}

	async getPlaylist(id: string): Promise<Playlist & { entry?: Song[] }> {
		const resp = (await this.call("getPlaylist", { id })) as SubsonicResponse & {
			playlist?: Playlist & { entry?: Song[] };
		};
		if (!resp.playlist) {
			throw new SubsonicError(70, "Playlist not found");
		}
		return resp.playlist;
	}

	async createPlaylist(options: {
		name: string;
		songIds?: string[];
	}): Promise<Playlist> {
		const resp = (await this.call("createPlaylist", {
			name: options.name,
			songId: options.songIds && options.songIds.length > 0 ? options.songIds : null,
		})) as SubsonicResponse & {
			playlist?: Playlist & { entry?: Song[] };
		};
		if (!resp.playlist) throw new SubsonicError(0, "Server did not return playlist");
		return resp.playlist;
	}

	async updatePlaylist(options: {
		playlistId: string;
		name?: string;
		comment?: string;
		public?: boolean;
		songIdsToAdd?: string[];
		songIndexesToRemove?: number[];
	}): Promise<void> {
		await this.call("updatePlaylist", {
			playlistId: options.playlistId,
			name: options.name ?? null,
			comment: options.comment ?? null,
			public: options.public ?? null,
			songIdToAdd:
				options.songIdsToAdd && options.songIdsToAdd.length > 0
					? options.songIdsToAdd
					: null,
			songIndexToRemove:
				options.songIndexesToRemove && options.songIndexesToRemove.length > 0
					? options.songIndexesToRemove
					: null,
		});
	}

	async deletePlaylist(id: string): Promise<void> {
		await this.call("deletePlaylist", { id });
	}

	async star(params: {
		id?: string;
		albumId?: string;
		artistId?: string;
	}): Promise<void> {
		await this.call("star", {
			id: params.id ?? null,
			albumId: params.albumId ?? null,
			artistId: params.artistId ?? null,
		});
	}

	async unstar(params: {
		id?: string;
		albumId?: string;
		artistId?: string;
	}): Promise<void> {
		await this.call("unstar", {
			id: params.id ?? null,
			albumId: params.albumId ?? null,
			artistId: params.artistId ?? null,
		});
	}

	async setRating(id: string, rating: number): Promise<void> {
		const r = Math.max(0, Math.min(5, Math.round(rating)));
		await this.call("setRating", { id, rating: r });
	}

	async search3(options: {
		query: string;
		artistCount?: number;
		artistOffset?: number;
		albumCount?: number;
		albumOffset?: number;
		songCount?: number;
		songOffset?: number;
		musicFolderId?: string;
	}): Promise<SearchResult> {
		const resp = (await this.call("search3", {
			query: options.query,
			artistCount: options.artistCount ?? 10,
			albumCount: options.albumCount ?? 20,
			songCount: options.songCount ?? 20,
			artistOffset: options.artistOffset ?? 0,
			albumOffset: options.albumOffset ?? 0,
			songOffset: options.songOffset ?? 0,
			musicFolderId: options.musicFolderId ?? null,
		})) as SubsonicResponse & { searchResult3?: SearchResult };
		return resp.searchResult3 ?? {};
	}

	async speedTest(
		options: {
			targetBytes?: number;
			timeoutMs?: number;
			pingSamples?: number;
			onProgress?: (snapshot: SpeedTestResult) => void;
			signal?: AbortSignal;
		} = {},
	): Promise<SpeedTestResult> {
		const targetBytes = options.targetBytes ?? 4 * 1024 * 1024;
		const timeoutMs = options.timeoutMs ?? 15000;
		const sampleCount = options.pingSamples ?? 4;
		const onProgress = options.onProgress;

		const snapshot: SpeedTestResult = { phase: "ping", targetBytes };
		const emit = () => onProgress?.({ ...snapshot });

		emit();

		// --- Ping / jitter ---
		const pings: number[] = [];
		for (let i = 0; i < sampleCount; i++) {
			if (options.signal?.aborted) {
				return { ...snapshot, phase: "cancelled" };
			}
			const t = performance.now();
			try {
				await this.ping();
				pings.push(performance.now() - t);
			} catch (e) {
				return {
					...snapshot,
					phase: "error",
					error: e instanceof Error ? e.message : String(e),
				};
			}
			snapshot.pingMs = avg(pings);
			snapshot.jitterMs = stddev(pings);
			emit();
		}

		// --- Throughput ---
		snapshot.phase = "stream";
		emit();

		let songId: string | undefined;
		try {
			const resp = (await this.call("getRandomSongs", { size: 1 })) as SubsonicResponse & {
				randomSongs?: { song?: Array<{ id: string }> };
			};
			songId = resp.randomSongs?.song?.[0]?.id;
		} catch {
			// non-fatal — we still have ping results
		}

		if (!songId) {
			snapshot.phase = "done";
			emit();
			return { ...snapshot };
		}

		const url = this.buildUrl("stream", { id: songId, maxBitRate: 320 });
		const controller = new AbortController();
		let userCancelled = false;
		let timedOut = false;
		const onUserAbort = () => {
			userCancelled = true;
			controller.abort();
		};
		options.signal?.addEventListener("abort", onUserAbort, { once: true });
		const timeout = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeoutMs);

		const finalize = (
			phase: "done" | "cancelled" | "error",
			stats: {
				bytes: number;
				start: number;
				peakMbps: number;
				error?: string;
			},
		): SpeedTestResult => {
			const elapsed = performance.now() - stats.start;
			snapshot.bytes = stats.bytes;
			snapshot.durationMs = elapsed;
			if (stats.peakMbps > 0) snapshot.peakMbps = stats.peakMbps;
			if (elapsed > 0 && stats.bytes > 0) {
				snapshot.throughputMbps = (stats.bytes * 8) / (elapsed / 1000) / 1_000_000;
			}
			snapshot.phase = phase;
			if (phase === "error" && stats.error) snapshot.error = stats.error;
			emit();
			return { ...snapshot };
		};

		const start = performance.now();
		let total = 0;
		let peakMbps = 0;

		try {
			const res = await fetch(url, {
				signal: controller.signal,
				credentials: "omit",
				headers: { Range: `bytes=0-${targetBytes - 1}` },
			});
			snapshot.ttfbMs = performance.now() - start;
			emit();

			if (!res.ok || !res.body) {
				return finalize("done", { bytes: 0, start, peakMbps: 0 });
			}

			const reader = res.body.getReader();
			let lastEmitAt = 0;
			let windowBytes = 0;
			let windowStart = start;

			while (total < targetBytes) {
				const { done, value } = await reader.read();
				if (done) break;
				const chunk = value?.byteLength ?? 0;
				total += chunk;
				windowBytes += chunk;

				const now = performance.now();
				const elapsed = now - start;
				const windowElapsed = now - windowStart;
				if (windowElapsed >= 250) {
					const instant = (windowBytes * 8) / (windowElapsed / 1000) / 1_000_000;
					if (instant > peakMbps) peakMbps = instant;
					windowBytes = 0;
					windowStart = now;
				}

				if (now - lastEmitAt >= 100) {
					snapshot.bytes = total;
					snapshot.durationMs = elapsed;
					snapshot.peakMbps = peakMbps || undefined;
					if (elapsed > 0) {
						snapshot.throughputMbps = (total * 8) / (elapsed / 1000) / 1_000_000;
					}
					lastEmitAt = now;
					emit();
				}
			}

			try {
				await reader.cancel();
			} catch {}

			return finalize("done", { bytes: total, start, peakMbps });
		} catch (e) {
			if (userCancelled) {
				return finalize("cancelled", { bytes: total, start, peakMbps });
			}
			// Soft timeout: if we managed to read a usable sample, treat as done.
			if (timedOut && total >= 256 * 1024) {
				return finalize("done", { bytes: total, start, peakMbps });
			}
			if (timedOut) {
				return finalize("error", {
					bytes: total,
					start,
					peakMbps,
					error: "Timed out before enough data could be sampled",
				});
			}
			return finalize("error", {
				bytes: total,
				start,
				peakMbps,
				error: e instanceof Error ? e.message : String(e),
			});
		} finally {
			clearTimeout(timeout);
			options.signal?.removeEventListener("abort", onUserAbort);
		}
	}

	coverArtUrl(id: string | undefined, size?: number): string | undefined {
		if (!id) return undefined;
		return this.buildUrl(
			"getCoverArt",
			size ? { id, size } : { id },
			{ stable: true },
		);
	}

	streamUrl(id: string, options: { maxBitRate?: number; format?: string } = {}): string {
		return this.buildUrl(
			"stream",
			{ id, maxBitRate: options.maxBitRate, format: options.format },
			{ stable: true },
		);
	}

	downloadUrl(id: string): string {
		return this.buildUrl("download", { id }, { stable: true });
	}
}
