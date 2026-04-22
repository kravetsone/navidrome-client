import { md5, randomSalt } from "./md5";
import {
	type ServerConfig,
	type SubsonicResponse,
	SubsonicError,
	NetworkError,
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
			throw new SubsonicError(0, `HTTP ${res.status} ${res.statusText}`);
		}

		const body = (await res.json()) as { "subsonic-response": SubsonicResponse };
		const resp = body["subsonic-response"];
		if (!resp) {
			throw new SubsonicError(0, "Malformed response: missing subsonic-response envelope");
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
}
