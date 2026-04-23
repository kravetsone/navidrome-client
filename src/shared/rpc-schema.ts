import type { PresencePayload } from "./discord";
import type {
	HistoryEntryPayload,
	PersistenceSnapshot,
	StoredServerEntry,
} from "./persistence";

export interface NowPlayingMeta {
	title: string;
	artist?: string;
	album?: string;
	isPlaying: boolean;
}

export type PlayerAction = "toggle" | "play" | "pause" | "next" | "prev";

export type UpdaterState =
	| { kind: "idle" }
	| { kind: "checking" }
	| { kind: "downloading"; version: string; progress?: number }
	| { kind: "ready"; version: string }
	| { kind: "error"; message: string };

export interface DiscordRuntimePrefs {
	enabled: boolean;
	showCoverArt: boolean;
	showTimestamps: boolean;
	clearWhenPaused: boolean;
}

export type AppRPCSchema = {
	bun: {
		requests: {
			setDiscordPresence: { params: PresencePayload; response: void };
			clearDiscordPresence: { params: undefined; response: void };
			persistenceSnapshot: { params: undefined; response: PersistenceSnapshot };
			kvSet: { params: { key: string; value: unknown }; response: void };
			kvDelete: { params: { key: string }; response: void };
			serversReplaceAll: { params: { entries: StoredServerEntry[] }; response: void };
			serversDelete: { params: { id: string }; response: void };
			historyAdd: { params: { entry: HistoryEntryPayload }; response: void };
			historyClear: { params: undefined; response: void };
			setNowPlayingMeta: { params: NowPlayingMeta | null; response: void };
			updaterGetState: { params: undefined; response: UpdaterState };
			updaterCheckNow: { params: undefined; response: void };
			updaterApply: { params: undefined; response: void };
			setDiscordPrefs: { params: DiscordRuntimePrefs; response: void };
			openDataFolder: { params: undefined; response: void };
		};
		messages: {};
	};
	webview: {
		requests: {
			playerControl: { params: { action: PlayerAction }; response: void };
			updaterState: { params: UpdaterState; response: void };
		};
		messages: {};
	};
};
