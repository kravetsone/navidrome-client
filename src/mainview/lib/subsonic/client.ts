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

export type QueryValue = string | number | boolean | null | undefined;

export class SubsonicClient {
	constructor(private readonly config: Pick<ServerConfig, "url" | "username" | "authMode" | "secret">) {}

	private authParams(): URLSearchParams {
		const p = new URLSearchParams({
			v: API_VERSION,
			c: `${CLIENT_NAME}/${CLIENT_VERSION}`,
			f: "json",
		});
		if (this.config.authMode === "apiKey") {
			p.set("apiKey", this.config.secret);
		} else {
			const salt = randomSalt();
			const token = md5(this.config.secret + salt);
			p.set("u", this.config.username);
			p.set("t", token);
			p.set("s", salt);
		}
		return p;
	}

	buildUrl(method: string, query: Record<string, QueryValue> = {}): string {
		const base = `${this.config.url.replace(/\/$/, "")}/rest/${method}`;
		const params = this.authParams();
		for (const [k, v] of Object.entries(query)) {
			if (v === null || v === undefined) continue;
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
		options: { targetBytes?: number; timeoutMs?: number } = {},
	): Promise<SpeedTestResult> {
		const targetBytes = options.targetBytes ?? 2 * 1024 * 1024;
		const timeoutMs = options.timeoutMs ?? 8000;

		const pingSamples: number[] = [];
		for (let i = 0; i < 3; i++) {
			const t = performance.now();
			try {
				await this.ping();
				pingSamples.push(performance.now() - t);
			} catch {
				break;
			}
		}
		const pingMs =
			pingSamples.length > 0
				? pingSamples.reduce((a, b) => a + b, 0) / pingSamples.length
				: 0;

		let throughputMbps: number | undefined;
		let bytes: number | undefined;
		let durationMs: number | undefined;

		try {
			const resp = (await this.call("getRandomSongs", { size: 1 })) as SubsonicResponse & {
				randomSongs?: { song?: Array<{ id: string }> };
			};
			const song = resp.randomSongs?.song?.[0];
			if (song?.id) {
				const url = this.buildUrl("stream", { id: song.id, maxBitRate: 320 });
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), timeoutMs);
				try {
					const start = performance.now();
					const streamRes = await fetch(url, {
						signal: controller.signal,
						credentials: "omit",
						headers: { Range: `bytes=0-${targetBytes - 1}` },
					});
					if (streamRes.ok && streamRes.body) {
						const reader = streamRes.body.getReader();
						let total = 0;
						while (total < targetBytes) {
							const { done, value } = await reader.read();
							if (done) break;
							total += value?.byteLength ?? 0;
						}
						const elapsed = performance.now() - start;
						try {
							await reader.cancel();
						} catch {}
						bytes = total;
						durationMs = elapsed;
						if (elapsed > 0 && total > 0) {
							throughputMbps = (total * 8) / (elapsed / 1000) / 1_000_000;
						}
					}
				} finally {
					clearTimeout(timeout);
					try {
						controller.abort();
					} catch {}
				}
			}
		} catch {
			// throughput test is best-effort — empty libraries or aborted reads are fine
		}

		return { pingMs, throughputMbps, bytes, durationMs };
	}

	coverArtUrl(id: string | undefined, size?: number): string | undefined {
		if (!id) return undefined;
		return this.buildUrl("getCoverArt", size ? { id, size } : { id });
	}

	streamUrl(id: string, options: { maxBitRate?: number; format?: string } = {}): string {
		return this.buildUrl("stream", {
			id,
			maxBitRate: options.maxBitRate,
			format: options.format,
		});
	}
}
