import { queryOptions } from "@tanstack/solid-query";

export interface CommunityServer {
	id: string;
	name: string;
	url: string;
	username: string;
	password: string;
	type: "navidrome" | "opensubsonic" | "subsonic";
	description: string;
	flag?: string;
}

export interface CommunityServerList {
	version: number;
	updated: string;
	servers: CommunityServer[];
}

const REMOTE_URL =
	"https://raw.githubusercontent.com/kravetsone/navidrome-client/main/public-servers.json";

// Bundled fallback — mirrors public-servers.json at build time. Used when the
// remote fetch fails (offline / GitHub unreachable) so the onboarding card is
// never empty on first launch.
const FALLBACK: CommunityServerList = {
	version: 1,
	updated: "2026-04-24",
	servers: [
		{
			id: "navidrome-demo",
			name: "Navidrome Demo",
			url: "https://demo.navidrome.org",
			username: "demo",
			password: "demo",
			type: "navidrome",
			description: "Free Jamendo, NCS, blocSonic & Nine Inch Nails tracks.",
			flag: "🌐",
		},
		{
			id: "pobeda",
			name: "навидромпобеда.рф",
			url: "https://навидромпобеда.рф",
			username: "user",
			password: "password",
			type: "navidrome",
			description: "Community server.",
			flag: "🎵",
		},
		{
			id: "stupid-fish",
			name: "stupid.fish",
			url: "https://navi.stupid.fish",
			username: "anonymous",
			password: "anonymous",
			type: "navidrome",
			description: "Community-run, anonymous access.",
			flag: "🐟",
		},
	],
};

export function communityServersQuery() {
	return queryOptions({
		// Bumped to "v2" to invalidate the pre-IDN cache that persisted before
		// we switched навидромпобеда.рф from punycode to the cyrillic host.
		queryKey: ["community-servers", "v2"] as const,
		queryFn: async ({ signal }) => {
			try {
				const res = await fetch(REMOTE_URL, { signal, cache: "no-cache" });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data = (await res.json()) as CommunityServerList;
				if (!Array.isArray(data.servers)) throw new Error("bad shape");
				return data;
			} catch {
				return FALLBACK;
			}
		},
		staleTime: 12 * 60 * 60 * 1000,
		gcTime: 24 * 60 * 60 * 1000,
	});
}
