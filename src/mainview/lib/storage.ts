import type { ServerConfig } from "./subsonic/types";

export interface PersistedState {
	servers: ServerConfig[];
	activeServerId: string | null;
}

const STORAGE_KEY = "navidrome-client:v1";

const EMPTY: PersistedState = { servers: [], activeServerId: null };

export const storage = {
	load(): PersistedState {
		if (typeof localStorage === "undefined") return EMPTY;
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return EMPTY;
		try {
			const parsed = JSON.parse(raw) as Partial<PersistedState>;
			return {
				servers: Array.isArray(parsed.servers) ? parsed.servers : [],
				activeServerId: typeof parsed.activeServerId === "string" ? parsed.activeServerId : null,
			};
		} catch {
			return EMPTY;
		}
	},
	save(state: PersistedState): void {
		if (typeof localStorage === "undefined") return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	},
	clear(): void {
		if (typeof localStorage === "undefined") return;
		localStorage.removeItem(STORAGE_KEY);
	},
};
